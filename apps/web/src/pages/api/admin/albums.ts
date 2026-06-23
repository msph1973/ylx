import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { allAlbumsQuery } from "@ylx/sanity/lib/queries";

export const GET: APIRoute = async () => {
  try {
    const albums = await sanityClient.fetch(allAlbumsQuery);

    const formatted = albums.map((album: any) => ({
      id: album._id,
      title: album.title,
      clientName: album.clientName,
      eventDate: album.eventDate,
      status: album.status,
      photoCount: album.photoCount,
    }));

    return new Response(JSON.stringify({ albums: formatted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch albums" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
