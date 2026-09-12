import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";
import { captureError } from "../../../../lib/errorTracking";

interface PhotoRaw {
  _id: string;
  album?: { _ref: string };
}

interface AlbumSlugRaw {
  _id: string;
  owner?: { _ref: string };
  slug?: { current: string };
  customSlug?: string;
}

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const photoId = params.id;
  if (!photoId) {
    return new Response(
      JSON.stringify({ error: "Photo ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const photo = await sanityClient.fetch<PhotoRaw | null>(
      `*[_type == "photo" && _id == $photoId][0]{ _id, album }`,
      { photoId }
    );

    if (!photo) {
      return new Response(
        JSON.stringify({ error: "Photo not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const albumId = photo.album?._ref;

    // These three lookups only depend on the already-known photoId/albumId,
    // with no interdependency on one another, so run them concurrently.
    const [album, selectionIds, submissionIds] = await Promise.all([
      // Fetch album slug and customSlug for cache invalidation
      albumId
        ? sanityClient.fetch<AlbumSlugRaw | null>(
            `*[_type == "album" && _id == $albumId][0]{ _id, owner, slug, customSlug }`,
            { albumId }
          )
        : Promise.resolve(null),
      // Selections that point at this photo, and the submissions that list them,
      // must be detached before the photo can be removed (strong references).
      sanityClient.fetch<string[]>(
        `*[_type == "selection" && photo._ref == $photoId]._id`,
        { photoId }
      ),
      albumId
        ? sanityClient.fetch<string[]>(
            `*[_type == "submission" && album._ref == $albumId]._id`,
            { albumId }
          )
        : Promise.resolve([]),
    ]);

    // Tenant guard (S2): a photo inherits its parent album's owner. Vendors
    // delete only photos of their own albums — 404, not 403, so foreign
    // photo ids are indistinguishable from missing ones. A missing parent
    // album also fails the vendor check (orphan photos are superadmin-only).
    if (session.role !== "superadmin" && album?.owner?._ref !== session.ownerId) {
      return new Response(
        JSON.stringify({ error: "Photo not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const tx = sanityWriteClient.transaction();

    if (selectionIds.length > 0) {
      const selectionUnsets = selectionIds.map((id) => `selections[_ref=="${id}"]`);
      for (const submissionId of submissionIds) {
        tx.patch(submissionId, { unset: selectionUnsets });
      }
      for (const selectionId of selectionIds) {
        tx.delete(selectionId);
      }
    }

    if (albumId) {
      tx.patch(albumId, { unset: [`photos[_ref=="${photoId}"]`] });
    }

    tx.delete(photoId);
    await tx.commit();

    // Invalidate before publishing so the realtime event reliably signals a
    // refetch against fresh cache.
    await invalidateCache([
      CACHE_KEYS.albumsList(),
      ...(albumId ? [CACHE_KEYS.albumSelections(albumId)] : []),
      ...(album?.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album?.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("photo:deleted", { photoId, albumId }),
      ...(selectionIds.length > 0 ? [publishAdminEvent("selection:changed", { albumId })] : []),
      ...(albumId ? [publishAlbumEvent(albumId, "photo:deleted", { photoId })] : []),
    ]);

    return new Response(
      JSON.stringify({ success: true, removedSelections: selectionIds.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Photos] DELETE failed:", error);
    captureError(error, { route: "admin/photos DELETE", photoId });
    return new Response(
      JSON.stringify({ error: "Failed to delete photo" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
