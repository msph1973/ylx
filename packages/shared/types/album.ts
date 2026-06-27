import type { Photo } from "./photo.js";
import type { Selection } from "./selection.js";

export interface Album {
  id: string;
  title: string;
  slug?: string;
  clientName: string;
  pin?: string;
  maxSelections: number;
  isLocked: boolean;
  status: string;
  eventDate?: string;
  createdAt?: Date;
  photos: Photo[];
}

export interface AlbumSummary {
  id: string;
  title: string;
  slug?: string;
  clientName: string;
  pin?: string;
  maxSelections: number;
  isLocked: boolean;
  status: string;
  eventDate?: string;
  createdAt?: Date;
  photoCount: number;
}

export interface AlbumWithSelections {
  id: string;
  title: string;
  slug?: string;
  clientName: string;
  pin?: string;
  maxSelections: number;
  isLocked: boolean;
  status: string;
  eventDate?: string;
  createdAt?: Date;
  photos: Photo[];
  selections: Selection[];
}
