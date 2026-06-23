import type { Photo } from "./photo.js";
import type { Selection } from "./selection.js";

export interface Album {
  id: string;
  slug: string;
  clientName: string;
  pin: string;
  maxSelections: number;
  isLocked: boolean;
  createdAt: Date;
  photos: Photo[];
}

export interface AlbumSummary {
  id: string;
  slug: string;
  clientName: string;
  pin: string;
  maxSelections: number;
  isLocked: boolean;
  createdAt: Date;
  photoCount: number;
}

export interface AlbumWithSelections {
  id: string;
  slug: string;
  clientName: string;
  pin: string;
  maxSelections: number;
  isLocked: boolean;
  createdAt: Date;
  photos: Photo[];
  selections: Selection[];
}
