import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/auth";

// Minimal session descriptor for the browser (S2): lets the admin dashboard
// pick the correct realtime channel (global for superadmins, owner-scoped
// for vendors) without exposing the signed session payload itself.
export const GET: APIRoute = async ({ cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({ role: session.role, ownerId: session.ownerId }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
