import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import {
  albumBySlugQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";

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

  const album = await sanityClient.fetch(albumBySlugQuery, { slug });

  if (!album) {
    return new Response(JSON.stringify({ error: "Album not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (album.status === "locked") {
    return new Response(JSON.stringify({ error: "Album is locked" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (photoIds.length > album.maxSelections) {
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
  for (const photoId of photoIds) {
    const selectionDoc = {
      _type: "selection",
      album: { _type: "reference", _ref: album._id },
      photo: { _type: "reference", _ref: photoId },
      selectedAt: new Date().toISOString(),
    };
    const result = transaction.create(selectionDoc);
    selectionIds.push(result.id);
  }

  transaction.create({
    _type: "submission",
    album: { _type: "reference", _ref: album._id },
    selections: selectionIds.map((id) => ({
      _type: "reference",
      _ref: id,
    })),
    submittedAt: new Date().toISOString(),
  });

  transaction.patch(album._id, { set: { status: "locked" } });

  await transaction.commit();

  return new Response(
    JSON.stringify({ success: true, selectionCount: photoIds.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
