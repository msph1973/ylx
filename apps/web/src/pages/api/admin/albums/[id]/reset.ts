import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../../lib/auth";
import { publishAdminEvent, publishAlbumEvent } from "../../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../../lib/cache";
import { captureError } from "../../../../../lib/errorTracking";

// Reset is the deliberate, destructive counterpart to unlock.ts: unlock only
// reopens the gallery for revision and keeps the client's previous pick
// intact, but an admin sometimes genuinely wants to wipe it (e.g. the client
// asked to start over, or the picks were a mistake). This is the only
// endpoint left that deletes selection/submission docs — everywhere else
// (unlock, resubmit) now preserves them.
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
    const album = await sanityClient.fetch<{ status: string; slug?: { current: string }; customSlug?: string } | null>(
      `*[_type == "album" && _id == $albumId][0]{ status, slug, customSlug }`,
      { albumId }
    );

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delivery is a terminal state (final photos already handed to the
    // client) — reopening it as `active` here would let the client submit
    // new proofing selections against an album that's already past that
    // stage. If a delivered album genuinely needs its picks cleared, that's
    // a distinct, not-yet-built "undo delivery" action, not this endpoint.
    if (album.status === "delivered") {
      return new Response(
        JSON.stringify({ error: "Cannot reset a delivered album" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delete by query (rather than reading selection/submission ids first and
    // deleting that fixed list) so a selection or submission created by a
    // request racing this reset is also caught. All three mutations commit
    // as one atomic transaction, and also reopen the gallery (status: active)
    // so the client can start a fresh pick right away instead of needing a
    // separate unlock afterwards.
    // lastUnlockedAt is the draft revision marker: the gallery discards any
    // locally-stored draft saved before this moment, so a client that missed
    // the realtime reset event can't restore selections the server deleted.
    await sanityWriteClient.mutate([
      {
        delete: {
          query: `*[_type == "selection" && album._ref == $albumId]`,
          params: { albumId },
        },
      },
      {
        delete: {
          query: `*[_type == "submission" && album._ref == $albumId]`,
          params: { albumId },
        },
      },
      {
        patch: {
          id: albumId,
          set: { status: "active", lastUnlockedAt: new Date().toISOString() },
        },
      },
    ]);

    await invalidateCache([
      CACHE_KEYS.albumsList(),
      CACHE_KEYS.albumSelections(albumId),
      // Reset wipes the client's selections, so any stale draft-progress
      // count from the previous round must not linger on the dashboard.
      CACHE_KEYS.galleryDraft(albumId),
      ...(album.slug?.current ? [CACHE_KEYS.albumBySlug(album.slug.current)] : []),
      ...(album.customSlug ? [CACHE_KEYS.albumBySlug(album.customSlug)] : []),
    ]);
    await Promise.all([
      publishAdminEvent("album:reset", { albumId }),
      publishAlbumEvent(albumId, "album:reset"),
    ]);

    return new Response(JSON.stringify({ success: true, id: albumId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Reset]", error);
    captureError(error, { route: "admin/albums/[id]/reset", albumId });
    return new Response(
      JSON.stringify({ error: "Failed to reset album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
