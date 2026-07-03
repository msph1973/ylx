import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient, urlFor } from "@ylx/sanity/client";
import {
  albumWithSelectionsQuery,
  selectionsByAlbumQuery,
} from "@ylx/sanity/lib/queries";
import { requireAdmin } from "../../../../../lib/auth";
import { generateUniqueSlug } from "../../../../../lib/slug";
import { publishAdminEvent } from "../../../../../lib/ably";
import { cascadeDeleteAlbums } from "../../../../../lib/albumDeletion";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

interface SanityPhotoRaw {
  _id: string;
  filename: string;
  image: SanityImageRef;
  lqip?: string | null;
}

/** Build a square, cropped thumbnail URL for an uploaded photo. */
function thumbnailUrl(image: SanityImageRef): string {
  return urlFor(image).width(400).height(400).fit("crop").url();
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
      isLocked: album.status !== 'active',
      photos: (album.photos ?? []).map((p) => ({
        id: p._id,
        filename: p.filename,
        thumbnailUrl: thumbnailUrl(p.image),
        lqip: p.lqip ?? null,
      })),
      selections: selections.map((s) => ({
        id: s._id,
        photo: {
          id: s.photo._id,
          filename: s.photo.filename,
          thumbnailUrl: thumbnailUrl(s.photo.image),
          lqip: s.photo.lqip ?? null,
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

    // Note: past-date validation is intentionally NOT enforced on edit.
    // Albums whose event has already occurred (e.g. a finished wedding) must
    // remain editable. New albums still enforce the future-date rule in the
    // POST create handler (`albums.ts`).

    const patch: Record<string, unknown> = {};
    if (title !== undefined) {
      patch.title = title;
      patch.slug = { _type: "slug", current: await generateUniqueSlug(title, albumId) };
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
    // Cascade-delete the album with its selections, submissions, and photos.
    await cascadeDeleteAlbums([albumId]);

    publishAdminEvent("album:deleted", { albumId });

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
