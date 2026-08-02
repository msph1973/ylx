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

    // Fetch album slug and customSlug for cache invalidation, and confirm the
    // album actually exists — without this, a bad id falls through to a
    // Sanity patch on a missing document and surfaces as a raw 500 instead
    // of a clean 404 (mirrors the existence check in lock.ts).
    const album = await sanityClient.fetch<{ slug?: { current: string }; customSlug?: string } | null>(
      `*[_type == "album" && _id == $albumId][0]{ slug, customSlug }`,
      { albumId }
    );

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delete by query (rather than reading selection/submission ids first and
    // deleting that fixed list) so a selection or submission created by a
    // request that races this unlock is also caught — otherwise it survives
    // as an orphan that permanently makes submit.ts respond 409 "Selections
    // already submitted" for this album. All three mutations commit as one
    // atomic transaction.
    // lastUnlockedAt is the draft revision marker: the gallery discards any
    // locally-stored draft saved before this moment, so a client that missed
    // the realtime unlock event can't restore selections the server deleted.
    await sanityWriteClient.mutate([
      {
        delete: {
          query: `*[_type == "selection" && album._ref == $albumId]`,
          params: { albumId },
        },
      },
      {
        delete: {
          query: `*[_type == "submission" && album._ref == $albumId]`,
          params: { albumId },
        },
      },
      {
        patch: {
          id: albumId,
          set: { status: "active", lastUnlockedAt: new Date().toISOString() },
        },
      },
    ]);

    await invalidateCache([
      CACHE_KEYS.albumsList(),
      CACHE_KEYS.albumSelections(albumId),
      // Unlock resets the client's selections, so any stale draft-progress
      // count from the previous round must not linger on the dashboard.
      CACHE_KEYS.galleryDraft(albumId),
      ...(album.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("album:unlocked", { albumId }),
      publishAlbumEvent(albumId, "album:unlocked"),
    ]);

    return new Response(JSON.stringify({ success: true, id: albumId }), {
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
