import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";
import { captureError } from "../../../../../lib/errorTracking";

// Marks a locked album as delivered once its final, edited photos have been
// uploaded (see albums/[id]/final-photos.ts) — the last step of the final
// delivery flow, after which the client can access the final gallery.

interface AlbumRaw {
  _id: string;
  status?: string;
  finalPhotos?: unknown[];
  slug?: { current: string };
  customSlug?: string;
}

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
    const album = await sanityClient.fetch<AlbumRaw | null>(
      `*[_type == "album" && _id == $albumId][0]{ _id, status, finalPhotos, slug, customSlug }`,
      { albumId }
    );

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (album.status !== "locked" && album.status !== "submitted") {
      return new Response(
        JSON.stringify({ error: "Album must be submitted or locked before delivery" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!album.finalPhotos || album.finalPhotos.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one final photo is required to deliver" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await sanityWriteClient.patch(albumId).set({ status: "delivered" }).commit();

    // Invalidate before publishing so the realtime event is a reliable
    // "refetch now" signal against already-fresh cache (matches lock.ts/
    // unlock.ts ordering).
    await invalidateCache([
      CACHE_KEYS.albumsList(),
      ...(album.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("album:delivered", { albumId }),
      publishAlbumEvent(albumId, "album:delivered"),
    ]);

    return new Response(JSON.stringify({ success: true, id: albumId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Deliver]", error);
    captureError(error, { route: "admin/albums/[id]/deliver", albumId });
    return new Response(
      JSON.stringify({ error: "Failed to deliver album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
