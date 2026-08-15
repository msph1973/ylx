export interface Photo {
  id: string;
  filename: string;
  url: string;
  /** Full-original-resolution URL for downloads, when it differs from `url`
   *  (e.g. the proofing gallery's `url` is a resized/compressed on-screen
   *  derivative). Falls back to `url` when absent — final photos already
   *  use the full-resolution asset as their `url`, so they don't set this. */
  downloadUrl?: string;
  thumbnailUrl: string;
  /** Responsive `srcset` for the thumbnail (e.g. "url400 1x, url800 2x") so retina
   *  screens get a sharp thumbnail without every device downloading the 2x asset. */
  thumbnailSrcSet?: string | null;
  /** Sanity-generated low-quality image placeholder (base64 data URI) for blur-up loading. */
  lqip?: string | null;
  // Optional metadata — not returned by the gallery verify API, present only
  // when a caller hydrates a photo from a richer source.
  blurhash?: string;
  width?: number;
  height?: number;
  albumId?: string;
}
