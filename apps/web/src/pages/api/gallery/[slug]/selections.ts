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
  if (!requireAdmin(cookies)) {
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
