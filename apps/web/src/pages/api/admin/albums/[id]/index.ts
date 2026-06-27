import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import {
  albumWithSelectionsQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../../../lib/auth";

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
  pin: string;
  slug: { current: string };
  maxSelections: number;
  status: string;
  photos: SanityPhotoRaw[];
}

export const GET: APIRoute = async ({ params, cookies }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

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
      pin: album.pin,
      slug: album.slug?.current ?? null,
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

interface UpdateAlbumBody {
  title?: string;
  clientName?: string;
  eventDate?: string;
  pin?: string;
  maxSelections?: number;
}

export const PUT: APIRoute = async ({ params, cookies, request }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const albumId = params.id;
  if (!albumId) {
    return new Response(
      JSON.stringify({ error: "Album ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify album exists before patching
    const existingAlbum = await sanityClient.fetch<{ _id: string } | null>(
      `*[_type == "album" && _id == $id][0]{_id}`,
      { id: albumId }
    );
    if (!existingAlbum) {
      return new Response(
        JSON.stringify({ error: "Album not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json() as UpdateAlbumBody;
    const { title, clientName, eventDate, pin, maxSelections } = body;

    if (pin !== undefined && !/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: "PIN must be exactly 4 digits" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (maxSelections !== undefined && (typeof maxSelections !== "number" || maxSelections < 1)) {
      return new Response(
        JSON.stringify({ error: "maxSelections must be a positive number" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (eventDate !== undefined) {
      const today = new Date().toLocaleDateString("en-CA");
      if (eventDate < today) {
        return new Response(
          JSON.stringify({ error: "Event date cannot be in the past" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const patch: Record<string, unknown> = {};
    if (title !== undefined) {
      patch.title = title;
      // Generate new slug from title; check collision only if title changed
      const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const collision = await sanityClient.fetch<{ _id: string }[]>(
        `*[_type == "album" && slug.current == $slug && _id != $id]{_id}`,
        { slug: baseSlug, id: albumId }
      );
      patch.slug = {
        _type: "slug",
        current: collision.length > 0
          ? `${baseSlug}-${Date.now().toString(36)}`
          : baseSlug,
      };
    }
    if (clientName !== undefined) patch.clientName = clientName;
    if (eventDate !== undefined) patch.eventDate = eventDate;
    if (pin !== undefined) patch.pin = pin;
    if (maxSelections !== undefined) patch.maxSelections = maxSelections;

    if (Object.keys(patch).length === 0) {
      return new Response(
        JSON.stringify({ error: "No fields to update" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const updated = await sanityWriteClient.patch(albumId).set(patch).commit();

    return new Response(
      JSON.stringify({
        album: {
          id: updated._id,
          title: updated.title as string,
          clientName: updated.clientName as string,
          eventDate: updated.eventDate as string,
          pin: updated.pin as string,
          maxSelections: updated.maxSelections as number,
          status: updated.status as string,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to update album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const albumId = params.id;
  if (!albumId) {
    return new Response(
      JSON.stringify({ error: "Album ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Delete all selections for this album first
    const selectionsQuery = `*[_type == "selection" && album._ref == $albumId]._id`;
    const selectionIds = await sanityClient.fetch<string[]>(selectionsQuery, { albumId });

    const transaction = sanityWriteClient.transaction();
    for (const selId of selectionIds) {
      transaction.delete(selId);
    }
    transaction.delete(albumId);
    await transaction.commit();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to delete album" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
