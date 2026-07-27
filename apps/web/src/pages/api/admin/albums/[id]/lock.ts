import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";

export const POST: APIRoute = async ({ params, cookies }) => {
  const session = await requireAdmin(cookies);
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

    const existing = await sanityClient.fetch<{ _id: string; status: string; slug?: { current: string }; customSlug?: string } | null>(
      `*[_type == "album" && _id == $albumId][0]{ _id, status, slug, customSlug }`,
      { albumId }
    );

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    await sanityWriteClient.patch(albumId).set({ status: "locked" }).commit();

    await publishAdminEvent("album:locked", { albumId });
    await publishAlbumEvent(albumId, "album:locked");
    await invalidateCache([
      CACHE_KEYS.albumsList(),
      CACHE_KEYS.albumSelections(albumId),
      ...(existing.slug?.current ? [CACHE_KEYS.albumBySlug(existing.slug.current)] : []),
      ...(existing.customSlug ? [CACHE_KEYS.albumBySlug(existing.customSlug)] : []),
    ]);

    return new Response(JSON.stringify({ success: true, id: albumId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Lock]", error);
    return new Response(
      JSON.stringify({ error: "Failed to lock album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
