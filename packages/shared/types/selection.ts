import type { Photo } from "./photo.js";

export interface Selection {
  id: string;
  albumId: string;
  photoId: string;
  photo: Photo;
  // The API always sends ISO strings over JSON; `Date` is still accepted so
  // callers that construct these objects directly (e.g. tests) can use either.
  selectedAt: Date | string;
  notes?: string;
  photographerReply?: string;
}

export interface Submission {
  id: string;
  albumId: string;
  selections: Selection[];
  submittedAt: string;
}
