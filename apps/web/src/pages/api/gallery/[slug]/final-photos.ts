import type { APIRoute } from "astro";
import { sanityClient } from "@ylx/sanity/client";
import { albumFinalPhotosQuery } from "@ylx/sanity/lib/queries";
import { hasActiveSession } from "../../../../lib/gallerySession";
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

  // Must have a valid gallery session (PIN-verified, not expired).
  if (!hasActiveSession(cookies)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // albumFinalPhotosQuery filters status == "delivered" server-side, so
    // if the album exists but isn't delivered, this returns null.
    const album = await sanityClient.fetch<AlbumFinalPhotosRaw | null>(
      albumFinalPhotosQuery,
      { slug }
    );

    if (!album) {
      return new Response(
        JSON.stringify({ error: "Album not found or not yet delivered" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
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
