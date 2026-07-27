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

    // Fetch album slug and customSlug for cache invalidation, plus existing selections/submissions to delete
    const [album, selections, submissions] = await Promise.all([
      sanityClient.fetch<{ slug?: { current: string }; customSlug?: string } | null>(
        `*[_type == "album" && _id == $albumId][0]{ slug, customSlug }`,
        { albumId }
      ),
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

    await invalidateCache([
      CACHE_KEYS.albumsList(),
      CACHE_KEYS.albumSelections(albumId),
      // Unlock resets the client's selections, so any stale draft-progress
      // count from the previous round must not linger on the dashboard.
      CACHE_KEYS.galleryDraft(albumId),
      ...(album?.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album?.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("album:unlocked", { albumId }),
      publishAlbumEvent(albumId, "album:unlocked"),
    ]);

    return new Response(JSON.stringify({ success: true, id: result.results[0]?.id ?? albumId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Unlock]", error);
    return new Response(
      JSON.stringify({ error: "Failed to unlock album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
