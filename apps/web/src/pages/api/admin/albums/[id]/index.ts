import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient, urlFor } from "@ylx/sanity/client";
import {
  albumWithSelectionsQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../../../lib/auth";
import { generateUniqueSlug, resolveCustomSlug, releaseSlugLock } from "../../../../../lib/slug";
import { publishAdminEvent } from "../../../../../lib/ably";
import { cascadeDeleteAlbums } from "../../../../../lib/albumDeletion";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

interface SanityPhotoRaw {
  _id: string;
  filename: string;
  image: SanityImageRef;
  lqip?: string | null;
}

/** Build a square, cropped thumbnail URL for an uploaded photo.
 *  `.auto("format")` serves WebP/AVIF where supported and `.quality()` tunes
 *  compression — both were missing, so the admin grid downloaded full-quality
 *  originals for tiles that only render ~100-130px. */
function thumbnailUrl(image: SanityImageRef): string {
  return urlFor(image)
    .width(400)
    .height(400)
    .fit("crop")
    .auto("format")
    .quality(75)
    .url();
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
  photos: SanityPhotoRaw[];
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

  try {
    const albumId = params.id;
    if (!albumId) {
      return new Response(
        JSON.stringify({ error: "Album ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const album = await sanityClient.fetch<SanityAlbumDetailRaw | null>(albumWithSelectionsQuery, {
      albumId,
    });

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const selections = await sanityClient.fetch<SanitySelectionRaw[]>(selectionsByAlbumQuery, {
      albumId,
    });

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
      isLocked: album.status !== 'active',
      photos: (album.photos ?? []).map((p) => ({
        id: p._id,
        filename: p.filename,
        url: urlFor(p.image).auto("format").quality(80).url(),
        thumbnailUrl: thumbnailUrl(p.image),
        lqip: p.lqip ?? null,
      })),
      selections: selections.map((s) => ({
        id: s._id,
        albumId: s.albumId,
        photoId: s.photoId,
        photo: {
          id: s.photo._id,
          filename: s.photo.filename,
          url: urlFor(s.photo.image).auto("format").quality(80).url(),
          thumbnailUrl: thumbnailUrl(s.photo.image),
          lqip: s.photo.lqip ?? null,
        },
        selectedAt: s.selectedAt,
        notes: s.notes,
        photographerReply: s.photographerReply,
      })),
    };

    return new Response(JSON.stringify({ album: formatted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
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
}

function validatePinAndMaxSelections(pin?: string, maxSelections?: number): string | null {
  if (pin !== undefined && !/^\d{4}$/.test(pin)) {
    return "PIN must be exactly 4 digits";
  }
  if (maxSelections !== undefined && (typeof maxSelections !== "number" || maxSelections < 1)) {
    return "maxSelections must be a positive number";
  }
  return null;
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
  const { title, clientName, eventDate, pin, maxSelections } = body;
  const patch: Record<string, unknown> = {};

  if (title !== undefined) {
    patch.title = title;
    patch.slug = { _type: "slug", current: await generateUniqueSlug(title, albumId, currentSlug) };
  }
  if (clientName !== undefined) patch.clientName = clientName;
  if (eventDate !== undefined) patch.eventDate = eventDate;
  if (pin !== undefined) patch.pin = pin;
  if (maxSelections !== undefined) patch.maxSelections = maxSelections;
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

    const body = await request.json() as UpdateAlbumBody;
    const { pin, maxSelections, customSlug } = body;

    const validationError = validatePinAndMaxSelections(pin, maxSelections);
    if (validationError) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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

    const patch = await buildAlbumPatch(body, albumId, resolvedCustomSlug, existingAlbum.slug?.current);
    const unsetFields = resolvedCustomSlug === null ? ["customSlug"] : [];

    if (Object.keys(patch).length === 0 && unsetFields.length === 0) {
      return new Response(
        JSON.stringify({ error: "No fields to update" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const updated = await sanityWriteClient
      .patch(albumId)
      .set(patch)
      .unset(unsetFields)
      .commit();

    // Notify open admin dashboards so they refetch. Guarded so a realtime
    // failure can't turn an already-committed update into a 500.
    try {
      publishAdminEvent("album:updated", { albumId });
    } catch (eventError) {
      console.error("[Albums] PUT publish event failed:", eventError);
    }
    await invalidateCache(CACHE_KEYS.albumsList());

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
  } catch (error) {
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
    // Cascade-delete the album with its selections, submissions, and photos.
    await cascadeDeleteAlbums([albumId]);

    publishAdminEvent("album:deleted", { albumId });
    await invalidateCache([CACHE_KEYS.albumsList(), CACHE_KEYS.albumSelections(albumId)]);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to delete album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
