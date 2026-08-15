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
//
// A counter keyed only by the ORIGINAL name isn't enough: a candidate suffix
// can itself collide with another file's original name. E.g. `["a.jpg",
// "a-2.jpg", "a.jpg"]` — the second "a.jpg" would naively become "a-2.jpg"
// (count 2), which is already taken by the second entry, silently dropping
// one file from the zip. Instead, track every name actually assigned so far
// and keep incrementing the counter until the candidate is free.
export function dedupeFilenames(filenames: string[]): string[] {
  const counts = new Map<string, number>();
  const used = new Set<string>();
  return filenames.map((name) => {
    const dotIndex = name.lastIndexOf('.');
    const buildCandidate = (count: number) =>
      count === 1
        ? name
        : dotIndex > 0
          ? `${name.slice(0, dotIndex)}-${count}${name.slice(dotIndex)}`
          : `${name}-${count}`;

    let count = counts.get(name) ?? 0;
    let candidate: string;
    do {
      count += 1;
      candidate = buildCandidate(count);
    } while (used.has(candidate));

    counts.set(name, count);
    used.add(candidate);
    return candidate;
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
