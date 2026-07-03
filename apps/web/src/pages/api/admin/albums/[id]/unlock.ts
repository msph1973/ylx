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

    // Fetch and delete existing selections + submission so client can re-submit
    const [selections, submissions] = await Promise.all([
      sanityClient.fetch<Array<{ _id: string }>>(
        `*[_type == "selection" && album._ref == $albumId]{ _id }`,
        { albumId }
      ),
      sanityClient.fetch<Array<{ _id: string }>>(
        `*[_type == "submission" && album._ref == $albumId]{ _id }`,
        { albumId }
      ),
    ]);

    const tx = sanityWriteClient.transaction();
    for (const s of selections) tx.delete(s._id);
    for (const s of submissions) tx.delete(s._id);
    tx.patch(albumId, { set: { status: "active" } });
    const result = await tx.commit();

    publishAdminEvent("album:unlocked", { albumId });
    publishAlbumEvent(albumId, "album:unlocked", { lockedBy: session.email });

    return new Response(JSON.stringify({ success: true, id: result.results[0]?.id ?? albumId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to unlock album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
