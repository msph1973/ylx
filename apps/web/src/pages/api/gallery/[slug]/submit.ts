import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { publishAdminEvent } from "../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";
import { hasActiveSession, hasValidPinSession } from "../../../../lib/gallerySession";
import { notifyAdminsOfSubmission } from "../../../../lib/email";
import {
  albumBySlugQuery,
  albumPinBySlugQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";
import { MAX_TEXT_LENGTH } from "@ylx/sanity/lib/constants";
import { captureError } from "../../../../lib/errorTracking";

interface SubmitAlbum {
  _id: string;
  _rev: string;
  title: string;
  clientName: string;
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

  // Same pre-lookup gate as session.ts/draft.ts: no valid signed gallery
  // cookie, no Sanity read — unauthenticated callers can't force lookups by
  // enumerating slugs.
  if (!hasActiveSession(cookies)) {
    return new Response(JSON.stringify({ error: "No active gallery session" }), {
      status: 401,
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

  // Both queries always run, regardless of whether the other one turns up
  // anything — gating the pin lookup on `album` existing first would make an
  // unauthenticated caller able to tell "album doesn't exist" from "album
  // exists" purely from response latency (one Sanity round-trip vs two).
  const [album, pinRecord] = await Promise.all([
    sanityClient.fetch<SubmitAlbum | null>(albumBySlugQuery, { slug }),
    sanityClient.fetch<{ pin: string } | null>(albumPinBySlugQuery, { slug }),
  ]);

  // L-1: Verify the submitter proved PIN knowledge for this album BEFORE
  // revealing anything about the album's existence or status. Same uniform
  // 401 as session.ts/draft.ts so an unauthenticated caller can't tell
  // "album doesn't exist" from "album locked" from "album active" purely
  // from response codes.
  //
  // Uses hasValidPinSession (bound to the album's CURRENT pin, fetched fresh
  // via albumPinBySlugQuery — never from the cached `album` lookup above,
  // which intentionally no longer projects `pin`) instead of the looser
  // hasAlbumAccess, so that an admin rotating a compromised PIN immediately
  // invalidates old sessions for submission too, not just for the passive
  // resume check in session.ts. Treats a failed pin lookup (e.g. album
  // deleted in the tiny window since the fetch above) the same as "not
  // verified" — fail closed.
  if (!album || !pinRecord || !hasValidPinSession(cookies, album._id, pinRecord.pin)) {
    return new Response(JSON.stringify({ error: "No active gallery session" }), {
      status: 401,
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

  const existingSelections = await sanityClient.fetch<{ _id: string }[]>(
    selectionsByAlbumQuery,
    { albumId: album._id }
  );

  // Plain mutation array (not the `.transaction()` builder) so a resubmit's
  // selection cleanup below can delete by GROQ query in a single mutation —
  // the builder's `.delete()` only accepts document IDs, and looping it over
  // every existing selection individually risks exceeding Sanity's per-
  // transaction mutation limit for an album with a large previous selection.
  // `mutate()` with an array still commits as one all-or-nothing transaction.
  const mutations: Parameters<typeof sanityWriteClient.mutate>[0] = [];

  // A resubmit after the admin unlocked the gallery: unlock.ts now leaves the
  // previous round's selection/submission docs intact (so the client can see
  // and revise them), so this submit must clear them itself before writing
  // the new round. Without this, the deterministic submission _id create
  // below would always conflict with the still-existing old submission doc,
  // permanently 409ing every resubmit-after-unlock. reset.ts already deletes
  // both, so `existingSelections` is empty there and this is a no-op.
  if (existingSelections.length > 0) {
    mutations.push({
      delete: {
        query: `*[_type == "selection" && album._ref == $albumId]`,
        params: { albumId: album._id },
      },
    });
    mutations.push({ delete: { id: `submission-${album._id}` } });
  }

  const selectionIds: string[] = [];
  for (const photoId of uniquePhotoIds) {
    const selectionId = crypto.randomUUID();
    const note = notesMap.get(photoId);
    mutations.push({
      create: {
        _type: "selection",
        _id: selectionId,
        album: { _type: "reference", _ref: album._id },
        photo: { _type: "reference", _ref: photoId },
        selectedAt: new Date().toISOString(),
        ...(note ? { notes: note } : {}),
      },
    });
    selectionIds.push(selectionId);
  }

  // Deterministic submission _id acts as an atomic lock: a concurrent second
  // *first-time* submit for the same album will fail with a 409 conflict on
  // create (the resubmit-after-unlock path above already deleted the old
  // one, so this narrower guard no longer applies to that case).
  mutations.push({
    create: {
      _type: "submission",
      _id: `submission-${album._id}`,
      album: { _type: "reference", _ref: album._id },
      selections: selectionIds.map((id) => ({
        _type: "reference",
        _ref: id,
      })),
      submittedAt: new Date().toISOString(),
    },
  });

  // ifRevisionID ties this patch to the exact album revision read above: if
  // the admin's reset.ts (or anything else) modifies the album in between —
  // e.g. wiping this same round's selections — this patch is rejected
  // instead of silently resurrecting a `submitted` status the admin just
  // reset, which would otherwise let an in-flight submit undo a reset.
  mutations.push({
    patch: { id: album._id, set: { status: "submitted" }, ifRevisionID: album._rev },
  });

  try {
    await sanityWriteClient.mutate(mutations);
  } catch (err) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    if (statusCode === 409) {
      // Covers both the submission-doc create conflict (a concurrent
      // first-time submit already claimed it) and the ifRevisionID mismatch
      // above (the admin unlocked/reset the gallery while this request was
      // in flight) — either way the client's view is stale, so ask it to
      // reload rather than claiming a specific (possibly wrong) cause.
      return new Response(
        JSON.stringify({ error: "This gallery changed while submitting — please reload and try again" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("[Submit] commit failed:", err);
    captureError(err, { route: "gallery/submit commit", albumId: album._id });
    return new Response(JSON.stringify({ error: "Failed to submit selection" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Status flipped to "submitted" above, so the cached admin albums list
  // (which includes status) must be invalidated too, not just selections.
  // Invalidate before publishing so the realtime event reliably signals a
  // refetch against fresh cache.
  await invalidateCache([
    CACHE_KEYS.albumsList(),
    CACHE_KEYS.albumSelections(album._id),
    // The live draft-progress key is spent once the real selections exist.
    CACHE_KEYS.galleryDraft(album._id),
    // Drop the gallery album cache for the slug this client is using so a
    // racing draft PUT re-reads `submitted` (and 409s) instead of a stale
    // `active` entry reviving the just-deleted draft key.
    CACHE_KEYS.albumBySlug(slug),
  ]);

  // Notify admin dashboard in real-time. publishAdminEvent never throws
  // (failures are logged inside), so a realtime failure can't turn the
  // already-committed, locked submission into a 500.
  await publishAdminEvent("submission:received", {
    albumId: album._id,
    count: uniquePhotoIds.length,
  });

  // Email the admin(s) too (ROADMAP #1). notifyAdminsOfSubmission is designed
  // to be the same no-throw shape as publishAdminEvent (missing config is a
  // no-op, provider failures logged + reported internally), but the email
  // path is wrapped in its own try/catch as a defensive belt-and-suspenders:
  // a future bug in the email lib must never be able to turn an
  // already-committed submission into a 500. captureError surfaces it to
  // Sentry; the response is unaffected either way.
  let origin: string;
  try {
    origin = new URL(request.url).origin;
  } catch {
    origin = "";
  }
  try {
    await notifyAdminsOfSubmission({
      albumId: album._id,
      albumTitle: album.title,
      clientName: album.clientName,
      selectionCount: uniquePhotoIds.length,
      galleryUrl: origin ? `${origin}/admin` : "",
    });
  } catch (err) {
    console.error("[Submit] admin email notification failed:", err);
    captureError(err, { route: "gallery/submit email", albumId: album._id });
  }

  return new Response(
    JSON.stringify({ success: true, selectionCount: uniquePhotoIds.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
