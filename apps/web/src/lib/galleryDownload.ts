import type { Photo } from '@ylx/shared';

export interface DownloadFolder {
  folder: string;
  photos: Photo[];
}

export interface DownloadManifestEntry {
  photo: Photo;
  folder: string;
  filename: string;
}

// Appends a numeric suffix (`name-2.ext`, `name-3.ext`, ...) to any filename
// that repeats within the SAME list, so a later `jszip.file(path, blob)` call
// never silently overwrites an earlier entry at the same zip path (e.g. two
// final photos both named `IMG_001.jpg`).
export function dedupeFilenames(filenames: string[]): string[] {
  const seenCounts = new Map<string, number>();
  return filenames.map((name) => {
    const count = (seenCounts.get(name) ?? 0) + 1;
    seenCounts.set(name, count);
    if (count === 1) return name;
    const dotIndex = name.lastIndexOf('.');
    return dotIndex > 0
      ? `${name.slice(0, dotIndex)}-${count}${name.slice(dotIndex)}`
      : `${name}-${count}`;
  });
}

// Builds the folder + de-duplicated filename plan for a multi-folder ZIP
// (e.g. "Cetak/" + "Semua Foto/"). Deduping is scoped per folder — jszip
// paths are already folder-qualified, so a name only needs to be unique
// within its own folder, not across the whole zip.
export function buildDownloadManifest(folders: DownloadFolder[]): DownloadManifestEntry[] {
  const entries: DownloadManifestEntry[] = [];
  for (const { folder, photos } of folders) {
    const filenames = dedupeFilenames(photos.map((photo) => photo.filename));
    photos.forEach((photo, index) => {
      entries.push({ photo, folder, filename: filenames[index] });
    });
  }
  return entries;
}
