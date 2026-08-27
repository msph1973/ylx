import type { Photo } from "./photo.js";
import type { StorageType } from "./storage.js";
import type { Selection } from "./selection.js";

export interface Album {
  id: string;
  title: string;
  slug?: string;
  customSlug?: string;
  shareCount?: number;
  lastAccessedAt?: string;
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
  customSlug?: string;
  shareCount?: number;
  lastAccessedAt?: string;
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
  customSlug?: string;
  clientName: string;
  pin?: string;
  maxSelections: number;
  isLocked: boolean;
  status: string;
  /** Where photo binaries live — 'drive' albums keep originals in Google
   *  Drive (photo docs reference driveFileId) and skip upload/delivery flows. */
  storageType?: StorageType;
  eventDate?: string;
  createdAt?: Date;
  photos: Photo[];
  selections: Selection[];
  shareCount?: number;
  lastAccessedAt?: string;
  /** Final delivery photos — present once the photographer uploads final edits. */
  finalPhotos?: Photo[];
}
