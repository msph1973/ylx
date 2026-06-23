export interface Album {
  id: string;
  slug: string;
  clientName: string;
  pin: string;
  maxSelections: number;
  isLocked: boolean;
  createdAt: Date;
}

export interface Photo {
  id: string;
  albumId: string;
  filename: string;
  originalFilename: string;
  url: string;
  width: number;
  height: number;
  order: number;
}

export interface Selection {
  id: string;
  photoId: string;
  albumId: string;
  selectedAt: Date;
}

export interface SubmissionLock {
  id: string;
  albumId: string;
  lockedAt: Date;
  selectedPhotoIds: string[];
}
