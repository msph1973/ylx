import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { urlFor } from "../client";

export function getThumbnailUrl(source: SanityImageSource): string {
  return urlFor(source).width(400).height(300).crop("center").url();
}

export function getFullSizeUrl(source: SanityImageSource): string {
  return urlFor(source).url();
}

export function getBlurHashUrl(source: SanityImageSource): string {
  return urlFor(source).width(20).quality(20).blur(25).url();
}
