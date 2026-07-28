import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { albumBySlugQuery } from "@ylx/sanity/lib/queries";
import { hasActiveSession, hasAlbumAccess } from "../../../../lib/gallerySession";
import { getCached, CACHE_KEYS } from "../../../../lib/cache";
import { buildGalleryAlbumResponse, type SanityAlbumRaw } from "../../../../lib/galleryAlbumResponse";

// Resume a gallery session without re-entering the PIN: the signed httpOnly
// `gallery_pin_session` cookie (set by verify.ts, 24h) already proves PIN
// knowledge, but the client can't read it — this endpoint turns it into the
// same album payload verify.ts returns. No PIN handling, so no rate limiting
// beyond what the cookie signature enforces; no shareCount side effects
// (this is a resume, not a new share visit).
export const GET: APIRoute = async ({ params, cookies }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cheap guard: reject unsigned/expired cookies before any Sanity or cache
  // lookup so unauthenticated probes can't trigger downstream work.
  if (!hasActiveSession(cookies)) {
    return new Response(JSON.stringify({ error: "No active gallery session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const album = await getCached<SanityAlbumRaw | null>(
    CACHE_KEYS.albumBySlug(slug),
    30,
    120,
    () => sanityClient.fetch<SanityAlbumRaw | null>(albumBySlugQuery, { slug })
  );

  // A 404-vs-401 distinction would let an unauthenticated visitor probe
  // which slugs exist; both cases return the same 401.
  if (!album || !hasAlbumAccess(cookies, album._id)) {
    return new Response(JSON.stringify({ error: "No active gallery session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(buildGalleryAlbumResponse(album)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
