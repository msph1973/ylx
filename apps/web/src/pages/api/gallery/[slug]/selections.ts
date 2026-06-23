import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import {
  albumBySlugQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const album = await sanityClient.fetch(albumBySlugQuery, { slug });

  if (!album) {
    return new Response(JSON.stringify({ error: "Album not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const selections = await sanityClient.fetch(selectionsByAlbumQuery, {
    albumId: album._id,
  });

  return new Response(
    JSON.stringify({
      albumId: album._id,
      status: album.status,
      selections,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};
