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
  pin: string;
  photos: SanityPhotoRaw[];
}

export function buildGalleryAlbumResponse(album: SanityAlbumRaw) {
  const photos = (album.photos ?? []).map((photo) => ({
    id: photo._id,
    filename: photo.filename,
    // `.auto("format")` negotiates WebP/AVIF per client and `.quality()`
    // tunes compression; srcset lets the browser pick by layout width and
    // density. Shared with the admin thumbnails via @ylx/sanity/lib/thumbnails.
    thumbnailUrl: thumbnailUrl(photo.image),
    thumbnailSrcSet: thumbnailSrcSet(photo.image),
    url: urlFor(photo.image).width(1200).auto("format").quality(80).url(),
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
      photos,
    },
  };
}
