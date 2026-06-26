import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import {
  albumWithSelectionsQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

interface SanityPhotoRaw {
  _id: string;
  filename: string;
  image: SanityImageRef;
}

interface SanitySelectionRaw {
  _id: string;
  photo: SanityPhotoRaw;
  selectedAt: string;
}

interface SanityAlbumDetailRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  maxSelections: number;
  status: string;
  photos: SanityPhotoRaw[];
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const albumId = params.id;
    if (!albumId) {
      return new Response(
        JSON.stringify({ error: "Album ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const album = await sanityClient.fetch<SanityAlbumDetailRaw | null>(albumWithSelectionsQuery, {
      albumId,
    });

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const selections = await sanityClient.fetch<SanitySelectionRaw[]>(selectionsByAlbumQuery, {
      albumId,
    });

    const formatted = {
      id: album._id,
      title: album.title,
      clientName: album.clientName,
      eventDate: album.eventDate,
      maxSelections: album.maxSelections,
      status: album.status,
      photos: (album.photos ?? []).map((p) => ({
        id: p._id,
        filename: p.filename,
        image: p.image,
      })),
      selections: selections.map((s) => ({
        id: s._id,
        photo: {
          id: s.photo._id,
          filename: s.photo.filename,
          image: s.photo.image,
        },
        selectedAt: s.selectedAt,
      })),
    };

    return new Response(JSON.stringify({ album: formatted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
