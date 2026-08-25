import { describe, it, expect, vi } from "vitest";

vi.mock("@ylx/sanity/client", () => ({
  urlFor: () => ({
    url: () => "https://img.test/final-original",
  }),
}));
vi.mock("@ylx/sanity/lib/thumbnails", () => ({
  thumbnailUrl: () => "https://img.test/final-thumb",
  thumbnailSrcSet: () => "https://img.test/final-thumb 1x",
}));

import {
  buildGalleryFinalPhotosResponse,
  type SanityFinalPhotoRaw,
} from "./galleryFinalPhotosResponse";

const SANITY_PHOTO: SanityFinalPhotoRaw = {
  _id: "p1",
  filename: "final_1.jpg",
  image: { _type: "image", asset: { _ref: "ref" } },
};

const DRIVE_FILE_ID = "1vnhc5aZtcqCKn4nKgKs5ph9c8x-AdxGE";

function drivePhoto(overrides: Partial<SanityFinalPhotoRaw> = {}): SanityFinalPhotoRaw {
  return {
    _id: "p2",
    filename: "final_2.jpg",
    image: undefined as never,
    driveFileId: DRIVE_FILE_ID,
    ...overrides,
  };
}

describe("buildGalleryFinalPhotosResponse", () => {
  it("keeps the sanity pipeline URLs for image-backed photos", () => {
    const { finalPhotos } = buildGalleryFinalPhotosResponse([SANITY_PHOTO]);
    expect(finalPhotos[0].thumbnailUrl).toBe("https://img.test/final-thumb");
    expect(finalPhotos[0].url).toBe("https://img.test/final-original");
  });

  it("derives Drive URLs from driveFileId for Drive-sourced finals", () => {
    // Defensive: deliver/upload flows are disabled for drive albums today, but
    // nothing at the data layer prevents a driveFileId photo from ending up
    // in finalPhotos (Studio edit, future flow) — render URLs must not break.
    const { finalPhotos } = buildGalleryFinalPhotosResponse([drivePhoto()]);
    expect(finalPhotos[0].thumbnailUrl).toBe(`https://drive.google.com/thumbnail?id=${DRIVE_FILE_ID}&sz=w400`);
    expect(finalPhotos[0].url).toBe(`https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}`);
  });

  it("appends resourceKey to Drive URLs when present", () => {
    const { finalPhotos } = buildGalleryFinalPhotosResponse([
      drivePhoto({ driveResourceKey: "rk_final" }),
    ]);
    expect(finalPhotos[0].url).toContain("&resourcekey=rk_final");
  });
});
