import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { albumFinalPhotosQuery, albumPinBySlugQuery } from "@ylx/sanity/lib/queries";
import { hasActiveSession, hasValidPinSession } from "../../../../lib/gallerySession";
import { buildGalleryFinalPhotosResponse, type SanityFinalPhotoRaw } from "../../../../lib/galleryFinalPhotosResponse";
import { captureError } from "../../../../lib/errorTracking";

interface AlbumFinalPhotosRaw {
  _id: string;
  title: string;
  status: string;
  finalPhotos: SanityFinalPhotoRaw[];
}

// Client-facing endpoint: returns the final delivered photos for a gallery.
// Only accessible when the client has an active PIN session AND the album
// status is "delivered".
export const GET: APIRoute = async ({ params, cookies }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Cheap gate before any Sanity work: a client with no valid signed gallery
  // cookie can't force album lookups by enumerating slugs.
  if (!hasActiveSession(cookies)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Fetch both the album (delivered-only via query filter) and its pin
    // so we can validate the session is bound to the current PIN — same
    // pattern as submit.ts and session.ts: a PIN change must invalidate
    // every existing session immediately, even for this read-only endpoint.
    const [album, pinRecord] = await Promise.all([
      sanityClient.fetch<AlbumFinalPhotosRaw | null>(
        albumFinalPhotosQuery,
        { slug }
      ),
      sanityClient.fetch<{ pin: string } | null>(albumPinBySlugQuery, { slug }),
    ]);

    if (!album || !pinRecord || !hasValidPinSession(cookies, album._id, pinRecord.pin)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const response = buildGalleryFinalPhotosResponse(album.finalPhotos ?? []);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[Gallery/final-photos] GET failed:", slug, error);
    captureError(error, { route: "gallery/[slug]/final-photos GET", slug });
    return new Response(
      JSON.stringify({ error: "Failed to fetch final photos" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
