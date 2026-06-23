import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";

export const POST: APIRoute = async ({ params }) => {
  try {
    const albumId = params.id;
    if (!albumId) {
      return new Response(
        JSON.stringify({ error: "Album ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await sanityClient
      .patch(albumId)
      .set({ isLocked: false })
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