import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import {
  albumBySlugQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../../lib/auth";
import { getCached, CACHE_KEYS } from "../../../../lib/cache";

// This is an admin-only endpoint (guarded by `requireAdmin`) despite living
// under the `gallery/[slug]` route — the admin dashboard uses it to poll a
// single album's selections.
export const GET: APIRoute = async ({ params, cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Looked up by slug (not by id), so it isn't worth caching under the
  // per-album selections key — kept simple, low request volume.
  const album = await sanityClient.fetch(albumBySlugQuery, { slug });

  if (!album) {
    return new Response(JSON.stringify({ error: "Album not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // S2 tenant isolation: vendors only poll their own albums (404, not 403).
  // albumBySlugQuery projects owner->{_id,...}; ownerless legacy albums
  // are superadmin-only.
  const albumOwnerId =
    album.owner !== null &&
    typeof album.owner === "object" &&
    "_id" in album.owner &&
    typeof album.owner._id === "string"
      ? album.owner._id
      : undefined;
  if (session.role !== "superadmin" && albumOwnerId !== session.ownerId) {
    return new Response(JSON.stringify({ error: "Album not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const selections = await getCached(
    CACHE_KEYS.albumSelections(album._id),
    15,
    60,
    () => sanityClient.fetch(selectionsByAlbumQuery, { albumId: album._id })
  );

  return new Response(
    JSON.stringify({
      albumId: album._id,
      status: album.status,
      selections,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=0, stale-while-revalidate=15",
      },
    }
  );
};
