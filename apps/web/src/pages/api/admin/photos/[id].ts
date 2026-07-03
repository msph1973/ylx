import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../lib/ably";

interface PhotoRaw {
  _id: string;
  album?: { _ref: string };
}

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const session = requireAdmin(cookies);
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

    // Selections that point at this photo, and the submissions that list them,
    // must be detached before the photo can be removed (strong references).
    const selectionIds = await sanityClient.fetch<string[]>(
      `*[_type == "selection" && photo._ref == $photoId]._id`,
      { photoId }
    );

    const submissionIds = albumId
      ? await sanityClient.fetch<string[]>(
          `*[_type == "submission" && album._ref == $albumId]._id`,
          { albumId }
        )
      : [];

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

    publishAdminEvent("photo:deleted", { photoId, albumId });
    if (selectionIds.length > 0) {
      publishAdminEvent("selection:changed", { albumId });
    }
    if (albumId) {
      publishAlbumEvent(albumId, "photo:deleted", { photoId });
    }

    return new Response(
      JSON.stringify({ success: true, removedSelections: selectionIds.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Photos] DELETE failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to delete photo" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
