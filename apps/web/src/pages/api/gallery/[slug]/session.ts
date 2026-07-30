import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { albumBySlugQuery } from "@ylx/sanity/lib/queries";
import { hasAlbumAccess, hasActiveSession } from "../../../../lib/gallerySession";
import { isRateLimited, RATE_LIMIT_RETRY_AFTER } from "../../../../lib/ratelimit";
import { getCached, CACHE_KEYS } from "../../../../lib/cache";
import { buildGalleryAlbumResponse, type SanityAlbumRaw } from "../../../../lib/galleryAlbumResponse";

// Generous: a resumed gallery fires one lookup per page load, so 30 per
// 15-min window per IP+slug leaves headroom for reload-happy visitors while
// bounding slug enumeration by clients holding an unrelated session cookie.
const MAX_SESSION_LOOKUPS_PER_IP = 30;

// Resume a gallery session without re-entering the PIN: the signed httpOnly
// `gallery_pin_session` cookie (set by verify.ts, 24h) already proves PIN
// knowledge, but the client can't read it — this endpoint turns it into the
// same album payload verify.ts returns. No shareCount side effects (this is
// a resume, not a new share visit).
export const GET: APIRoute = async ({ params, cookies, clientAddress }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cheap gate before any Sanity work: a client with no valid signed gallery
  // cookie can't force album lookups by enumerating slugs. Same uniform 401
  // shape as the post-lookup access check below.
  if (!hasActiveSession(cookies)) {
    return new Response(JSON.stringify({ error: "No active gallery session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Clients holding a session cookie for album A can still probe slugs B, C…
  // (each probe costs one cached Sanity read), so bound per IP+slug. Same
  // missing-address guard as verify.ts/draft.ts — no shared "unknown"
  // production bucket.
  if (!clientAddress && import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: "Unable to determine client address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const ip = clientAddress ?? "unknown";
  if (await isRateLimited(`session:${ip}:${slug}`, MAX_SESSION_LOOKUPS_PER_IP)) {
    return new Response(
      JSON.stringify({ error: "Too many attempts. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": RATE_LIMIT_RETRY_AFTER,
        },
      }
    );
  }

  let album: SanityAlbumRaw | null;
  try {
    album = await getCached<SanityAlbumRaw | null>(
      CACHE_KEYS.albumBySlug(slug),
      30,
      120,
      () => sanityClient.fetch<SanityAlbumRaw | null>(albumBySlugQuery, { slug })
    );
  } catch (err) {
    // Sanity/Upstash outage escapes getCached on a hard-miss — never leak
    // internals, just log and return a generic 500 (REVIEW.md §2.2).
    console.error("[Session] album lookup failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

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
