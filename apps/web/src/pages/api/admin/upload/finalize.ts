import type { APIRoute } from "astro";
import { sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent } from "../../../../lib/ably";

// Second half of the direct-to-Sanity upload flow.
//
// The browser has already uploaded the binary straight to Sanity's asset API
// (bypassing Vercel's ~4.5MB body limit) and holds the resulting asset id. This
// endpoint receives only that small JSON payload — well under the 4.5MB limit —
// and does the document wiring server-side: create the `photo` document and
// attach it to the album's ordered `photos` array, then publish the realtime
// event. Keeping this server-side means the write token stays where it belongs.

interface FinalizeBody {
  assetId?: unknown;
  albumId?: unknown;
  filename?: unknown;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: FinalizeBody;
  try {
    body = (await request.json()) as FinalizeBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { assetId, albumId, filename } = body;

  if (
    typeof assetId !== "string" ||
    typeof albumId !== "string" ||
    typeof filename !== "string" ||
    !assetId ||
    !albumId ||
    !filename
  ) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Guard against a client sending an arbitrary reference id: a Sanity image asset
  // id always starts with `image-`. This keeps the created `photo.image.asset`
  // reference pointing at a real uploaded asset.
  if (!assetId.startsWith("image-")) {
    return new Response(
      JSON.stringify({ error: "Invalid asset id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify the album exists BEFORE creating the photo. A Sanity
    // `patch(id).append(...)` on a missing document is a silent no-op, so without
    // this a stale/typo albumId would leave an orphan photo attached to nothing.
    const album = await sanityWriteClient.getDocument(albumId);
    if (!album || album._type !== "album") {
      return new Response(JSON.stringify({ error: "Album not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create the photo document referencing the already-uploaded asset.
    const photoDoc = await sanityWriteClient.create({
      _type: "photo",
      filename,
      image: {
        _type: "image",
        asset: {
          _type: "reference",
          _ref: assetId,
        },
      },
      album: {
        _type: "reference",
        _ref: albumId,
      },
    });

    // Attach the photo to the album's ordered `photos` array — the single source
    // of truth the gallery, submit validation, and admin grid all read from.
    await sanityWriteClient
      .patch(albumId)
      .setIfMissing({ photos: [] })
      .append("photos", [
        { _type: "reference", _ref: photoDoc._id, _key: photoDoc._id },
      ])
      .commit();

    publishAdminEvent("photo:uploaded", { photoId: photoDoc._id, filename });

    return new Response(
      JSON.stringify({ success: true, photoId: photoDoc._id }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Upload/finalize] Error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to attach uploaded photo" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
