import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";
import { captureError } from "../../../../../lib/errorTracking";

export const POST: APIRoute = async ({ params, cookies }) => {
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

  try {
    // Fetch album slug and customSlug for cache invalidation, and confirm the
    // album actually exists — without this, a bad id falls through to a
    // Sanity patch on a missing document and surfaces as a raw 500 instead
    // of a clean 404 (mirrors the existence check in lock.ts).
    const album = await sanityClient.fetch<{ slug?: { current: string }; customSlug?: string } | null>(
      `*[_type == "album" && _id == $albumId][0]{ slug, customSlug }`,
      { albumId }
    );

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Unlock only reopens the gallery for revision — it deliberately does NOT
    // delete the existing selection/submission docs. Deleting here used to
    // wipe the client's whole previous pick (and any photographerReply notes
    // on it) on every unlock, which made revising a selection painful. The
    // previous picks now stay intact — visible to the admin and pre-filled
    // for the client — until either the client resubmits (submit.ts replaces
    // them atomically) or the admin explicitly hits "Reset" (reset.ts, the
    // only place that still deletes them).
    // lastUnlockedAt is the draft revision marker: the gallery discards any
    // locally-stored draft saved before this moment (it may describe a pick
    // the client abandoned mid-edit before this unlock), falling back to the
    // still-intact server-side selection instead.
    await sanityWriteClient.mutate([
      {
        patch: {
          id: albumId,
          set: { status: "active", lastUnlockedAt: new Date().toISOString() },
        },
      },
    ]);

    await invalidateCache([
      CACHE_KEYS.albumsList(),
      // Selections are unchanged by unlock now, but the gallery's cached
      // album-by-slug response still needs a bust: `status` flipped to
      // "active" and that response is what the client's realtime handler
      // re-fetches to pre-fill the (still-intact) previous selection.
      CACHE_KEYS.galleryDraft(albumId),
      ...(album.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("album:unlocked", { albumId }),
      publishAlbumEvent(albumId, "album:unlocked"),
    ]);

    return new Response(JSON.stringify({ success: true, id: albumId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Unlock]", error);
    captureError(error, { route: "admin/albums/[id]/unlock", albumId });
    return new Response(
      JSON.stringify({ error: "Failed to unlock album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
