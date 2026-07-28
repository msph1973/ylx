import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { albumBySlugQuery } from "@ylx/sanity/lib/queries";
import { hasAlbumAccess } from "../../../../lib/gallerySession";
import { getCached, cacheSetRaw, cacheGetRaw, CACHE_KEYS } from "../../../../lib/cache";
import { publishAdminEvent } from "../../../../lib/ably";
import type { SanityAlbumRaw } from "../../../../lib/galleryAlbumResponse";

export interface GalleryDraftProgress {
  count: number;
  seq: number;
  updatedAt: number;
}

const DRAFT_TTL_SECONDS = 24 * 60 * 60; // matches the gallery PIN session

// Live draft progress for the admin dashboard: the client reports only HOW
// MANY photos are currently picked (never which ones — those stay private
// until submit). Informational feature, so every failure path is a cheap
// 4xx/no-op rather than anything that could disturb the gallery.
export const PUT: APIRoute = async ({ params, cookies, request }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const album = await getCached<SanityAlbumRaw | null>(
    CACHE_KEYS.albumBySlug(slug),
    30,
    120,
    () => sanityClient.fetch<SanityAlbumRaw | null>(albumBySlugQuery, { slug })
  );

  // Same uniform 401 as session.ts so unauthenticated callers can't probe slugs.
  if (!album || !hasAlbumAccess(cookies, album._id)) {
    return new Response(JSON.stringify({ error: "No active gallery session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (album.status !== "active") {
    return new Response(JSON.stringify({ error: "Album is not accepting selections" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const count = (body as Record<string, unknown> | null)?.count;
  const seq = (body as Record<string, unknown> | null)?.seq;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > album.maxSelections
  ) {
    return new Response(JSON.stringify({ error: "count must be an integer between 0 and maxSelections" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Reject out-of-order writes: a debounced PUT arriving after a later
  // sendBeacon flush must not overwrite the fresher count with a stale one.
  if (typeof seq === "number") {
    const [previous] = await cacheGetRaw<GalleryDraftProgress>([CACHE_KEYS.galleryDraft(album._id)]);
    if (previous && previous.seq > seq) {
      return new Response(JSON.stringify({ success: true, discarded: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const progress: GalleryDraftProgress = { count, seq: typeof seq === "number" ? seq : 0, updatedAt: Date.now() };
  await cacheSetRaw(CACHE_KEYS.galleryDraft(album._id), progress, DRAFT_TTL_SECONDS);
  await publishAdminEvent("draft:progress", { albumId: album._id, count });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// navigator.sendBeacon can only send POST — the pagehide flush in
// GalleryPage relies on this alias.
export const POST = PUT;
