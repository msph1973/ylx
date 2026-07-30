import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { albumBySlugQuery } from "@ylx/sanity/lib/queries";
import { hasAlbumAccess, hasActiveSession } from "../../../../lib/gallerySession";
import { isRateLimited, RATE_LIMIT_RETRY_AFTER } from "../../../../lib/ratelimit";
import { getCached, cacheSetRaw, cacheGetRaw, CACHE_KEYS } from "../../../../lib/cache";
import { publishAdminEvent } from "../../../../lib/ably";
import type { SanityAlbumRaw } from "../../../../lib/galleryAlbumResponse";

export interface GalleryDraftProgress {
  count: number;
  seq: number;
  updatedAt: number;
}

const DRAFT_TTL_SECONDS = 24 * 60 * 60; // matches the gallery PIN session
// 360 writes/15min per album+IP covers the client's worst-case cadence — a
// 3s debounce sustained for the full window is 300 writes — plus pagehide
// beacon headroom, while still bounding a buggy or compromised session from
// spamming Upstash writes + Ably publishes.
const MAX_DRAFT_WRITES_PER_SESSION = 360;

// Live draft progress for the admin dashboard: the client reports only HOW
// MANY photos are currently picked (never which ones — those stay private
// until submit). Informational feature, so every failure path is a cheap
// 4xx/no-op rather than anything that could disturb the gallery.
export const PUT: APIRoute = async ({ params, cookies, request, clientAddress }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Same pre-lookup gate as session.ts: no valid signed gallery cookie, no
  // Sanity read — unauthenticated callers can't force lookups by enumerating
  // slugs.
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

  // Same uniform 401 as session.ts so unauthenticated callers can't probe slugs.
  if (!album || !hasAlbumAccess(cookies, album._id)) {
    return new Response(JSON.stringify({ error: "No active gallery session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Authed but possibly buggy/compromised session — bound write + publish
  // amplification per album+IP (REVIEW.md §2.4). Missing clientAddress must
  // not fall into one shared "unknown" bucket in production: a single
  // quota-exhausting client would block every visitor of that album.
  if (!clientAddress && import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: "Unable to determine client address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const ip = clientAddress ?? "unknown";
  if (await isRateLimited(`draft:${album._id}:${ip}`, MAX_DRAFT_WRITES_PER_SESSION)) {
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
  // Also validate seq bounds so a malicious gallery visitor can't poison the
  // cached draft with an extremely large sequence number (DoS for 24h TTL).
  if (typeof seq === "number") {
    if (!Number.isSafeInteger(seq) || seq < 0) {
      return new Response(JSON.stringify({ error: "seq must be a non-negative safe integer" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Known limitation: the seq guard is read-then-write, not atomic. Two
    // concurrent PUTs could both pass the check before either writes. This
    // is acceptable for draft progress (informational, not transactional) —
    // an atomic CAS would require Lua scripting on Upstash.
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
