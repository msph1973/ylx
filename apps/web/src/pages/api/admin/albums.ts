import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { allAlbumsQuery } from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../lib/auth";

interface SanityAlbumRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: string;
  photoCount: number;
}

export const GET: APIRoute = async ({ cookies }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const albums = await sanityClient.fetch<SanityAlbumRaw[]>(allAlbumsQuery);

    const formatted = albums.map((album) => ({
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
