import { timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";
import { sanityClient, urlFor } from "@ylx/sanity/client";
import { albumBySlugQuery } from "@ylx/sanity/lib/queries";
import { isRateLimited, RATE_LIMIT_RETRY_AFTER } from "../../../../lib/ratelimit";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

interface SanityPhotoRaw {
  _id: string;
  filename: string;
  image: SanityImageRef;
  lqip?: string;
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

const MAX_ATTEMPTS_PER_IP = 5;
const MAX_ATTEMPTS_PER_ALBUM = 30;

function pinMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ params, request, clientAddress }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limiting: per IP+slug, plus a global per-slug cap so an attacker
  // rotating IPs (or spoofing forwarded headers) cannot get unlimited
  // fresh buckets against one album. `clientAddress` is the socket peer
  // address resolved by the platform adapter, not a client-supplied header.
  const ip = clientAddress ?? "unknown";

  const [ipLimited, albumLimited] = await Promise.all([
    isRateLimited(`${ip}:${slug}`, MAX_ATTEMPTS_PER_IP),
    isRateLimited(`album:${slug}`, MAX_ATTEMPTS_PER_ALBUM),
  ]);

  if (ipLimited || albumLimited) {
    return new Response(
      JSON.stringify({ error: "Too many attempts. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": RATE_LIMIT_RETRY_AFTER,
        },
      }
    );
  }

  const body = await request.json();
  const pin = body.pin as string | undefined;

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

  if (!pinMatches(album.pin, pin)) {
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
    lqip: photo.lqip ?? null,
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
