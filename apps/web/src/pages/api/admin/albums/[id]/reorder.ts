import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";

interface ReorderBody {
  photoIds?: string[];
}

interface AlbumPhotoReference {
  _key?: string;
  _ref: string;
}

interface AlbumReferences {
  _id: string;
  photos?: AlbumPhotoReference[];
}

export const PATCH: APIRoute = async ({ params, cookies, request }) => {
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
      return new Response(JSON.stringify({ error: "Album ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json() as ReorderBody;
    const photoIds = body.photoIds ?? [];
    if (photoIds.length === 0) {
      return new Response(JSON.stringify({ error: "Photo IDs are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const album = await sanityClient.fetch<AlbumReferences | null>(
      `*[_type == "album" && _id == $albumId][0]{ _id, photos[]{ _key, _ref } }`,
      { albumId }
    );

    if (!album) {
      return new Response(JSON.stringify({ error: "Album not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const currentPhotos = album.photos ?? [];
    const currentPhotoIds = currentPhotos.map((photo) => photo._ref);

    if (currentPhotoIds.length !== photoIds.length) {
      return new Response(JSON.stringify({ error: "Photo order does not match album contents" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const nextPhotoIds = [...photoIds];
    const isValidOrder =
      new Set(nextPhotoIds).size === currentPhotoIds.length &&
      currentPhotoIds.every((photoId) => nextPhotoIds.includes(photoId));

    if (!isValidOrder) {
      return new Response(JSON.stringify({ error: "Photo order contains invalid references" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const photoById = new Map(currentPhotos.map((photo) => [photo._ref, photo]));
    const reorderedReferences = nextPhotoIds.map((photoId) => {
      const currentPhoto = photoById.get(photoId);
      // Sanity requires a stable `_key` on every array item. Preserve the
      // existing key when present, otherwise fall back to the reference id
      // (unique within this album's photos array) so legacy/Studio-added
      // references without a key don't get rejected on reorder.
      return {
        _type: "reference",
        _ref: photoId,
        _key: currentPhoto?._key ?? photoId,
      };
    });

    await sanityWriteClient.patch(albumId).set({ photos: reorderedReferences }).commit();

    // No cache invalidation here: `allAlbumsQuery` (cached list) only returns
    // `photoCount`, not photo order/refs, and the per-album detail/selections
    // caches don't carry ordering either — reorder can't make either stale.
    publishAdminEvent("album:updated", { albumId, action: "reorder-photos" });
    publishAlbumEvent(albumId, "album:updated", { action: "reorder-photos" });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Albums] REORDER failed:", error);
    return new Response(JSON.stringify({ error: "Failed to reorder photos" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};