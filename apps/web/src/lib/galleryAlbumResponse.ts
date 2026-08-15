// Shared album-response builder for the gallery PIN flow. Used by both
// verify.ts (after a successful PIN) and session.ts (resume via the signed
// gallery_pin_session cookie) so the client receives an identical payload
// from either path.

import { urlFor } from "@ylx/sanity/client";
import { thumbnailUrl, thumbnailSrcSet } from "@ylx/sanity/lib/thumbnails";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

export interface SanityPhotoRaw {
  _id: string;
  filename: string;
  image: SanityImageRef;
  lqip?: string;
}

export interface SanityAlbumRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: string;
  maxSelections: number;
  lastUnlockedAt?: string | null;
  showOriginalAfterDelivery?: boolean;
  photos: SanityPhotoRaw[];
}

export function buildGalleryAlbumResponse(album: SanityAlbumRaw) {
  // Only ever emit the full-original-resolution download URL once the album
  // is actually delivered AND the admin opted in to originals access —
  // otherwise a client with a valid PIN/session (e.g. still in the proofing
  // stage, or delivered with originals turned off) could pull the payload
  // and download full-res originals they were never granted access to, even
  // though the UI (Semua Foto tab, batch ZIP) correctly hides that path.
  const canIncludeDownloadUrl = album.status === "delivered" && album.showOriginalAfterDelivery === true;
  const photos = (album.photos ?? []).map((photo) => ({
    id: photo._id,
    filename: photo.filename,
    // `.auto("format")` negotiates WebP/AVIF per client and `.quality()`
    // tunes compression; srcset lets the browser pick by layout width and
    // density. Shared with the admin thumbnails via @ylx/sanity/lib/thumbnails.
    thumbnailUrl: thumbnailUrl(photo.image),
    thumbnailSrcSet: thumbnailSrcSet(photo.image),
    url: urlFor(photo.image).width(1200).auto("format").quality(80).url(),
    // Full-original-quality URL for download — `url` above is a resized/
    // compressed derivative meant for on-screen viewing only, matching the
    // same `urlFor(photo.image).url()` pattern already used for downloads
    // in galleryFinalPhotosResponse.ts. Gated above so it's never present in
    // the payload unless the client is actually entitled to it.
    ...(canIncludeDownloadUrl ? { downloadUrl: urlFor(photo.image).url() } : {}),
    lqip: photo.lqip ?? null,
  }));

  return {
    album: {
      id: album._id,
      title: album.title,
      clientName: album.clientName,
      eventDate: album.eventDate,
      status: album.status,
      maxSelections: album.maxSelections,
      // Draft revision marker — the client discards drafts saved before the
      // most recent unlock (see selectionDraft.loadDraft's notBefore).
      lastUnlockedAt: album.lastUnlockedAt ?? null,
      // Admin-controlled, set fresh at delivery time (deliver.ts) — defaults
      // to false (hide the originals tab) for any album that predates this
      // field and was never re-delivered since.
      showOriginalAfterDelivery: album.showOriginalAfterDelivery === true,
      photos,
    },
  };
}
