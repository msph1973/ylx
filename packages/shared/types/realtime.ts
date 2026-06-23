export type RealtimeEventType =
  | "photo:uploaded"
  | "selection:changed"
  | "submission:received"
  | "album:unlocked";

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
  lockedBy: string;
}
