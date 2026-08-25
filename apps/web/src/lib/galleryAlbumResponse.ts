// Shared album-response builder for the gallery PIN flow. Used by both
// verify.ts (after a successful PIN) and session.ts (resume via the signed
// gallery_pin_session cookie) so the client receives an identical payload
// from either path.
//
// Two storage backends exist per album (`storageType`):
// - "sanity"  → photos are Sanity assets; URLs come from the image pipeline,
//               LQIP blur-up included; original downloads are delivery-gated.
// - "drive"   → photos live in the photographer's Google Drive; every URL is
//               derived from `driveFileId`. The folder is necessarily shared
//               "anyone with link" (that's what makes <img> thumbnails render),
//               so payload-level download gating adds no real protection here
//               — Drive photos always carry their direct download link.

import { urlFor } from "@ylx/sanity/client";
import { thumbnailUrl as sanityThumbnailUrl, thumbnailSrcSet as sanityThumbnailSrcSet } from "@ylx/sanity/lib/thumbnails";
import { driveThumbUrl, driveDownloadUrl } from "./gdrive";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

export interface SanityPhotoRaw {
  _id: string;
  filename: string;
  image?: SanityImageRef;
  driveFileId?: string | null;
  lqip?: string | null;
}

export interface SanityAlbumRaw {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: string;
  maxSelections: number;
  storageType?: "sanity" | "drive";
  lastUnlockedAt?: string | null;
  showOriginalAfterDelivery?: boolean;
  photos: SanityPhotoRaw[];
}

export function buildGalleryAlbumResponse(album: SanityAlbumRaw) {
  const isDrive = album.storageType === "drive";
  // Only ever emit the Sanity full-original-resolution download URL once the
  // album is actually delivered AND the admin opted in to originals access —
  // otherwise a client with a valid PIN/session (e.g. still in the proofing
  // stage, or delivered with originals turned off) could pull the payload
  // and download full-res originals they were never granted access to, even
  // though the UI (Semua Foto tab, batch ZIP) correctly hides that path.
  const canIncludeSanityDownloadUrl = album.status === "delivered" && album.showOriginalAfterDelivery === true;
  // Sanity path guard: the create/update API enforces image-XOR-driveFileId,
  // but a hand-edited Studio doc could violate it — emit a render-safe
  // placeholder instead of crashing the whole gallery response.
  const sanityPhotoUrls = (image: SanityImageRef, lqip?: string | null) => ({
    thumbnailUrl: sanityThumbnailUrl(image),
    thumbnailSrcSet: sanityThumbnailSrcSet(image),
    url: urlFor(image).width(1200).auto("format").quality(80).url(),
  });

  const photos = (album.photos ?? []).map((photo) => {
    if (isDrive && photo.driveFileId) {
      return {
        id: photo._id,
        filename: photo.filename,
        thumbnailUrl: driveThumbUrl(photo.driveFileId, 400),
        // Drive thumbnails only expose a few fixed sizes — no srcSet.
        thumbnailSrcSet: undefined,
        url: driveThumbUrl(photo.driveFileId, 1600),
        // Direct navigation link (never fetch()ed by the client — Drive
        // sends no CORS headers). See GalleryPage's download handler.
        downloadUrl: driveDownloadUrl(photo.driveFileId),
        // Drive serves no LQIP placeholders; BlurImage falls back to a
        // plain fade-in when lqip is null.
        lqip: null as string | null,
      };
    }

    const { image } = photo;
    if (!image) {
      return {
        id: photo._id,
        filename: photo.filename,
        thumbnailUrl: "",
        thumbnailSrcSet: undefined,
        url: "",
        lqip: null as string | null,
      };
    }

    return {
      id: photo._id,
      filename: photo.filename,
      ...sanityPhotoUrls(image, photo.lqip),
      // Full-original-quality URL for download — `url` above is a resized/
      // compressed derivative meant for on-screen viewing only, matching the
      // same `urlFor(photo.image).url()` pattern already used for downloads
      // in galleryFinalPhotosResponse.ts. Gated above so it's never present in
      // the payload unless the client is actually entitled to it.
      ...(canIncludeSanityDownloadUrl ? { downloadUrl: urlFor(image).url() } : {}),
      lqip: photo.lqip ?? null,
    };
  });

  return {
    album: {
      id: album._id,
      title: album.title,
      clientName: album.clientName,
      eventDate: album.eventDate,
      status: album.status,
      maxSelections: album.maxSelections,
      // Storage backend marker — drives which download affordances the UI
      // offers (per-photo direct links vs gated originals/ZIP).
      storageType: isDrive ? ("drive" as const) : ("sanity" as const),
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
