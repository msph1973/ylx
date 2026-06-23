import type { Photo } from "./photo.js";

export interface Selection {
  id: string;
  albumId: string;
  photoId: string;
  photo: Photo;
  selectedAt: Date;
}

export interface Submission {
  id: string;
  albumId: string;
  selections: Selection[];
  submittedAt: Date;
}
