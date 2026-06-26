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

    // Validate credentials — use a single generic error to prevent username enumeration
    const validated = await validateAdminPassword(email, password);

    if (!validated) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = JSON.stringify({
      id: validated._id,
      email: validated.email,
      name: validated.name,
      role: validated.role,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    cookies.set("admin_session", session, {
      path: "/",
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
    });

    return new Response(
      JSON.stringify({ success: true, admin: { name: validated.name, email: validated.email, role: validated.role } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Login] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
