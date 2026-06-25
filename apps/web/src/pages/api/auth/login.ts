import type { APIRoute } from "astro";
import { validateAdminPassword } from "@ylx/sanity/lib/admin";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const admin = await validateAdminPassword(email, password);

    if (!admin) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = JSON.stringify({
      id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    cookies.set("admin_session", session, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
    });

    return new Response(
      JSON.stringify({ success: true, admin: { name: admin.name, email: admin.email, role: admin.role } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
