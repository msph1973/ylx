import { timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { albumBySlugQuery, albumPinBySlugQuery } from "@ylx/sanity/lib/queries";
import {
  isLimitReached,
  isRateLimited,
  RATE_LIMIT_RETRY_AFTER,
  recordFailedAttempt,
} from "../../../../lib/ratelimit";
import { grantAlbumAccess } from "../../../../lib/gallerySession";
import { getCached, invalidateCache, CACHE_KEYS } from "../../../../lib/cache";
import { buildGalleryAlbumResponse, type SanityAlbumRaw } from "../../../../lib/galleryAlbumResponse";
import { captureError } from "../../../../lib/errorTracking";

const MAX_ATTEMPTS_PER_IP = 5;
const MAX_FAILED_ATTEMPTS_PER_ALBUM = 30;

interface AlbumPinRecord {
  _id: string;
  pin: string;
}

function pinMatches(expected: string, provided: string): boolean {
  // Defensive: a non-string here would make Buffer.from throw (TypeError -> 500).
  // Guard so a malformed input degrades to a clean "no match" instead of a crash.
  if (typeof expected !== "string" || typeof provided !== "string") {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ params, request, clientAddress, cookies }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limiting: per IP+slug, plus a global per-slug cap on *failed*
  // attempts so an attacker rotating IPs (or spoofing forwarded headers)
  // cannot get unlimited fresh buckets against one album, while successful
  // logins by many guests never lock the album. `clientAddress` is the
  // socket peer address resolved by the platform adapter, not a
  // client-supplied header.
  if (!clientAddress && import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: "Unable to determine client address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const ip = clientAddress ?? "unknown";
  const albumKey = `album:${slug}`;

  const [ipLimited, albumLimited] = await Promise.all([
    isRateLimited(`${ip}:${slug}`, MAX_ATTEMPTS_PER_IP),
    isLimitReached(albumKey, MAX_FAILED_ATTEMPTS_PER_ALBUM),
  ]);

  if (ipLimited || albumLimited) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[Verify] JSON parse failed:", err);
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "Request body must be a JSON object" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pin = (body as Record<string, unknown>).pin;

  // Reject anything that isn't a non-empty string (e.g. { "pin": 1234 } or
  // a missing field) with a clean 400 instead of letting Buffer.from throw a 500.
  if (typeof pin !== "string" || pin.length === 0) {
    return new Response(JSON.stringify({ error: "Missing pin" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Security-sensitive: read the PIN fresh from Sanity every time, via a
  // minimal, dedicated query — never through the Upstash cache. The cached
  // album lookup below (albumBySlugQuery) intentionally no longer projects
  // `pin` at all, so an album's PIN is never copied in plaintext into a
  // third-party cache.
  const pinRecord = await sanityClient.fetch<AlbumPinRecord | null>(albumPinBySlugQuery, { slug });

  if (!pinRecord) {
    return new Response(JSON.stringify({ error: "Album not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!pinMatches(pinRecord.pin, pin)) {
    await recordFailedAttempt(albumKey);
    return new Response(JSON.stringify({ error: "Invalid PIN" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const album = await getCached<SanityAlbumRaw | null>(
    CACHE_KEYS.albumBySlug(slug),
    30, // 30s fresh TTL
    120, // 120s stale TTL (background refresh)
    () => sanityClient.fetch<SanityAlbumRaw | null>(albumBySlugQuery, { slug })
  );

  if (!album) {
    // Extremely unlikely — the PIN lookup above just found this exact slug
    // moments ago — but guard anyway (e.g. the album was deleted in between).
    // Checked BEFORE grantAlbumAccess below (not after, as this used to be
    // ordered) so a delete landing in this exact window can't leave a
    // granted session cookie for an album that turns out not to exist.
    return new Response(JSON.stringify({ error: "Album not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Record that this browser proved knowledge of this album's PIN (and
  // which PIN, via its hash — see gallerySession.ts's hasValidPinSession),
  // so /api/ably/token can scope its realtime capability to just this album
  // (M-2 in new-audit.md) instead of a blanket `album:*` subscribe, and so a
  // later PIN change invalidates this session on resume (session.ts).
  grantAlbumAccess(cookies, pinRecord._id, pin);

  // Share stats are informational only (shown to the admin) — a failure here
  // must never block a client from viewing an album they just proved PIN
  // knowledge for, so it's wrapped in its own try/catch.
  //
  // Two bugs were found here via live testing against a real Vercel preview
  // deployment (not just local/unit tests), both making this a no-op in
  // production for every album ever since it shipped:
  // 1. `sanityWriteClient.create()` (in `api/admin/albums.ts`) never sets an
  //    initial `shareCount`, so Sanity's `.inc()` — which requires the target
  //    field to already exist and be numeric — always failed with a
  //    validation error that this catch block was silently swallowing.
  //    `.setIfMissing()` first makes `.inc()` safe on both new and any
  //    legacy album that predates this field.
  // 2. `waitUntil()` (fire-and-forget, kept alive past the response) was
  //    tried to shave this off the client's latency, but the background task
  //    never actually persisted on this deployment — it only reliably
  //    extends a function's lifecycle when the project has Vercel's Fluid
  //    Compute enabled, which isn't something this codebase can assume or
  //    control. Awaiting the write directly is the only way to guarantee it
  //    actually happens, at the cost of a small amount of latency.
  try {
    await sanityWriteClient
      .patch(album._id)
      .setIfMissing({ shareCount: 0 })
      .inc({ shareCount: 1 })
      .set({ lastAccessedAt: new Date().toISOString() })
      .commit();
    // allAlbumsQuery also surfaces shareCount/lastAccessedAt to the admin
    // list, so its cache would otherwise show stale stats for up to 120s.
    await invalidateCache(CACHE_KEYS.albumsList());
  } catch (err) {
    console.error("[Verify] Failed to update share stats:", err);
    captureError(err, { route: "gallery/verify shareStats", slug });
  }

  const photosResponse = buildGalleryAlbumResponse(album);

  return new Response(JSON.stringify(photosResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
