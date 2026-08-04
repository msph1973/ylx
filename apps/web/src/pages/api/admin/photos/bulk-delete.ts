import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";
import { parseJsonBody } from "../../../../lib/requestBody";

interface PhotoRecord {
  _id: string;
  album?: { _ref: string };
}

interface AlbumSlugRaw {
  _id: string;
  slug?: { current: string };
  customSlug?: string;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await parseJsonBody(request);
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Request body must be a valid JSON object" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const albumId = typeof body.albumId === "string" ? body.albumId.trim() : undefined;
    const uniquePhotoIds = [
      ...new Set(
        Array.isArray(body.photoIds)
          ? body.photoIds.filter((id): id is string => typeof id === "string" && id.length > 0)
          : []
      ),
    ];

    if (!albumId || uniquePhotoIds.length === 0) {
      return new Response(JSON.stringify({ error: "Album ID and photo IDs are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch album slug and customSlug for cache invalidation
    const album = await sanityClient.fetch<AlbumSlugRaw | null>(
      `*[_type == "album" && _id == $albumId][0]{ _id, slug, customSlug }`,
      { albumId }
    );

    const photos = await sanityClient.fetch<PhotoRecord[]>(
      `*[_type == "photo" && _id in $photoIds]{ _id, album }`,
      { photoIds: uniquePhotoIds }
    );

    if (photos.length !== uniquePhotoIds.length || photos.some((photo) => photo.album?._ref !== albumId)) {
      return new Response(JSON.stringify({ error: "One or more photos do not belong to this album" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const selectionIds = await sanityClient.fetch<string[]>(
      `*[_type == "selection" && photo._ref in $photoIds]._id`,
      { photoIds: uniquePhotoIds }
    );

    const submissionIds = await sanityClient.fetch<string[]>(
      `*[_type == "submission" && album._ref == $albumId]._id`,
      { albumId }
    );

    const tx = sanityWriteClient.transaction();

    if (selectionIds.length > 0) {
      const selectionUnsets = selectionIds.map((selectionId) => `selections[_ref=="${selectionId}"]`);
      for (const submissionId of submissionIds) {
        tx.patch(submissionId, { unset: selectionUnsets });
      }
      for (const selectionId of selectionIds) {
        tx.delete(selectionId);
      }
    }

    tx.patch(albumId, {
      unset: uniquePhotoIds.map((photoId) => `photos[_ref=="${photoId}"]`),
    });

    for (const photoId of uniquePhotoIds) {
      tx.delete(photoId);
    }

    await tx.commit();

    await invalidateCache([
      CACHE_KEYS.albumsList(),
      CACHE_KEYS.albumSelections(albumId),
      ...(album?.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album?.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("photo:deleted", { albumId, photoIds: uniquePhotoIds }),
      ...(selectionIds.length > 0 ? [publishAdminEvent("selection:changed", { albumId })] : []),
      publishAlbumEvent(albumId, "photo:deleted", { photoIds: uniquePhotoIds }),
    ]);

    return new Response(
      JSON.stringify({ success: true, deletedCount: uniquePhotoIds.length, removedSelections: selectionIds.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Photos] BULK DELETE failed:", error);
    return new Response(JSON.stringify({ error: "Failed to delete photos" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};