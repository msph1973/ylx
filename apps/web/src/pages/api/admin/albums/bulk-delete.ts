import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent } from "../../../../lib/ably";
import { cascadeDeleteAlbums } from "../../../../lib/albumDeletion";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";

interface BulkDeleteBody {
  ids?: unknown;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await request.json()) as BulkDeleteBody;
    const rawIds = Array.isArray(body.ids) ? body.ids : [];
    const ids = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.length > 0))];

    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide a non-empty array of album ids" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // One atomic transaction removes every selected album and its dependents.
    await cascadeDeleteAlbums(ids);

    // A single realtime event lets every open dashboard refetch once.
    publishAdminEvent("album:deleted", { albumIds: ids });
    // One bulk DEL instead of one invalidateCache call per album.
    void invalidateCache([CACHE_KEYS.albumsList(), ...ids.map((id) => CACHE_KEYS.albumSelections(id))]);

    return new Response(
      JSON.stringify({ success: true, deleted: ids.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Albums] bulk-delete failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to delete albums" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
