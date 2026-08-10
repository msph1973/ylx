import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";
import { captureError } from "../../../../../lib/errorTracking";

export const POST: APIRoute = async ({ params, cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const albumId = params.id;
  if (!albumId) {
    return new Response(
      JSON.stringify({ error: "Album ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
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

    // Invalidate before publishing so the realtime event is a reliable
    // "refetch now" signal against already-fresh cache (avoids a race where
    // clients refetch the stale pre-lock value with no follow-up event).
    await invalidateCache([
      CACHE_KEYS.albumsList(),
      CACHE_KEYS.albumSelections(albumId),
      ...(existing.slug?.current ? [CACHE_KEYS.albumBySlug(existing.slug.current)] : []),
      ...(existing.customSlug ? [CACHE_KEYS.albumBySlug(existing.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("album:locked", { albumId }),
      publishAlbumEvent(albumId, "album:locked"),
    ]);

    return new Response(JSON.stringify({ success: true, id: albumId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Lock]", error);
    captureError(error, { route: "admin/albums/[id]/lock", albumId });
    return new Response(
      JSON.stringify({ error: "Failed to lock album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
