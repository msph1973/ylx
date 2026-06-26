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

// In-memory rate limiter: max 5 attempts per 15 minutes per IP+slug key.
// Note: resets on serverless cold-start, which is acceptable for this use case.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count += 1;
  return false;
}

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limiting: key = IP + slug
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rateLimitKey = `${ip}:${slug}`;

  if (isRateLimited(rateLimitKey)) {
    return new Response(
      JSON.stringify({ error: "Too many attempts. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "900",
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
