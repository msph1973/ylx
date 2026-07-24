import type { APIRoute } from "astro";
import { createAdmin } from "@ylx/sanity/lib/admin";
import { requireAdmin } from "../../../lib/auth";

export const POST: APIRoute = async ({ request, cookies }) => {
  // Admin-only, unconditionally (REVIEW.md §2.1 — no auth bypass on this route).
  // The first admin is seeded out-of-band via scripts/seed-admin.mjs (CLI), so
  // there is no chicken-and-egg problem and this endpoint stays fully guarded.
  if (!(await requireAdmin(cookies))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { email, password, name, role } = await request.json();

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Email, password, and name are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (typeof password !== "string" || [...password].length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const admin = await createAdmin({ email, password, name, role });

    if (!admin) {
      return new Response(
        JSON.stringify({ error: "Admin already exists or creation failed" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, admin: { name: admin.name, email: admin.email, role: admin.role } }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[CreateAdmin] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
