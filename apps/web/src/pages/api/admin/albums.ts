import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { allAlbumsQuery } from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../lib/auth";
import { generateUniqueSlug, resolveCustomSlug, releaseSlugLock } from "../../../lib/slug";
import { publishAdminEvent } from "../../../lib/ably";
import { getCached, invalidateCache, cacheGetRaw, CACHE_KEYS } from "../../../lib/cache";
import { parseJsonBody } from "../../../lib/requestBody";
import { MAX_TEXT_FIELD_LENGTH, MAX_SELECTIONS_UPPER_BOUND, isValidCalendarDate } from "../../../lib/albumValidation";
import type { GalleryDraftProgress } from "../gallery/[slug]/draft";

interface SanityAlbumRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  status: string;
  photoCount: number;
  maxSelections: number;
  selectionCount: number;
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
    const albums = await getCached(CACHE_KEYS.albumsList(), 30, 120, () =>
      sanityClient.fetch<SanityAlbumRaw[]>(allAlbumsQuery)
    );

    // Live draft progress is read fresh (outside the 30s SWR cache) so the
    // dashboard reflects a client's in-progress picks without waiting for
    // the album list cache to expire. One MGET round-trip for all albums.
    const drafts = await cacheGetRaw<GalleryDraftProgress>(
      albums.map((album) => CACHE_KEYS.galleryDraft(album._id))
    );

    const formatted = albums.map((album, i) => ({
      id: album._id,
      title: album.title,
      clientName: album.clientName,
      eventDate: album.eventDate,
      pin: album.pin,
      status: album.status,
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
    return new Response(
      JSON.stringify({ error: "Failed to fetch albums" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

interface CreateAlbumBody {
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number;
  customSlug?: string;
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
  // Compare in local timezone.
  const today = new Date().toLocaleDateString("en-CA");
  if (eventDate < today) {
    return { error: "Event date cannot be in the past" };
  }
  return { value: { title, clientName, eventDate, pin, maxSelections, customSlug } };
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

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
    const { title, clientName, eventDate, pin, maxSelections, customSlug } = validation.value;

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
        photos: [],
      });

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
      if (createdSlugLock) {
        try { await releaseSlugLock(createdSlugLock); } catch (e) { console.error("[Albums] Failed to release slug lock:", e); }
      }
      if (createdCustomSlugLock) {
        try { await releaseSlugLock(createdCustomSlugLock); } catch (e) { console.error("[Albums] Failed to release custom slug lock:", e); }
      }
      throw createError;
    }
  } catch (error) {
    console.error("[Albums] POST failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
