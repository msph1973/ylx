import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { publishAdminEvent } from "../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";
import { hasAlbumAccess } from "../../../../lib/gallerySession";
import {
  albumBySlugQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";
import { MAX_TEXT_LENGTH } from "@ylx/sanity/lib/constants";

interface SubmitAlbum {
  _id: string;
  status: string;
  maxSelections: number;
  photos?: { _id: string }[];
}

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[Submit] JSON parse failed:", err);
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response(JSON.stringify({ error: "Request body must be a JSON object" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  interface SelectionInput {
    photoId: string;
    notes?: string;
  }

  const rawSelections: SelectionInput[] | undefined = (body as Record<string, unknown>).selections as SelectionInput[] | undefined;
  const rawPhotoIds: string[] | undefined = (body as Record<string, unknown>).photoIds as string[] | undefined;

  let effectiveSelections: SelectionInput[];
  if (Array.isArray(rawSelections) && rawSelections.length > 0) {
    effectiveSelections = rawSelections;
  } else if (Array.isArray(rawPhotoIds) && rawPhotoIds.length > 0) {
    effectiveSelections = rawPhotoIds.map((id) => ({ photoId: id }));
  } else {
    return new Response(
      JSON.stringify({ error: "photoIds or selections must be a non-empty array" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // `SelectionInput` only types the request body at compile time — the JSON
  // body is untrusted at runtime, so `notes` must be checked to actually be
  // a string (not e.g. an object or array) before its length is trusted or
  // it's stored in Sanity.
  for (const s of effectiveSelections) {
    if (s.notes !== undefined && (typeof s.notes !== "string" || s.notes.length > MAX_TEXT_LENGTH)) {
      return new Response(
        JSON.stringify({ error: `notes must be a string of ${MAX_TEXT_LENGTH} characters or fewer` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const notesMap = new Map<string, string>();
  for (const s of effectiveSelections) {
    if (s.notes) notesMap.set(s.photoId, s.notes);
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

  // L-1: Verify the submitter proved PIN knowledge for this album. Without
  // this, anyone who discovers a slug and valid photo IDs could submit
  // selections without ever verifying the PIN.
  if (!hasAlbumAccess(cookies, album._id)) {
    return new Response(JSON.stringify({ error: "PIN verification required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Deduplicate and verify every submitted photo actually belongs to this album.
  const uniquePhotoIds = [...new Set(effectiveSelections.map((s) => s.photoId))];
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
    const note = notesMap.get(photoId);
    transaction.create({
      _type: "selection",
      _id: selectionId,
      album: { _type: "reference", _ref: album._id },
      photo: { _type: "reference", _ref: photoId },
      selectedAt: new Date().toISOString(),
      ...(note ? { notes: note } : {}),
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
