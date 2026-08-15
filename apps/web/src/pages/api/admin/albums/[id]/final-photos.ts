import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";
import { parseJsonBody } from "../../../../../lib/requestBody";
import { captureError } from "../../../../../lib/errorTracking";
import { delay } from "../../../../../lib/sanityUpload";

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
  finalPhotos?: { _ref: string }[];
}

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
//
// Sanity dedupes assets by content hash, so this exact assetId can already
// be referenced by an unrelated, already-created `photo` document (e.g. an
// earlier successful upload of identical file bytes, for this album or a
// different one) even though THIS particular request is being rejected.
// Deleting it unconditionally would corrupt that other document's image.
// Guard with a reference check first — only delete if truly orphaned.
async function deleteOrphanedAsset(assetId: string): Promise<void> {
  try {
    const referencedElsewhere = await sanityClient.fetch<boolean>(
      `count(*[references($assetId)]) > 0`,
      { assetId }
    );
    if (referencedElsewhere) {
      return;
    }
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
    await deleteOrphanedAsset(assetId);
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
        `*[_type == "album" && _id == $albumId][0]{ _id, _type, status, slug, customSlug, "finalPhotos": finalPhotos[]{ _ref } }`,
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
      await deleteOrphanedAsset(assetId);
      return new Response(
        JSON.stringify({ error: "Invalid or non-existent image asset" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const mimeType = asset.mimeType as string | undefined;
    const fileSize = asset.size as number | undefined;

    if (!mimeType || !VALID_MIME_TYPES.includes(mimeType)) {
      // Invalid MIME type — delete the asset and reject.
      await deleteOrphanedAsset(assetId);
      return new Response(
        JSON.stringify({ error: `Invalid file type. Allowed: ${VALID_MIME_TYPES.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!fileSize || fileSize > MAX_FILE_SIZE) {
      // File too large — delete the asset and reject.
      await deleteOrphanedAsset(assetId);
      return new Response(
        JSON.stringify({ error: `File too large. Maximum size: 50MB` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Deterministic, namespaced id (NOT randomUUID like proofing photos in
    // upload/finalize.ts) — this is the idempotency + type-safety key for
    // everything below. Because it's derived from albumId+assetId with a
    // "final-" prefix that ONLY this endpoint ever produces, a lookup by
    // this exact id can never accidentally match an unrelated proofing
    // `photo` document that happens to reference the same asset (a real bug
    // an earlier, fuzzier assetId+album query-based version of this check
    // had: it could latch onto a proofing photo, risking the client
    // receiving the wrong image and a later final-photo delete corrupting
    // the original gallery). `albumId` is included (not just `assetId`)
    // because Sanity dedupes assets by content hash — uploading the exact
    // same file bytes as a final photo for two DIFFERENT albums returns the
    // SAME `assetId`, and an assetId-only id would collide across albums,
    // letting the second album's delete accidentally target a document
    // whose `album` reference still points at the first album.
    const photoId = `final-${albumId}-${assetId}`;

    // Idempotency guard: the client (FinalPhotosSection.tsx) retries this
    // call with backoff on a network failure, and a network failure can mean
    // the request actually succeeded server-side but the response never made
    // it back. Each such retry reuses the SAME already-uploaded `assetId`
    // (the binary upload to Sanity's asset API isn't repeated), so with a
    // deterministic id, a repeat request naturally targets the exact same
    // document instead of minting a new random one.
    const existingPhoto = await sanityWriteClient.getDocument<{ _id: string }>(photoId);
    if (existingPhoto) {
      const alreadyLinked = (album.finalPhotos ?? []).some((ref) => ref._ref === photoId);
      if (!alreadyLinked) {
        // The photo document was created by a prior attempt, but the append
        // into `finalPhotos` didn't commit (e.g. the process died between the
        // two steps) — finish that half instead of leaving it dangling.
        await commitWithConflictRetry(() =>
          sanityWriteClient
            .patch(albumId)
            .setIfMissing({ finalPhotos: [] })
            .append("finalPhotos", [
              { _type: "reference", _ref: photoId, _key: photoId },
            ])
            .commit()
        );
        await invalidateCache([
          CACHE_KEYS.albumsList(),
          ...(album.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
          ...(album.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
        ]);
        await Promise.all([
          publishAdminEvent("finalPhoto:uploaded", { albumId, photoId, filename }),
          publishAlbumEvent(albumId, "finalPhoto:uploaded", { photoId, filename }),
        ]);
      }
      return new Response(
        JSON.stringify({ success: true, photoId }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // `createIfNotExists` (not `.create()`) makes document creation itself
    // safe under a concurrent identical retry racing this one — Sanity
    // guarantees only one copy is ever created for a given `_id`, so two
    // requests hitting this branch at once can't produce two photo
    // documents. The `finalPhotos` append that follows still has a narrow
    // window where two such concurrent retries could each append the same
    // `_ref`+`_key` before seeing the other's write — a real but low-severity
    // residual risk (a harmless-looking duplicate array entry, not a
    // duplicate document or corrupted proofing photo) documented in the PR
    // discussion rather than solved here with a heavier conditional-patch
    // scheme, since it requires both retries to race within the same narrow
    // window AND both to reach this exact branch simultaneously.
    await commitWithConflictRetry(() =>
      sanityWriteClient
        .transaction()
        .createIfNotExists({
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
      publishAlbumEvent(albumId, "finalPhoto:uploaded", { photoId, filename }),
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
        `*[_type == "album" && _id == $albumId][0]{ _id, _type, status, slug, customSlug, finalPhotos[]{_ref} }`,
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

    // `photo.album._ref === albumId` is also true for the album's ORIGINAL
    // proofing photos (upload/finalize.ts stamps the same `album` reference
    // field on them) — so it alone can't tell a final photo apart from a
    // proofing photo. Confirm `photoId` is actually a member of this album's
    // `finalPhotos` array before allowing the delete below, so a proofing
    // photo id can't be used to delete/corrupt a photo document through this
    // endpoint.
    const finalPhotoRefs = new Set((album.finalPhotos ?? []).map((ref) => ref._ref));
    if (!finalPhotoRefs.has(photoId)) {
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
