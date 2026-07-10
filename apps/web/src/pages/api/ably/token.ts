import type { APIRoute } from "astro";
import Ably from "ably";
import { requireAdmin } from "../../../lib/auth";
import { hasAlbumAccess } from "../../../lib/gallerySession";

// Mints a short-lived, subscribe-only Ably token for the browser so the full
// (publish-capable) API key never ships to the client. Gallery clients may only
// subscribe to the specific album channel they've already PIN-verified (see
// M-2 in new-audit.md — this used to grant a blanket `album:*` subscribe to
// every visitor, letting anyone listen to any album's realtime events without
// ever entering a PIN); the admin dashboard channel is granted solely to
// authenticated admins so visitors cannot listen in on admin events.
export const GET: APIRoute = async ({ cookies, url }) => {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    // Generic message — don't reveal server configuration state to clients.
    return new Response(JSON.stringify({ error: "Realtime unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const capability: Record<string, string[]> = {};

  // The gallery client passes ?albumId=<id> (see lib/ably.ts) — only grant
  // that specific album's channel, and only once the browser has actually
  // proven it knows that album's PIN via a prior verify.ts call.
  const albumId = url.searchParams.get("albumId");
  if (albumId && hasAlbumAccess(cookies, albumId)) {
    capability[`album:${albumId}`] = ["subscribe"];
  }

  if (await requireAdmin(cookies)) {
    capability["admin:updates"] = ["subscribe"];
  }

  const rest = new Ably.Rest({ key });
  const tokenRequest = await rest.auth.createTokenRequest({
    ttl: 60 * 60 * 1000, // 1 hour
    capability: JSON.stringify(capability),
  });

  return new Response(JSON.stringify(tokenRequest), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
