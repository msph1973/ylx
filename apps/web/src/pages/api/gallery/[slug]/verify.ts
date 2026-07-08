import { timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";
import { sanityClient, urlFor } from "@ylx/sanity/client";
import { albumBySlugQuery } from "@ylx/sanity/lib/queries";
import {
  isLimitReached,
  isRateLimited,
  RATE_LIMIT_RETRY_AFTER,
  recordFailedAttempt,
} from "../../../../lib/ratelimit";

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
const MAX_FAILED_ATTEMPTS_PER_ALBUM = 30;

function pinMatches(expected: string, provided: string): boolean {
  // Defensive: a non-string here would make Buffer.from throw (TypeError -> 500).
  // Guard so a malformed input degrades to a clean "no match" instead of a crash.
  if (typeof expected !== "string" || typeof provided !== "string") {
    return false;
  }
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

  // Rate limiting: per IP+slug, plus a global per-slug cap on *failed*
  // attempts so an attacker rotating IPs (or spoofing forwarded headers)
  // cannot get unlimited fresh buckets against one album, while successful
  // logins by many guests never lock the album. `clientAddress` is the
  // socket peer address resolved by the platform adapter, not a
  // client-supplied header.
  const ip = clientAddress ?? "unknown";
  const albumKey = `album:${slug}`;

  const [ipLimited, albumLimited] = await Promise.all([
    isRateLimited(`${ip}:${slug}`, MAX_ATTEMPTS_PER_IP),
    isLimitReached(albumKey, MAX_FAILED_ATTEMPTS_PER_ALBUM),
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
  const pin = body.pin;

  // Reject anything that isn't a non-empty string (e.g. { "pin": 1234 } or
  // a missing field) with a clean 400 instead of letting Buffer.from throw a 500.
  if (typeof pin !== "string" || pin.length === 0) {
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
    await recordFailedAttempt(albumKey);
    return new Response(JSON.stringify({ error: "Invalid PIN" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const photos = (album.photos ?? []).map((photo) => {
    // `.auto("format")` negotiates WebP/AVIF per client (typically 30-60% smaller
    // than the original JPEG) and `.quality()` tunes compression — both were
    // missing, so the CDN served full-quality originals. The 2x thumbnail feeds a
    // srcset so retina phones get a sharp tile without every device paying for it.
    const thumb1x = urlFor(photo.image)
      .width(400)
      .height(400)
      .fit("crop")
      .auto("format")
      .quality(75)
      .url();
    const thumb2x = urlFor(photo.image)
      .width(800)
      .height(800)
      .fit("crop")
      .auto("format")
      .quality(70)
      .url();
    return {
      id: photo._id,
      filename: photo.filename,
      thumbnailUrl: thumb1x,
      thumbnailSrcSet: `${thumb1x} 1x, ${thumb2x} 2x`,
      url: urlFor(photo.image).width(1600).auto("format").quality(80).url(),
      lqip: photo.lqip ?? null,
    };
  });

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
