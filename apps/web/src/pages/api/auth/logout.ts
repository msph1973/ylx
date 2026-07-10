import type { APIRoute } from "astro";
import { incrementSessionVersion } from "@ylx/sanity/lib/admin";
import { getSession, invalidateSessionVersionCache } from "../../../lib/auth";

export const POST: APIRoute = async ({ cookies }) => {
  try {
    // Resolve who's logging out BEFORE deleting the cookie, so we can bump
    // that admin's sessionVersion — this is the actual revocation (M-1):
    // every other cookie signed with the old version (a stolen copy, another
    // browser tab/device) becomes invalid on its very next request, not just
    // this browser's. A session that's already invalid (expired/tampered) has
    // nothing meaningful to revoke, so we still delete the cookie either way.
    const session = await getSession(cookies);
    cookies.delete("admin_session", { path: "/" });

    if (session) {
      await incrementSessionVersion(session.id);
      // Invalidate the cached version immediately so this doesn't wait out
      // the cache TTL before other copies of the cookie stop working.
      await invalidateSessionVersionCache(session.id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Auth] logout failed:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
