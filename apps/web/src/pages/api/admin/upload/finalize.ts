import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent } from "../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";
import { captureError } from "../../../../lib/errorTracking";

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

const MAX_FILENAME_LENGTH = 255;

// `filename` ends up displayed in the admin grid and in the Lightroom
// filename export, so it must not carry path separators (which could read as
// a directory traversal in either surface) or raw control/terminal escape
// characters.
function hasUnsafeFilenameChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || char === "/" || char === "\\") {
      return true;
    }
  }
  return false;
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
  const session = await requireAdmin(cookies);
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

  if (filename.length > MAX_FILENAME_LENGTH || hasUnsafeFilenameChars(filename)) {
    // The client already uploaded the binary to Sanity's asset API before
    // calling this endpoint (see header comment) — rejecting without cleanup
    // would leave that asset orphaned in the dataset forever, since no
    // `photo` document will ever reference it. Mirrors the cleanup already
    // done below for an invalid/non-existent asset.
    try {
      await sanityWriteClient.delete(assetId);
    } catch (delErr) {
      console.error("[Upload/finalize] Failed to delete orphaned asset:", delErr);
      captureError(delErr, { route: "admin/upload/finalize deleteOrphanedAsset", assetId });
    }
    return new Response(
      JSON.stringify({ error: "Filename is too long or contains invalid characters" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // The album and asset are unrelated documents looked up only by their
    // own ids, so fetch them concurrently to cut serverless latency.
    const [album, asset] = await Promise.all([
      // Verify the album exists BEFORE creating the photo. A Sanity
      // `patch(id).append(...)` on a missing document is a silent no-op, so without
      // this a stale/typo albumId would leave an orphan photo attached to nothing.
      sanityWriteClient.getDocument(albumId),
      // Fetch asset metadata to validate MIME type and file size server-side.
      // Client-side validation can be bypassed; this ensures policy is enforced
      // regardless of how the upload credential was obtained.
      sanityWriteClient.getDocument(assetId),
    ]);

    if (!album || album._type !== "album") {
      return new Response(JSON.stringify({ error: "Album not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!asset || asset._type !== "sanity.imageAsset") {
      // Asset doesn't exist or isn't an image — delete the invalid reference
      // and reject the request.
      try {
        await sanityWriteClient.delete(assetId);
      } catch (delErr) {
        console.error("[Upload/finalize] Failed to delete invalid asset:", delErr);
        captureError(delErr, { route: "admin/upload/finalize deleteInvalidAsset", assetId });
      }
      return new Response(
        JSON.stringify({ error: "Invalid or non-existent image asset" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const VALID_MIME_TYPES = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/tiff",
      "image/x-tiff",
    ];
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    const mimeType = asset.mimeType as string | undefined;
    const fileSize = asset.size as number | undefined;

    if (!mimeType || !VALID_MIME_TYPES.includes(mimeType)) {
      // Invalid MIME type — delete the asset and reject.
      try {
        await sanityWriteClient.delete(assetId);
      } catch (delErr) {
        console.error("[Upload/finalize] Failed to delete invalid-type asset:", delErr);
        captureError(delErr, { route: "admin/upload/finalize deleteInvalidTypeAsset", assetId });
      }
      return new Response(
        JSON.stringify({ error: `Invalid file type. Allowed: ${VALID_MIME_TYPES.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!fileSize || fileSize > MAX_FILE_SIZE) {
      // File too large — delete the asset and reject.
      try {
        await sanityWriteClient.delete(assetId);
      } catch (delErr) {
        console.error("[Upload/finalize] Failed to delete oversized asset:", delErr);
        captureError(delErr, { route: "admin/upload/finalize deleteOversizedAsset", assetId });
      }
      return new Response(
        JSON.stringify({ error: `File too large. Maximum size: 50MB` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pre-generated so the photo document's creation and its append into the
    // album's `photos` array can be committed together in one transaction
    // below — if a conflict forces a retry, nothing partially committed, so
    // the same id is safely reused instead of risking an orphaned photo
    // document (never referenced by any album) that a client retry would
    // then duplicate.
    const photoId = randomUUID();

    // Create the photo document and attach it to the album's ordered `photos`
    // array — the single source of truth the gallery, submit validation, and
    // admin grid all read from — as one atomic transaction. Wrapped in a
    // conflict retry so parallel uploads appending to the same album don't
    // lose a photo to a 409 mutation conflict; since the whole transaction is
    // atomic, a conflict means nothing committed, so retrying is safe.
    await commitWithConflictRetry(() =>
      sanityWriteClient
        .transaction()
        .create({
          _id: photoId,
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
        })
        .patch(
          sanityWriteClient
            .patch(albumId)
            .setIfMissing({ photos: [] })
            .append("photos", [
              { _type: "reference", _ref: photoId, _key: photoId },
            ])
        )
        .commit()
    );

    // Invalidate before publishing so the realtime event is a reliable
    // "refetch now" signal against already-fresh cache — otherwise a
    // dashboard that refetches in response to the event can still read
    // stale cached data (matches lock.ts/submit.ts/photos/[id].ts ordering).
    const albumData = album as { slug?: { current: string }; customSlug?: string };
    await invalidateCache([
      CACHE_KEYS.albumsList(),
      ...(albumData.slug?.current ? [CACHE_KEYS.albumBySlug(albumData.slug.current)] : []),
      ...(albumData.customSlug ? [CACHE_KEYS.albumBySlug(albumData.customSlug)] : []),
    ]);
    await publishAdminEvent("photo:uploaded", { photoId, filename });

    return new Response(
      JSON.stringify({ success: true, photoId }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Upload/finalize] Error:", err);
    captureError(err, { route: "admin/upload/finalize POST", albumId });
    return new Response(
      JSON.stringify({ error: "Failed to attach uploaded photo" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
