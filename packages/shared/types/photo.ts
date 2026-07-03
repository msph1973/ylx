export interface Photo {
  id: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
  /** Sanity-generated low-quality image placeholder (base64 data URI) for blur-up loading. */
  lqip?: string | null;
  // Optional metadata — not returned by the gallery verify API, present only
  // when a caller hydrates a photo from a richer source.
  blurhash?: string;
  width?: number;
  height?: number;
  albumId?: string;
}
