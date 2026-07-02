import type { APIRoute } from "astro";
import { createAdmin, countAdmins } from "@ylx/sanity/lib/admin";
import { requireAdmin } from "../../../lib/auth";

export const POST: APIRoute = async ({ request, cookies }) => {
  // Bootstrap: the very first admin can be created without auth (otherwise there
  // is no way to create the first one). Once any admin exists, creating more
  // requires an authenticated admin session.
  const hasAdmin = (await countAdmins()) > 0;
  if (hasAdmin && !requireAdmin(cookies)) {
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
