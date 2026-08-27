// Shared final-photos response builder for the client gallery delivered flow.
// Used by the gallery final-photos endpoint to return the delivered photos
// with download-friendly URLs.
//
// Storage note: final delivery is disabled for Drive-storage albums today,
// but nothing at the data layer prevents a driveFileId photo from ending up
// in `finalPhotos` (Studio edit, a future flow) — so the builder handles both
// backends instead of assuming every final photo is a Sanity asset.

import { urlFor } from "@ylx/sanity/client";
import { thumbnailUrl, thumbnailSrcSet } from "@ylx/sanity/lib/thumbnails";
import { driveThumbUrl, driveDownloadUrl } from "./gdrive";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

export interface SanityFinalPhotoRaw {
  _id: string;
  filename: string;
  image?: SanityImageRef;
  driveFileId?: string | null;
  driveResourceKey?: string | null;
  lqip?: string | null;
}

export function buildGalleryFinalPhotosResponse(finalPhotos: SanityFinalPhotoRaw[]) {
  return {
    finalPhotos: (finalPhotos ?? []).map((photo) => {
      if (photo.driveFileId) {
        // Direct navigation URLs (never fetch()ed client-side — no CORS).
        return {
          id: photo._id,
          filename: photo.filename,
          thumbnailUrl: driveThumbUrl(photo.driveFileId, 400, photo.driveResourceKey),
          thumbnailSrcSet: undefined as string | undefined,
          // Original-quality URL for download
          url: driveDownloadUrl(photo.driveFileId, photo.driveResourceKey),
          lqip: null as string | null,
        };
      }

      const { image } = photo;
      if (!image) {
        // image-XOR-driveFileId is enforced at the API layer; render-safe
        // placeholder over a hard crash if a hand-edited doc violates it.
        return {
          id: photo._id,
          filename: photo.filename,
          thumbnailUrl: "",
          thumbnailSrcSet: undefined as string | undefined,
          url: "",
          lqip: null as string | null,
        };
      }

      return {
        id: photo._id,
        filename: photo.filename,
        thumbnailUrl: thumbnailUrl(image),
        thumbnailSrcSet: thumbnailSrcSet(image),
        // Original-quality URL for download
        url: urlFor(image).url(),
        lqip: photo.lqip ?? null,
      };
    }),
  };
}
