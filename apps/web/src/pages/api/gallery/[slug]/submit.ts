import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { publishAdminEvent } from "../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";
import {
  albumBySlugQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";

interface SubmitAlbum {
  _id: string;
  status: string;
  maxSelections: number;
  photos?: { _id: string }[];
}

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { photoIds } = body as { photoIds: string[] };

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return new Response(
      JSON.stringify({ error: "photoIds must be a non-empty array" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const album = await sanityClient.fetch<SubmitAlbum | null>(albumBySlugQuery, { slug });

  if (!album) {
    return new Response(JSON.stringify({ error: "Album not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only an active album accepts submissions. Both "submitted" (client already
  // submitted) and "locked" (admin manually locked) are closed for selection.
  if (album.status !== "active") {
    return new Response(JSON.stringify({ error: "Album is locked" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Deduplicate and verify every submitted photo actually belongs to this album.
  const uniquePhotoIds = [...new Set(photoIds)];
  const albumPhotoIds = new Set((album.photos ?? []).map((p) => p._id));
  const invalid = uniquePhotoIds.filter((id) => !albumPhotoIds.has(id));
  if (invalid.length > 0) {
    return new Response(
      JSON.stringify({ error: "Selection contains photos not in this album" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (uniquePhotoIds.length > album.maxSelections) {
    return new Response(
      JSON.stringify({
        error: `Maximum ${album.maxSelections} selections allowed`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const existingSelections = await sanityClient.fetch(
    selectionsByAlbumQuery,
    { albumId: album._id }
  );

  if (existingSelections.length > 0) {
    return new Response(
      JSON.stringify({ error: "Selections already submitted" }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const transaction = sanityWriteClient.transaction();

  const selectionIds: string[] = [];
  for (const photoId of uniquePhotoIds) {
    const selectionId = crypto.randomUUID();
    transaction.create({
      _type: "selection",
      _id: selectionId,
      album: { _type: "reference", _ref: album._id },
      photo: { _type: "reference", _ref: photoId },
      selectedAt: new Date().toISOString(),
    });
    selectionIds.push(selectionId);
  }

  // Deterministic submission _id acts as an atomic lock: a concurrent second
  // submit for the same album will fail with a 409 conflict on create.
  transaction.create({
    _type: "submission",
    _id: `submission-${album._id}`,
    album: { _type: "reference", _ref: album._id },
    selections: selectionIds.map((id) => ({
      _type: "reference",
      _ref: id,
    })),
    submittedAt: new Date().toISOString(),
  });

  transaction.patch(album._id, { set: { status: "submitted" } });

  try {
    await transaction.commit();
  } catch (err) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    if (statusCode === 409) {
      return new Response(
        JSON.stringify({ error: "Selections already submitted" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("[Submit] commit failed:", err);
    return new Response(JSON.stringify({ error: "Failed to submit selection" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Notify admin dashboard in real-time. The submission is already committed and
  // locked, so a realtime failure must not turn a successful submit into a 500.
  try {
    await publishAdminEvent("submission:received", {
      albumId: album._id,
      count: uniquePhotoIds.length,
    });
  } catch (err) {
    console.error("[Submit] publishAdminEvent failed:", err);
  }
  // Status flipped to "submitted" above, so the cached admin albums list
  // (which includes status) must be invalidated too, not just selections.
  await invalidateCache([CACHE_KEYS.albumsList(), CACHE_KEYS.albumSelections(album._id)]);

  return new Response(
    JSON.stringify({ success: true, selectionCount: uniquePhotoIds.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
