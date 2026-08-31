import type { APIRoute } from "astro";
import { DRIVE_STORAGE, SANITY_STORAGE } from "@ylx/shared";
import type { StorageType } from "@ylx/shared";
import { sanityClient, sanityWriteClient, urlFor } from "@ylx/sanity/client";
import {
  albumWithSelectionsQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";
import { thumbnailUrl, thumbnailSrcSet } from "@ylx/sanity/lib/thumbnails";
import { requireAdmin } from "../../../../../lib/auth";
import { driveThumbUrl } from "../../../../../lib/gdrive";
import { generateUniqueSlug, resolveCustomSlug, releaseSlugLock } from "../../../../../lib/slug";
import { publishAdminEvent } from "../../../../../lib/ably";
import { cascadeDeleteAlbums } from "../../../../../lib/albumDeletion";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";
import { parseJsonBody } from "../../../../../lib/requestBody";
import { MAX_TEXT_FIELD_LENGTH, MAX_SELECTIONS_UPPER_BOUND, isValidCalendarDate } from "../../../../../lib/albumValidation";
import { captureError } from "../../../../../lib/errorTracking";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

interface SanityPhotoRaw {
  _id: string;
  filename: string;
  image?: SanityImageRef;
  driveFileId?: string | null;
  driveResourceKey?: string | null;
  lqip?: string | null;
}

interface SanitySelectionRaw {
  _id: string;
  albumId: string;
  photoId: string;
  photo: SanityPhotoRaw;
  selectedAt: string;
  notes?: string;
  photographerReply?: string;
}

interface SanityAlbumDetailRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  slug: { current: string };
  customSlug?: string;
  shareCount?: number;
  lastAccessedAt?: string;
  maxSelections: number;
  status: string;
  vendorName?: string;
  storageType?: StorageType;
  photos: SanityPhotoRaw[];
  finalPhotos?: SanityPhotoRaw[] | null;
}

/** URL trio for a photo in either storage backend. Drive photos carry no
 *  Sanity image ref — their URLs derive from driveFileId, with no srcSet
 *  (fixed thumbnail sizes only) and no LQIP (BlurImage fades in instead). */
function buildPhotoUrls(photo: SanityPhotoRaw) {
  if (photo.driveFileId) {
    return {
      url: driveThumbUrl(photo.driveFileId, 1600, photo.driveResourceKey),
      thumbnailUrl: driveThumbUrl(photo.driveFileId, 400, photo.driveResourceKey),
      thumbnailSrcSet: undefined as string | undefined,
      lqip: null as string | null,
    };
  }
  // image-XOR-driveFileId is enforced at the API layer; a hand-edited Studio
  // doc could still violate it — render-safe placeholder over a hard crash.
  if (!photo.image) {
    return { url: "", thumbnailUrl: "", thumbnailSrcSet: undefined as string | undefined, lqip: null as string | null };
  }
  const { image } = photo;
  return {
    url: urlFor(image).auto("format").quality(80).url(),
    thumbnailUrl: thumbnailUrl(image),
    thumbnailSrcSet: thumbnailSrcSet(image),
    lqip: photo.lqip ?? null,
  };
}

interface SanityAlbumSlugsRaw {
  _id: string;
  slug?: { current: string };
  customSlug?: string;
}

