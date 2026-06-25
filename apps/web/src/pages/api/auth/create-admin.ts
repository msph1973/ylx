import type { APIRoute } from "astro";
import { createAdmin } from "@ylx/sanity/lib/admin";

export const POST: APIRoute = async ({ request }) => {
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
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
