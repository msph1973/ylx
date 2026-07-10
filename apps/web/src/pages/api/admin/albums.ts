import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { allAlbumsQuery } from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../lib/auth";
import { generateUniqueSlug, resolveCustomSlug } from "../../../lib/slug";
import { publishAdminEvent } from "../../../lib/ably";
import { getCached, invalidateCache, CACHE_KEYS } from "../../../lib/cache";

interface SanityAlbumRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  status: string;
  photoCount: number;
}

export const GET: APIRoute = async ({ cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const albums = await getCached(CACHE_KEYS.albumsList(), 30, 120, () =>
      sanityClient.fetch<SanityAlbumRaw[]>(allAlbumsQuery)
    );

    const formatted = albums.map((album) => ({
      id: album._id,
      title: album.title,
      clientName: album.clientName,
      eventDate: album.eventDate,
      pin: album.pin,
      status: album.status,
      isLocked: album.status !== "active",
      photoCount: album.photoCount,
    }));

    // Response carries each album's PIN (sensitive) so it must never be cached
    // by a shared/CDN cache — `private` restricts reuse to the requesting client.
    return new Response(JSON.stringify({ albums: formatted }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=0, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("[Albums] GET failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch albums" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

interface CreateAlbumBody {
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number;
  customSlug?: string;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json() as CreateAlbumBody;
    const { title, clientName, eventDate, pin, maxSelections, customSlug } = body;

    if (!title || !clientName || !eventDate || !pin || !maxSelections) {
      return new Response(
        JSON.stringify({ error: "All fields are required: title, clientName, eventDate, pin, maxSelections" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: "PIN must be exactly 4 digits" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (typeof maxSelections !== "number" || maxSelections < 1) {
      return new Response(
        JSON.stringify({ error: "maxSelections must be a positive number" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate event date is not in the past (compare in local timezone)
    const today = new Date().toLocaleDateString("en-CA");
    if (eventDate < today) {
      return new Response(
        JSON.stringify({ error: "Event date cannot be in the past" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let resolvedCustomSlug: string | undefined;
    if (customSlug) {
      resolvedCustomSlug = (await resolveCustomSlug(customSlug)) ?? undefined;
      if (!resolvedCustomSlug) {
        return new Response(
          JSON.stringify({ error: "Custom slug is invalid or already taken" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const slug = await generateUniqueSlug(title);

    const doc = await sanityWriteClient.create({
      _type: "album",
      title,
      slug: { _type: "slug", current: slug },
      ...(resolvedCustomSlug ? { customSlug: resolvedCustomSlug } : {}),
      clientName,
      eventDate,
      pin,
      maxSelections,
      status: "active",
      photos: [],
    });

    publishAdminEvent("album:created", { albumId: doc._id });
    await invalidateCache(CACHE_KEYS.albumsList());

    return new Response(
      JSON.stringify({
        album: {
          id: doc._id,
          title: doc.title as string,
          clientName: doc.clientName as string,
          eventDate: doc.eventDate as string,
          pin: doc.pin as string,
          maxSelections: doc.maxSelections as number,
          status: doc.status as string,
          photoCount: 0,
          customSlug: doc.customSlug as string | undefined,
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Albums] POST failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
