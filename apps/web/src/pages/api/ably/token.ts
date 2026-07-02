import type { APIRoute } from "astro";
import Ably from "ably";

// Mints a short-lived, subscribe-only Ably token for the browser so the full
// (publish-capable) API key never ships to the client.
export const GET: APIRoute = async () => {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "Ably not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rest = new Ably.Rest({ key });
  const tokenRequest = await rest.auth.createTokenRequest({
    capability: JSON.stringify({
      "album:*": ["subscribe"],
      "admin:updates": ["subscribe"],
    }),
  });

  return new Response(JSON.stringify(tokenRequest), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
