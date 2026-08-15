// Shared final-photos response builder for the client gallery delivered flow.
// Used by the gallery final-photos endpoint to return the delivered photos
// with download-friendly URLs.

import { urlFor } from "@ylx/sanity/client";
import { thumbnailUrl, thumbnailSrcSet } from "@ylx/sanity/lib/thumbnails";

interface SanityImageRef {
  _type: string;
  asset: { _ref: string };
}

export interface SanityFinalPhotoRaw {
  _id: string;
  filename: string;
  image: SanityImageRef;
  lqip?: string | null;
}

export function buildGalleryFinalPhotosResponse(finalPhotos: SanityFinalPhotoRaw[]) {
  return {
    finalPhotos: (finalPhotos ?? []).map((photo) => ({
      id: photo._id,
      filename: photo.filename,
      thumbnailUrl: thumbnailUrl(photo.image),
      thumbnailSrcSet: thumbnailSrcSet(photo.image),
      // Original-quality URL for download
      url: urlFor(photo.image).url(),
      lqip: photo.lqip ?? null,
    })),
  };
}
