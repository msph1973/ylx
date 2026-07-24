import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { urlFor } from "../client";

/** Build a square, cropped thumbnail URL for an uploaded photo.
 *  `.auto("format")` serves WebP/AVIF where supported and `.quality()` tunes
 *  compression — both were missing at one point, so grids downloaded
 *  full-quality originals for tiles that only render ~100-130px. */
export function thumbnailUrl(image: SanityImageSource): string {
  return urlFor(image)
    .width(400)
    .height(400)
    .fit("crop")
    .auto("format")
    .quality(75)
    .url();
}

/** Build a responsive srcSet for retina thumbnails. Reuses `thumbnailUrl()` for
 *  the 1x candidate so admin and gallery responses stay in sync with one
 *  source of truth for thumbnail generation. */
export function thumbnailSrcSet(image: SanityImageSource): string {
  const thumb2x = urlFor(image)
    .width(800)
    .height(800)
    .fit("crop")
    .auto("format")
    .quality(70)
    .url();
  return `${thumbnailUrl(image)} 400w, ${thumb2x} 800w`;
}
