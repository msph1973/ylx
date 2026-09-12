import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent } from "../../../../lib/ably";
import { cascadeDeleteAlbums } from "../../../../lib/albumDeletion";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";
import { parseJsonBody } from "../../../../lib/requestBody";
import { captureError } from "../../../../lib/errorTracking";

interface BulkDeleteBody {
  ids?: unknown;
}

interface AlbumSlugRaw {
  _id: string;
  owner?: { _ref: string };
  slug?: { current: string };
  customSlug?: string;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await parseJsonBody<BulkDeleteBody>(request);
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Request body must be a valid JSON object" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawIds = Array.isArray(body.ids) ? body.ids : [];
    const ids = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.length > 0))];

    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide a non-empty array of album ids" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch album slugs and customSlugs for cache invalidation before deletion
    const albums = await sanityClient.fetch<AlbumSlugRaw[]>(
      `*[_type == "album" && _id in $ids]{ _id, owner, slug, customSlug }`,
      { ids }
    );

    // Tenant guard (S2): all-or-nothing. Every requested id must resolve to
    // an album the caller owns (vendors) — a single foreign or missing id
    // rejects the whole batch with 404 (not 403) so vendors cannot probe
    // foreign ids, and nothing is deleted on the rejection path.
    // Ownerless legacy albums fail the vendor check by construction.
    if (session.role !== "superadmin") {
      const byId = new Map(albums.map((album) => [album._id, album]));
      const allOwned = ids.every(
        (id) => byId.get(id)?.owner?._ref === session.ownerId
      );
      if (!allOwned) {
        return new Response(
          JSON.stringify({ error: "Album not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const slugs = [
      ...albums.map((a) => a.slug?.current).filter((s): s is string => !!s),
      ...albums.map((a) => a.customSlug).filter((s): s is string => !!s),
    ];

    // One atomic transaction removes every selected album and its dependents.
    await cascadeDeleteAlbums(ids);

    // One bulk DEL instead of one invalidateCache call per album.
    await invalidateCache([
      CACHE_KEYS.albumsList(),
      ...ids.map((id) => CACHE_KEYS.albumSelections(id)),
      ...slugs.map((slug) => CACHE_KEYS.albumBySlug(slug)),
    ]);
    // A single realtime event lets every open dashboard refetch once.
    await publishAdminEvent("album:deleted", { albumIds: ids });

    return new Response(
      JSON.stringify({ success: true, deleted: ids.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Albums] bulk-delete failed:", error);
    captureError(error, { route: "admin/albums bulk-delete" });
    return new Response(
      JSON.stringify({ error: "Failed to delete albums" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
