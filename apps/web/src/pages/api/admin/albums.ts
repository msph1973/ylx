import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { allAlbumsQuery } from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../lib/auth";

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
      pin: album.pin,
      status: album.status,
      isLocked: album.status === "locked",
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

interface CreateAlbumBody {
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json() as CreateAlbumBody;
    const { title, clientName, eventDate, pin, maxSelections } = body;

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

    // Generate base slug from title
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check for slug collision and append short timestamp suffix if needed
    const existingWithSlug = await sanityClient.fetch<{ _id: string }[]>(
      `*[_type == "album" && slug.current == $slug]{_id}`,
      { slug: baseSlug }
    );
    const slug = existingWithSlug.length > 0
      ? `${baseSlug}-${Date.now().toString(36)}`
      : baseSlug;

    const doc = await sanityWriteClient.create({
      _type: "album",
      title,
      slug: { _type: "slug", current: slug },
      clientName,
      eventDate,
      pin,
      maxSelections,
      status: "active",
      photos: [],
    });

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
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to create album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
