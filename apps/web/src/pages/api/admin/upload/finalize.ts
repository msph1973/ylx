import type { APIRoute } from "astro";
import { sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent } from "../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A Sanity transaction that mutates a document commits with optimistic
// concurrency: two `patch(...).append(...)` calls racing on the SAME album (which
// happens because the browser uploads photos in parallel, UPLOAD_CONCURRENCY=3)
// can collide and the loser is rejected with a 409 mutation conflict. Retrying the
// losing append a few times with backoff serialises them without slowing the heavy
// (parallel) binary uploads. Non-conflict errors propagate immediately.
function isConflict(err: unknown): boolean {
  const status =
    (err as { statusCode?: number })?.statusCode ??
    (err as { response?: { statusCode?: number } })?.response?.statusCode;
  return status === 409;
}

async function commitWithConflictRetry<T>(
  commit: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await commit();
    } catch (err) {
      if (!isConflict(err) || attempt >= attempts) throw err;
      // 100ms, 200ms, 400ms, 800ms — small jittered backoff before re-appending.
      await delay(100 * 2 ** (attempt - 1) + Math.floor(Math.random() * 50));
    }
  }
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
    // Wrapped in a conflict retry so parallel uploads appending to the same album
    // don't lose a photo to a 409 mutation conflict.
    await commitWithConflictRetry(() =>
      sanityWriteClient
        .patch(albumId)
        .setIfMissing({ photos: [] })
        .append("photos", [
          { _type: "reference", _ref: photoDoc._id, _key: photoDoc._id },
        ])
        .commit()
    );

    publishAdminEvent("photo:uploaded", { photoId: photoDoc._id, filename });
    void invalidateCache(CACHE_KEYS.albumsList()); // photoCount changed

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
