import type { APIRoute } from "astro";
import { sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";

export const POST: APIRoute = async ({ params, cookies }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const albumId = params.id;
    if (!albumId) {
      return new Response(
        JSON.stringify({ error: "Album ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await sanityWriteClient
      .patch(albumId)
      .set({ status: "active" })
      .commit();

    return new Response(JSON.stringify({ success: true, id: result._id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to unlock album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
