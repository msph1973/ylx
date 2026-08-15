import { describe, it, expect } from 'vitest';
import type { Photo } from '@ylx/shared';
import { dedupeFilenames, buildDownloadManifest } from './galleryDownload';

function makePhoto(id: string, filename: string): Photo {
  return {
    id,
    filename,
    url: `https://img.test/${id}-full`,
    thumbnailUrl: `https://img.test/${id}-thumb`,
  };
}

describe('dedupeFilenames', () => {
  it('leaves unique filenames untouched', () => {
    expect(dedupeFilenames(['a.jpg', 'b.jpg', 'c.png'])).toEqual(['a.jpg', 'b.jpg', 'c.png']);
  });

  it('appends a numeric suffix before the extension for repeats', () => {
    expect(dedupeFilenames(['IMG_001.jpg', 'IMG_002.jpg', 'IMG_001.jpg']))
      .toEqual(['IMG_001.jpg', 'IMG_002.jpg', 'IMG_001-2.jpg']);
  });

  it('keeps incrementing the suffix for 3+ repeats of the same name', () => {
    expect(dedupeFilenames(['a.jpg', 'a.jpg', 'a.jpg']))
      .toEqual(['a.jpg', 'a-2.jpg', 'a-3.jpg']);
  });

  it('handles filenames with no extension', () => {
    expect(dedupeFilenames(['photo', 'photo'])).toEqual(['photo', 'photo-2']);
  });

  it('handles a leading-dot filename (no real extension) without producing an empty base name', () => {
    expect(dedupeFilenames(['.hidden', '.hidden'])).toEqual(['.hidden', '.hidden-2']);
  });
});

describe('buildDownloadManifest', () => {
  it('assigns each photo to its folder with its (possibly deduped) filename', () => {
    const cetak = [makePhoto('final-1', 'edit_1.jpg'), makePhoto('final-2', 'edit_2.jpg')];
    const original = [makePhoto('proof-1', 'proof.jpg')];

    const manifest = buildDownloadManifest([
      { folder: 'Cetak', photos: cetak },
      { folder: 'Semua Foto', photos: original },
    ]);

    expect(manifest).toEqual([
      { photo: cetak[0], folder: 'Cetak', filename: 'edit_1.jpg' },
      { photo: cetak[1], folder: 'Cetak', filename: 'edit_2.jpg' },
      { photo: original[0], folder: 'Semua Foto', filename: 'proof.jpg' },
    ]);
  });

  it('dedupes filenames independently per folder, not across folders', () => {
    const cetak = [makePhoto('final-1', 'IMG_001.jpg')];
    const original = [makePhoto('proof-1', 'IMG_001.jpg')];

    const manifest = buildDownloadManifest([
      { folder: 'Cetak', photos: cetak },
      { folder: 'Semua Foto', photos: original },
    ]);

    // Same base filename in two different folders must NOT be treated as a
    // collision — each folder is a separate namespace inside the zip.
    expect(manifest.find((e) => e.folder === 'Cetak')?.filename).toBe('IMG_001.jpg');
    expect(manifest.find((e) => e.folder === 'Semua Foto')?.filename).toBe('IMG_001.jpg');
  });

  it('dedupes repeated filenames WITHIN the same folder', () => {
    const cetak = [makePhoto('final-1', 'IMG_001.jpg'), makePhoto('final-2', 'IMG_001.jpg')];

    const manifest = buildDownloadManifest([{ folder: 'Cetak', photos: cetak }]);

    expect(manifest.map((e) => e.filename)).toEqual(['IMG_001.jpg', 'IMG_001-2.jpg']);
  });

  it('returns an empty manifest for empty folders', () => {
    expect(buildDownloadManifest([{ folder: 'Cetak', photos: [] }])).toEqual([]);
  });

  it('skips folders entirely when the folders array itself is empty', () => {
    expect(buildDownloadManifest([])).toEqual([]);
  });
});