export const GET: APIRoute = async ({ params, cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const albumId = params.id;
  if (!albumId) {
    return new Response(
      JSON.stringify({ error: "Album ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Both fetches are keyed only by albumId with no interdependency, so run
    // them concurrently to cut serverless latency.
    const [album, selections] = await Promise.all([
      sanityClient.fetch<SanityAlbumDetailRaw | null>(albumWithSelectionsQuery, {
        albumId,
      }),
      sanityClient.fetch<SanitySelectionRaw[]>(selectionsByAlbumQuery, {
        albumId,
      }),
    ]);

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const formatted = {
      id: album._id,
      title: album.title,
      clientName: album.clientName,
      eventDate: album.eventDate,
      pin: album.pin,
      slug: album.slug?.current ?? null,
      customSlug: album.customSlug,
      shareCount: album.shareCount,
      lastAccessedAt: album.lastAccessedAt,
      maxSelections: album.maxSelections,
      status: album.status,
      storageType: album.storageType === DRIVE_STORAGE ? DRIVE_STORAGE : SANITY_STORAGE,
      vendorName: album.vendorName ?? 'YLx',
      isLocked: album.status !== 'active',
      photos: (album.photos ?? []).map((p) => ({
        id: p._id,
        filename: p.filename,
        ...buildPhotoUrls(p),
      })),
      selections: selections.map((s) => ({
        id: s._id,
        albumId: s.albumId,
        photoId: s.photoId,
        photo: {
          id: s.photo._id,
          filename: s.photo.filename,
          ...buildPhotoUrls(s.photo),
        },
        selectedAt: s.selectedAt,
        notes: s.notes,
        photographerReply: s.photographerReply,
      })),
      finalPhotos: (album.finalPhotos ?? []).map((p) => ({
        id: p._id,
        filename: p.filename,
        ...buildPhotoUrls(p),
      })),
    };

    // Response includes the album's PIN (sensitive), so it must never be
    // cached — mirrors the `Cache-Control` header on the list endpoint in
    // `albums.ts`.
    return new Response(JSON.stringify({ album: formatted }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[Albums] GET album failed:", albumId, error);
    captureError(error, { route: "admin/albums/[id] GET", albumId });
    return new Response(
      JSON.stringify({ error: "Failed to fetch album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

interface UpdateAlbumBody {
  title?: string;
  clientName?: string;
  eventDate?: string;
  pin?: string;
  maxSelections?: number;
  customSlug?: string;
  vendorName?: string;
}

/** Validates a raw parsed body and narrows it into an `UpdateAlbumBody` on
 *  success, or returns an error message for the first invalid field. Every
 *  field is optional — only fields present in the body are checked. */
function validateUpdateAlbumBody(body: Record<string, unknown>): { error: string } | { value: UpdateAlbumBody } {
  const { title, clientName, eventDate, pin, maxSelections, customSlug, vendorName } = body;

  if (title !== undefined) {
    if (typeof title !== "string" || title.length === 0 || title.length > MAX_TEXT_FIELD_LENGTH) {
      return { error: `title must be a non-empty string of at most ${MAX_TEXT_FIELD_LENGTH} characters` };
    }
  }
  if (clientName !== undefined) {
    if (typeof clientName !== "string" || clientName.length === 0 || clientName.length > MAX_TEXT_FIELD_LENGTH) {
      return { error: `clientName must be a non-empty string of at most ${MAX_TEXT_FIELD_LENGTH} characters` };
    }
  }
  if (eventDate !== undefined) {
    if (typeof eventDate !== "string" || !isValidCalendarDate(eventDate)) {
      return { error: "eventDate must be a valid calendar date in YYYY-MM-DD format" };
    }
  }
  if (pin !== undefined) {
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
      return { error: "PIN must be exactly 4 digits" };
    }
  }
  if (maxSelections !== undefined) {
    if (
      typeof maxSelections !== "number" ||
      !Number.isInteger(maxSelections) ||
      maxSelections < 1 ||
      maxSelections > MAX_SELECTIONS_UPPER_BOUND
    ) {
      return { error: `maxSelections must be an integer between 1 and ${MAX_SELECTIONS_UPPER_BOUND}` };
    }
  }
  if (customSlug !== undefined) {
    if (typeof customSlug !== "string" || customSlug.length > MAX_TEXT_FIELD_LENGTH) {
      return { error: `customSlug must be a string of at most ${MAX_TEXT_FIELD_LENGTH} characters` };
    }
  }
  if (vendorName !== undefined) {
    if (typeof vendorName !== "string" || vendorName.trim().length === 0 || vendorName.trim().length > 80) {
      return { error: "vendorName must be a non-empty string of at most 80 characters" };
    }
  }

  return { value: { title, clientName, eventDate, pin, maxSelections, customSlug, vendorName } };
}

/** `undefined` = leave the field untouched, `null` = clear it, a string =
 *  the newly resolved value. Isolated here (rather than inline in PUT) so
 *  the empty-string/invalid/taken branches don't add to PUT's own complexity. */
async function resolveCustomSlugForUpdate(
  customSlug: string | undefined,
  albumId: string,
  currentCustomSlug: string | undefined
): Promise<{ error: string } | { value: string | null | undefined }> {
  if (customSlug === undefined) return { value: undefined };
  if (customSlug === "") {
    // Clearing the field: no new slug to reserve, just free the old one.
    await releaseSlugLock(currentCustomSlug);
    return { value: null };
  }

  const resolved = await resolveCustomSlug(customSlug, albumId, currentCustomSlug);
  if (!resolved) return { error: "Custom slug is invalid or already taken" };
  return { value: resolved };
}

async function buildAlbumPatch(
  body: UpdateAlbumBody,
  albumId: string,
  resolvedCustomSlug: string | null | undefined,
  currentSlug: string | undefined
) {
  const { title, clientName, eventDate, pin, maxSelections, vendorName } = body;
  const patch: Record<string, unknown> = {};

  if (title !== undefined) {
    patch.title = title;
    patch.slug = { _type: "slug", current: await generateUniqueSlug(title, albumId, currentSlug) };
  }
  if (clientName !== undefined) patch.clientName = clientName;
  if (eventDate !== undefined) patch.eventDate = eventDate;
  if (pin !== undefined) patch.pin = pin;
  if (maxSelections !== undefined) patch.maxSelections = maxSelections;
  if (vendorName !== undefined) patch.vendorName = vendorName.trim();
  // `null` means "clear it" — `.set()` would store a literal null instead
  // of unsetting the field, so it's routed to `.unset()` by the caller.
  if (resolvedCustomSlug) patch.customSlug = resolvedCustomSlug;

  return patch;
}

export const PUT: APIRoute = async ({ params, cookies, request }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const albumId = params.id;
  if (!albumId) {
    return new Response(
      JSON.stringify({ error: "Album ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Set by the nested catch below (once it captures a patch failure to
  // Sentry), so the outer catch — which re-catches the same rethrown error —
  // knows not to send a duplicate event for it.
  let patchErrorCaptured = false;

  try {
    // Verify album exists before patching; slug/customSlug are needed so a
    // rename can release the old reservation lock once the new one is secured.
    const existingAlbum = await sanityClient.fetch<SanityAlbumSlugsRaw | null>(
      `*[_type == "album" && _id == $id][0]{_id, slug, customSlug}`,
      { id: albumId }
    );
    if (!existingAlbum) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsedBody = await parseJsonBody(request);
    if (!parsedBody) {
      return new Response(
        JSON.stringify({ error: "Request body must be a valid JSON object" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const validation = validateUpdateAlbumBody(parsedBody);
    if ("error" in validation) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const body = validation.value;
    const { pin, maxSelections, customSlug } = body;

    const customSlugResult = await resolveCustomSlugForUpdate(customSlug, albumId, existingAlbum.customSlug);
    if ("error" in customSlugResult) {
      return new Response(
        JSON.stringify({ error: customSlugResult.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const resolvedCustomSlug = customSlugResult.value;

    // Note: past-date validation is intentionally NOT enforced on edit.
    // Albums whose event has already occurred (e.g. a finished wedding) must
    // remain editable. New albums still enforce the future-date rule in the
    // POST create handler (`albums.ts`).

    // Track newly created slug locks so they can be rolled back if commit fails.
    // `patch.slug` exists when title changed (new auto-slug), `resolvedCustomSlug`
    // when customSlug changed. `resolveCustomSlugForUpdate` above already reserved
    // the customSlug lock; `newSlugLock` is assigned once `buildAlbumPatch` (which
    // may call `generateUniqueSlug`) has run inside the try below.
    let newSlugLock: string | undefined;
    const newCustomSlugLock = resolvedCustomSlug;

    try {
      const patch = await buildAlbumPatch(body, albumId, resolvedCustomSlug, existingAlbum.slug?.current);
      const unsetFields = resolvedCustomSlug === null ? ["customSlug"] : [];

      if (Object.keys(patch).length === 0 && unsetFields.length === 0) {
        return new Response(
          JSON.stringify({ error: "No fields to update" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      newSlugLock = patch.slug ? (patch.slug as { current: string }).current : undefined;

      const updated = await sanityWriteClient
        .patch(albumId)
        .set(patch)
        .unset(unsetFields)
        .commit();

      await invalidateCache([
        CACHE_KEYS.albumsList(),
        ...(existingAlbum.slug?.current ? [CACHE_KEYS.albumBySlug(existingAlbum.slug.current)] : []),
        ...(newSlugLock && newSlugLock !== existingAlbum.slug?.current ? [CACHE_KEYS.albumBySlug(newSlugLock)] : []),
        ...(existingAlbum.customSlug ? [CACHE_KEYS.albumBySlug(existingAlbum.customSlug)] : []),
        ...(resolvedCustomSlug && resolvedCustomSlug !== existingAlbum.customSlug ? [CACHE_KEYS.albumBySlug(resolvedCustomSlug)] : []),
      ]);
      // Notify open admin dashboards so they refetch. publishAdminEvent never
      // throws (failures are logged inside), so an already-committed update
      // can't turn into a 500 here.
      await publishAdminEvent("album:updated", { albumId });

      return new Response(
        JSON.stringify({
          album: {
            id: updated._id,
            title: updated.title as string,
            clientName: updated.clientName as string,
            eventDate: updated.eventDate as string,
            pin: updated.pin as string,
            maxSelections: updated.maxSelections as number,
            status: updated.status as string,
            customSlug: updated.customSlug as string | undefined,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (patchError) {
      // Album patch failed after slug locks were reserved — release the NEW
      // locks so these slug values can be reused. The old locks (if any) were
      // already released by generateUniqueSlug/resolveCustomSlug when the new
      // ones were secured, so we don't re-reserve those here.
      // Best-effort: lock release failure must not mask the original error.
      console.error("[Albums] PUT patch failed, releasing new slug locks:", patchError);
      captureError(patchError, { route: "admin/albums/[id] PUT patch", albumId });
      patchErrorCaptured = true;
      if (newSlugLock && newSlugLock !== existingAlbum.slug?.current) {
        // releaseSlugLock() never rejects (its own catch reports failures
        // via captureError already) — this try/catch can't actually observe
        // anything, kept only as defensive belt-and-suspenders.
        try { await releaseSlugLock(newSlugLock); } catch (e) { console.error("[Albums] Failed to release slug lock:", e); }
      }
      if (newCustomSlugLock && newCustomSlugLock !== existingAlbum.customSlug) {
        try { await releaseSlugLock(newCustomSlugLock); } catch (e) { console.error("[Albums] Failed to release custom slug lock:", e); }
      }
      throw patchError;
    }
  } catch (error) {
    console.error("[Albums] PUT update album failed:", albumId, error);
    if (!patchErrorCaptured) {
      captureError(error, { route: "admin/albums/[id] PUT", albumId });
    }
    return new Response(
      JSON.stringify({ error: "Failed to update album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const albumId = params.id;
  if (!albumId) {
    return new Response(
      JSON.stringify({ error: "Album ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Fetch album slug and customSlug for cache invalidation before deletion
    const album = await sanityClient.fetch<{ slug?: { current: string }; customSlug?: string } | null>(
      `*[_type == "album" && _id == $albumId][0]{ slug, customSlug }`,
      { albumId }
    );

    // Cascade-delete the album with its selections, submissions, and photos.
    await cascadeDeleteAlbums([albumId]);

    await invalidateCache([
      CACHE_KEYS.albumsList(),
      CACHE_KEYS.albumSelections(albumId),
      ...(album?.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album?.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await publishAdminEvent("album:deleted", { albumId });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Albums] DELETE album failed:", albumId, error);
    captureError(error, { route: "admin/albums/[id] DELETE", albumId });
    return new Response(
      JSON.stringify({ error: "Failed to delete album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
