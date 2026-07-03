import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ cookies }) => {
  try {
    cookies.delete("admin_session", { path: "/" });

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
