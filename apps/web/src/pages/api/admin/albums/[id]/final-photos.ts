import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";
import { parseJsonBody } from "../../../../../lib/requestBody";
import { captureError } from "../../../../../lib/errorTracking";

// Final-delivery counterpart to upload/finalize.ts: the browser has already
// uploaded the edited photo's binary straight to Sanity's asset API and holds
// the resulting asset id. This endpoint does the document wiring server-side
// — create the `photo` document and attach it to the album's `finalPhotos`
// array (not `photos`, which holds the original proofing set) — then
// publishes the realtime event.
//
// Only albums that are past client selection ('submitted' or 'locked') can
// receive final photos; an 'active' album is still being proofed and has no
// business receiving delivered edits yet.

interface FinalPhotoBody {
  assetId?: unknown;
  filename?: unknown;
}

interface AlbumRaw {
  _id: string;
  _type: string;
  status?: string;
  slug?: { current: string };
  customSlug?: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mirrors upload/finalize.ts: a Sanity transaction that mutates a document
// commits with optimistic concurrency, so two appends racing on the same
// album can collide with a 409 mutation conflict. Retrying with backoff
// serialises them. Non-conflict errors propagate immediately.
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

const VALID_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/x-tiff",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Statuses that may receive final photos: client selection must be closed
// ('submitted' by the client, 'locked' by the admin, or 'delivered') before
// final, edited photos are attached — an 'active' album is still mid-proofing.
const DELIVERABLE_STATUSES = new Set(["submitted", "locked", "delivered"]);

// Delete an uploaded asset that should not be kept (e.g. the album doesn't
// exist or isn't in a valid status to accept final photos). Best-effort:
// failures are logged but never surface to the caller — the asset is already
// unreferenced, and a future dataset cleanup job can garbage-collect it.
async function deleteOrphanedAsset(assetId: string): Promise<void> {
  try {
    await sanityWriteClient.delete(assetId);
  } catch (delErr) {
    console.error("[Albums/final-photos] Failed to delete orphaned asset:", delErr);
    captureError(delErr, { route: "admin/albums/[id]/final-photos deleteOrphanedAsset", assetId });
  }
}

export const POST: APIRoute = async ({ request, params, cookies }) => {
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

  const body = await parseJsonBody<FinalPhotoBody>(request);
  if (!body) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { assetId, filename } = body;

  if (
    typeof assetId !== "string" ||
    typeof filename !== "string" ||
    !assetId ||
    !filename
  ) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Guard against a client sending an arbitrary reference id: a Sanity image
  // asset id always starts with `image-`. This keeps the created
  // `photo.image.asset` reference pointing at a real uploaded asset.
  if (!assetId.startsWith("image-")) {
    return new Response(
      JSON.stringify({ error: "Invalid asset id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (filename.length > MAX_FILENAME_LENGTH || hasUnsafeFilenameChars(filename)) {
    // The client already uploaded the binary to Sanity's asset API before
    // calling this endpoint — rejecting without cleanup would leave that
    // asset orphaned in the dataset forever, since no `photo` document will
    // ever reference it.
    try {
      await sanityWriteClient.delete(assetId);
    } catch (delErr) {
      console.error("[Albums/final-photos] Failed to delete orphaned asset:", delErr);
      captureError(delErr, { route: "admin/albums/[id]/final-photos deleteOrphanedAsset", assetId });
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
      sanityClient.fetch<AlbumRaw | null>(
        `*[_type == "album" && _id == $albumId][0]{ _id, _type, status, slug, customSlug }`,
        { albumId }
      ),
      // Fetch asset metadata to validate MIME type and file size server-side.
      // Client-side validation can be bypassed; this ensures policy is
      // enforced regardless of how the upload credential was obtained.
      sanityWriteClient.getDocument(assetId),
    ]);

    if (!album || album._type !== "album") {
      await deleteOrphanedAsset(assetId);
      return new Response(JSON.stringify({ error: "Album not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!album.status || !DELIVERABLE_STATUSES.has(album.status)) {
      await deleteOrphanedAsset(assetId);
      return new Response(
        JSON.stringify({ error: "Album must be submitted, locked, or delivered to receive final photos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!asset || asset._type !== "sanity.imageAsset") {
      // Asset doesn't exist or isn't an image — delete the invalid reference
      // and reject the request.
      try {
        await sanityWriteClient.delete(assetId);
      } catch (delErr) {
        console.error("[Albums/final-photos] Failed to delete invalid asset:", delErr);
        captureError(delErr, { route: "admin/albums/[id]/final-photos deleteInvalidAsset", assetId });
      }
      return new Response(
        JSON.stringify({ error: "Invalid or non-existent image asset" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const mimeType = asset.mimeType as string | undefined;
    const fileSize = asset.size as number | undefined;

    if (!mimeType || !VALID_MIME_TYPES.includes(mimeType)) {
      // Invalid MIME type — delete the asset and reject.
      try {
        await sanityWriteClient.delete(assetId);
      } catch (delErr) {
        console.error("[Albums/final-photos] Failed to delete invalid-type asset:", delErr);
        captureError(delErr, { route: "admin/albums/[id]/final-photos deleteInvalidTypeAsset", assetId });
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
        console.error("[Albums/final-photos] Failed to delete oversized asset:", delErr);
        captureError(delErr, { route: "admin/albums/[id]/final-photos deleteOversizedAsset", assetId });
      }
      return new Response(
        JSON.stringify({ error: `File too large. Maximum size: 50MB` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pre-generated so the photo document's creation and its append into the
    // album's `finalPhotos` array can be committed together in one
    // transaction below — if a conflict forces a retry, nothing partially
    // committed, so the same id is safely reused instead of risking an
    // orphaned photo document that a client retry would then duplicate.
    const photoId = randomUUID();

    // Create the photo document and attach it to the album's `finalPhotos`
    // array as one atomic transaction. Wrapped in a conflict retry so
    // parallel uploads appending to the same album don't lose a photo to a
    // 409 mutation conflict; since the whole transaction is atomic, a
    // conflict means nothing committed, so retrying is safe.
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
            .setIfMissing({ finalPhotos: [] })
            .append("finalPhotos", [
              { _type: "reference", _ref: photoId, _key: photoId },
            ])
        )
        .commit()
    );

    // Invalidate before publishing so the realtime event is a reliable
    // "refetch now" signal against already-fresh cache.
    await invalidateCache([
      CACHE_KEYS.albumsList(),
      ...(album.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("finalPhoto:uploaded", { albumId, photoId, filename }),
      publishAlbumEvent(albumId, "finalPhoto:uploaded", { photoId }),
    ]);

    return new Response(
      JSON.stringify({ success: true, photoId }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Albums/final-photos] POST failed:", err);
    captureError(err, { route: "admin/albums/[id]/final-photos POST", albumId });
    return new Response(
      JSON.stringify({ error: "Failed to attach final photo" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

interface DeleteBody {
  photoId?: unknown;
}

interface PhotoRaw {
  _id: string;
  album?: { _ref: string };
}

export const DELETE: APIRoute = async ({ request, params, cookies }) => {
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

  const body = await parseJsonBody<DeleteBody>(request);
  if (!body || typeof body.photoId !== "string" || !body.photoId) {
    return new Response(
      JSON.stringify({ error: "Photo ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const photoId = body.photoId;

  // Validate photoId format before using it in a GROQ unset path — prevents
  // injection through crafted ids (see REVIEW.md §2.1).
  if (!/^[a-zA-Z0-9_-]+$/.test(photoId)) {
    return new Response(
      JSON.stringify({ error: "Invalid photo ID format" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const [album, photo] = await Promise.all([
      sanityClient.fetch<AlbumRaw | null>(
        `*[_type == "album" && _id == $albumId][0]{ _id, _type, status, slug, customSlug }`,
        { albumId }
      ),
      sanityClient.fetch<PhotoRaw | null>(
        `*[_type == "photo" && _id == $photoId][0]{ _id, album }`,
        { photoId }
      ),
    ]);

    if (!album || album._type !== "album") {
      return new Response(JSON.stringify({ error: "Album not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!album.status || !DELIVERABLE_STATUSES.has(album.status)) {
      return new Response(
        JSON.stringify({ error: "Album must be submitted, locked, or delivered to remove final photos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!photo || photo.album?._ref !== albumId) {
      return new Response(
        JSON.stringify({ error: "Final photo not found on this album" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    await commitWithConflictRetry(() =>
      sanityWriteClient
        .transaction()
        .patch(albumId, { unset: [`finalPhotos[_ref=="${photoId}"]`] })
        .delete(photoId)
        .commit()
    );

    await invalidateCache([
      CACHE_KEYS.albumsList(),
      ...(album.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("finalPhoto:deleted", { albumId, photoId }),
      publishAlbumEvent(albumId, "finalPhoto:deleted", { photoId }),
    ]);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Albums/final-photos] DELETE failed:", err);
    captureError(err, { route: "admin/albums/[id]/final-photos DELETE", albumId, photoId });
    return new Response(
      JSON.stringify({ error: "Failed to delete final photo" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
