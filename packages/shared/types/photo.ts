export interface Photo {
  id: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
  blurhash: string;
  width: number;
  height: number;
  albumId: string;
  /** Sanity-generated low-quality image placeholder (base64 data URI) for blur-up loading. */
  lqip?: string | null;
}
