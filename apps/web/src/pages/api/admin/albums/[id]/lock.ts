import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";

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

    const existing = await sanityClient.fetch<{ _id: string; status: string } | null>(
      `*[_type == "album" && _id == $albumId][0]{ _id, status }`,
      { albumId }
    );

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    await sanityWriteClient.patch(albumId).set({ status: "locked" }).commit();

    publishAdminEvent("album:locked", { albumId });
    publishAlbumEvent(albumId, "album:locked");

    return new Response(JSON.stringify({ success: true, id: albumId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to lock album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
