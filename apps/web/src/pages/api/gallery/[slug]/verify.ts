import type { APIRoute } from "astro";
import { sanityClient, urlFor } from "@ylx/sanity/client";
import { albumBySlugQuery } from "@ylx/sanity/lib/queries";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

interface SanityPhotoRaw {
  _id: string;
  filename: string;
  image: SanityImageRef;
}

interface SanityAlbumRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: string;
  maxSelections: number;
  pin: string;
  photos: SanityPhotoRaw[];
}

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const pin = body.pin;

  if (!pin) {
    return new Response(JSON.stringify({ error: "Missing pin" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const album = await sanityClient.fetch<SanityAlbumRaw | null>(albumBySlugQuery, { slug });

  if (!album) {
    return new Response(JSON.stringify({ error: "Album not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (album.pin !== pin) {
    return new Response(JSON.stringify({ error: "Invalid PIN" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const photos = (album.photos ?? []).map((photo) => ({
    id: photo._id,
    filename: photo.filename,
    thumbnailUrl: urlFor(photo.image).width(400).height(400).fit("crop").url(),
    url: urlFor(photo.image).width(1200).url(),
  }));

  return new Response(
    JSON.stringify({
      album: {
        id: album._id,
        title: album.title,
        clientName: album.clientName,
        eventDate: album.eventDate,
        status: album.status,
        maxSelections: album.maxSelections,
        photos,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};
