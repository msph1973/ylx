import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { allAlbumsQuery, allAlbumPinsQuery } from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../lib/auth";
import { generateUniqueSlug, resolveCustomSlug, releaseSlugLock } from "../../../lib/slug";
import { publishAdminEvent } from "../../../lib/ably";
import { getCached, invalidateCache, cacheGetRaw, CACHE_KEYS } from "../../../lib/cache";
import { parseJsonBody } from "../../../lib/requestBody";
import { MAX_TEXT_FIELD_LENGTH, MAX_SELECTIONS_UPPER_BOUND, MAX_DRIVE_PHOTOS, isValidCalendarDate } from "../../../lib/albumValidation";
import { FOLDER_ID_PATTERN } from "../../../lib/gdrive";
import { captureError } from "../../../lib/errorTracking";
import type { GalleryDraftProgress } from "../gallery/[slug]/draft";

interface SanityAlbumRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: string;
  photoCount: number;
  maxSelections: number;
  selectionCount: number;
  storageType?: string;
}

interface AlbumPinRecord {
  _id: string;
  pin: string;
}

export const GET: APIRoute = async ({ cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // The album list and the PIN list are independent reads, so run them
    // concurrently to cut serverless latency.
    const [albums, pinRecords] = await Promise.all([
      getCached(CACHE_KEYS.albumsList(), 30, 120, () =>
        sanityClient.fetch<SanityAlbumRaw[]>(allAlbumsQuery)
      ),
      // PINs are fetched fresh (never through the 30s/120s SWR cache above) so
      // they're never copied into Upstash — allAlbumsQuery intentionally no
      // longer projects `pin` for exactly this reason.
      sanityClient.fetch<AlbumPinRecord[]>(allAlbumPinsQuery),
    ]);
    const pinsById = new Map(pinRecords.map((r) => [r._id, r.pin]));

    // Live draft progress is read fresh (outside the 30s SWR cache) so the
    // dashboard reflects a client's in-progress picks without waiting for
    // the album list cache to expire. One MGET round-trip for all albums.
    // Depends on the album IDs above, so it can't join the Promise.all.
    const drafts = await cacheGetRaw<GalleryDraftProgress>(
      albums.map((album) => CACHE_KEYS.galleryDraft(album._id))
    );

    const formatted = albums.map((album, i) => ({
      id: album._id,
      title: album.title,
      clientName: album.clientName,
      eventDate: album.eventDate,
      status: album.status,
      storageType: album.storageType === "drive" ? "drive" : "sanity",
      photoCount: album.photoCount,
      maxSelections: album.maxSelections,
      selectionCount: album.selectionCount,
      draftCount: drafts[i]?.count ?? null,
      draftUpdatedAt: drafts[i]?.updatedAt ?? null,
    }));

    // Response carries each album's PIN (sensitive) plus live draft progress,
    // so it must never be reused from any HTTP cache — realtime-triggered
    // refetches need the freshest data, and `no-store` also keeps the PIN off
    // shared/CDN caches.
    return new Response(JSON.stringify({ albums: formatted }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[Albums] GET failed:", error);
    captureError(error, { route: "admin/albums GET" });
    return new Response(
      JSON.stringify({ error: "Failed to fetch albums" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

/** One scanned Drive image, passed through from the scan-drive preview. */
interface DrivePhotoInput {
  id: string;
  name: string;
}

interface CreateAlbumBody {
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number;
  customSlug?: string;
  storageType: "sanity" | "drive";
  driveFolderId?: string;
  photos?: DrivePhotoInput[];
}

/** Validates a raw parsed body and narrows it into a `CreateAlbumBody` on
 *  success, or returns an error message for the first invalid field. */
function validateCreateAlbumBody(body: Record<string, unknown>): { error: string } | { value: CreateAlbumBody } {
  const { title, clientName, eventDate, pin, maxSelections, customSlug } = body;

  if (!title || !clientName || !eventDate || !pin || !maxSelections) {
    return { error: "All fields are required: title, clientName, eventDate, pin, maxSelections" };
  }
  if (typeof title !== "string" || title.length > MAX_TEXT_FIELD_LENGTH) {
    return { error: `title must be a string of at most ${MAX_TEXT_FIELD_LENGTH} characters` };
  }
  if (typeof clientName !== "string" || clientName.length > MAX_TEXT_FIELD_LENGTH) {
    return { error: `clientName must be a string of at most ${MAX_TEXT_FIELD_LENGTH} characters` };
  }
  if (typeof eventDate !== "string" || !isValidCalendarDate(eventDate)) {
    return { error: "eventDate must be a valid calendar date in YYYY-MM-DD format" };
  }
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return { error: "PIN must be exactly 4 digits" };
  }
  if (
    typeof maxSelections !== "number" ||
    !Number.isInteger(maxSelections) ||
    maxSelections < 1 ||
    maxSelections > MAX_SELECTIONS_UPPER_BOUND
  ) {
    return { error: `maxSelections must be an integer between 1 and ${MAX_SELECTIONS_UPPER_BOUND}` };
  }
  if (customSlug !== undefined) {
    if (typeof customSlug !== "string" || customSlug.length > MAX_TEXT_FIELD_LENGTH) {
      return { error: `customSlug must be a string of at most ${MAX_TEXT_FIELD_LENGTH} characters` };
    }
  }
  // Drive-backed albums carry their scanned photo list inline. Legacy
  // clients (and existing tests) omit storageType entirely → sanity.
  const storageType = body.storageType === undefined ? "sanity" : body.storageType;
  if (storageType !== "sanity" && storageType !== "drive") {
    return { error: "storageType must be 'sanity' or 'drive'" };
  }

  let driveFolderId: string | undefined;
  let photos: DrivePhotoInput[] | undefined;
  if (storageType === "drive") {
    if (typeof body.driveFolderId !== "string" || !FOLDER_ID_PATTERN.test(body.driveFolderId)) {
      return { error: "driveFolderId is required for Google Drive albums" };
    }
    driveFolderId = body.driveFolderId;

    if (body.photos !== undefined) {
      if (!Array.isArray(body.photos) || body.photos.length > MAX_DRIVE_PHOTOS) {
        return { error: `photos must be an array of at most ${MAX_DRIVE_PHOTOS} Drive file references` };
      }
      photos = [];
      for (const item of body.photos) {
        if (typeof item !== "object" || item === null) {
          return { error: "photos must be an array of { id, name } Drive file references" };
        }
        const { id, name } = item as Record<string, unknown>;
        if (typeof id !== "string" || !FOLDER_ID_PATTERN.test(id)) {
          return { error: "Each photo needs a valid Google Drive file id" };
        }
        if (typeof name !== "string" || name.trim().length === 0 || name.length > MAX_TEXT_FIELD_LENGTH) {
          return { error: "Each photo needs a filename of 1-200 characters" };
        }
        photos.push({ id, name: name.trim() });
      }
    }
  } else if (body.driveFolderId !== undefined || body.photos !== undefined) {
    return { error: "driveFolderId/photos are only allowed when storageType is 'drive'" };
  }

  // Compare in local timezone.
  const today = new Date().toLocaleDateString("en-CA");
  if (eventDate < today) {
    return { error: "Event date cannot be in the past" };
  }
  return { value: { title, clientName, eventDate, pin, maxSelections, customSlug, storageType, driveFolderId, photos } };
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Set by the nested catch below (once it captures a creation failure to
  // Sentry), so the outer catch — which re-catches the same rethrown error —
  // knows not to send a duplicate event for it. Declared out here (not
  // inside the try) so both the nested catch and the outer catch can see it.
  let creationErrorCaptured = false;

  try {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody) {
      return new Response(
        JSON.stringify({ error: "Request body must be a valid JSON object" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const validation = validateCreateAlbumBody(parsedBody);
    if ("error" in validation) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { title, clientName, eventDate, pin, maxSelections, customSlug, storageType, driveFolderId, photos } = validation.value;

    // Pre-generated so the slug/customSlug reservation locks (created before
    // the album document itself) can record which album owns each one.
    const albumId = randomUUID();

    let resolvedCustomSlug: string | undefined;
    if (customSlug) {
      resolvedCustomSlug = (await resolveCustomSlug(customSlug, albumId)) ?? undefined;
      if (!resolvedCustomSlug) {
        return new Response(
          JSON.stringify({ error: "Custom slug is invalid or already taken" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    let createdSlugLock: string | undefined;
    let createdCustomSlugLock: string | undefined = resolvedCustomSlug;

    try {
      const slug = await generateUniqueSlug(title, albumId);
      createdSlugLock = slug;

      const doc = await sanityWriteClient.create({
        _id: albumId,
        _type: "album",
        title,
        slug: { _type: "slug", current: slug },
        ...(resolvedCustomSlug ? { customSlug: resolvedCustomSlug } : {}),
        clientName,
        eventDate,
        pin,
        maxSelections,
        status: "active",
        storageType,
        ...(driveFolderId ? { driveFolderId } : {}),
        photos: [],
      });

      // Drive ingestion: one lightweight `photo` doc per scanned image, wired
      // into album.photos inside a single transaction so docs-without-refs or
      // refs-without-docs can never exist. Binaries stay in Drive — these
      // documents are metadata only (filename + driveFileId).
      if (storageType === "drive" && photos && photos.length > 0) {
        const photoDocs = photos.map((photo) => ({
          _type: "photo",
          _id: randomUUID(),
          filename: photo.name,
          driveFileId: photo.id,
          album: { _type: "reference", _ref: albumId },
        }));
        const transaction = sanityWriteClient.transaction();
        for (const photoDoc of photoDocs) {
          transaction.create(photoDoc);
        }
        transaction.patch(albumId, {
          set: { photos: photoDocs.map((photoDoc) => ({ _type: "reference", _ref: photoDoc._id })) },
        });
        await transaction.commit();
      }
      await invalidateCache(CACHE_KEYS.albumsList());
      await publishAdminEvent("album:created", { albumId: doc._id });

      return new Response(
        JSON.stringify({
          album: {
            id: doc._id,
            title: doc.title as string,
            clientName: doc.clientName as string,
            eventDate: doc.eventDate as string,
            pin: doc.pin as string,
            maxSelections: doc.maxSelections as number,
            status: doc.status as string,
            photoCount: 0,
            customSlug: doc.customSlug as string | undefined,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    } catch (createError) {
      // Album creation failed after slug locks were reserved — release them
      // so these slug values can be reused by future albums.
      // Best-effort: lock release failure must not mask the original error.
      console.error("[Albums] Album creation failed, releasing slug locks:", createError);
      captureError(createError, { route: "admin/albums POST create", albumId });
      creationErrorCaptured = true;
      if (createdSlugLock) {
        // releaseSlugLock() never rejects (its own catch reports failures
        // via captureError already) — this try/catch can't actually observe
        // anything, kept only as defensive belt-and-suspenders.
        try { await releaseSlugLock(createdSlugLock); } catch (e) { console.error("[Albums] Failed to release slug lock:", e); }
      }
      if (createdCustomSlugLock) {
        try { await releaseSlugLock(createdCustomSlugLock); } catch (e) { console.error("[Albums] Failed to release custom slug lock:", e); }
      }
      throw createError;
    }
  } catch (error) {
    console.error("[Albums] POST failed:", error);
    if (!creationErrorCaptured) {
      captureError(error, { route: "admin/albums POST" });
    }
    return new Response(
      JSON.stringify({ error: "Failed to create album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
