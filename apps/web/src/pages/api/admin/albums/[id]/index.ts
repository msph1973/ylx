import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";

const albumDetailQuery = `
  *[_type == "album" && _id == $id][0] {
    _id,
    title,
    clientName,
    eventDate,
    status,
    pin,
    maxSelections,
    isLocked,
    photos[] {
      _id,
      filename,
      url,
      thumbnailUrl,
      blurhash,
      width,
      height,
      albumId
    },
    selections[] {
      _id,
      albumId,
      photoId,
      selectedAt,
      photo-> {
        _id,
        filename,
        url,
        thumbnailUrl,
        blurhash,
        width,
        height,
        albumId
      }
    }
  }
`;

export const GET: APIRoute = async ({ params }) => {
  try {
    const albumId = params.id;
    if (!albumId) {
      return new Response(
        JSON.stringify({ error: "Album ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const album = await sanityClient.fetch(albumDetailQuery, { id: albumId });

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const formatted = {
      id: album._id,
      slug: album._id,
      clientName: album.clientName,
      pin: album.pin,
      maxSelections: album.maxSelections,
      isLocked: album.isLocked,
      createdAt: album.eventDate,
      photos: album.photos.map((p: any) => ({
        id: p._id,
        filename: p.filename,
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        blurhash: p.blurhash,
        width: p.width,
        height: p.height,
        albumId: p.albumId,
      })),
      selections: (album.selections || []).map((s: any) => ({
        id: s._id,
        albumId: s.albumId,
        photoId: s.photoId,
        selectedAt: s.selectedAt,
        photo: {
          id: s.photo._id,
          filename: s.photo.filename,
          url: s.photo.url,
          thumbnailUrl: s.photo.thumbnailUrl,
          blurhash: s.photo.blurhash,
          width: s.photo.width,
          height: s.photo.height,
          albumId: s.photo.albumId,
        },
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