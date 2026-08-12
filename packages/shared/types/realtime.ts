export type RealtimeEventType =
  | "photo:uploaded"
  | "selection:changed"
  | "submission:received"
  | "album:unlocked"
  | "album:delivered"
  | "selection:replied"
  | "draft:progress"
  | "finalPhoto:uploaded"
  | "finalPhoto:deleted";

export interface RealtimeEvent<T = unknown> {
  type: RealtimeEventType;
  albumId: string;
  data: T;
  timestamp: number;
}

export interface PhotoUploadedData {
  photoId: string;
  filename: string;
}

export interface SelectionChangedData {
  userId: string;
  photoId: string;
  selected: boolean;
}

export interface SubmissionReceivedData {
  userId: string;
  photoCount: number;
}

export interface AlbumUnlockedData {
  lockedBy?: string;
}

export interface AlbumDeliveredData {
  albumId: string;
}

export interface FinalPhotoUploadedData {
  photoId: string;
  filename: string;
  albumId?: string;
}

export interface FinalPhotoDeletedData {
  photoId: string;
  albumId?: string;
}

export interface SelectionRepliedData {
  selectionId: string;
  albumId: string;
}

export interface DraftProgressData {
  albumId: string;
  count: number;
}
