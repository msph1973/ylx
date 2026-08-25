import { describe, it, expect, vi } from "vitest";

vi.mock("@ylx/sanity/client", () => ({
  urlFor: () => ({
    width: () => ({ auto: () => ({ quality: () => ({ url: () => "https://img.test/derivative" }) }) }),
    url: () => "https://img.test/original",
  }),
}));
vi.mock("@ylx/sanity/lib/thumbnails", () => ({
  thumbnailUrl: () => "https://img.test/thumb",
  thumbnailSrcSet: () => "https://img.test/thumb 1x",
}));

import { buildGalleryAlbumResponse, type SanityAlbumRaw } from "./galleryAlbumResponse";

const BASE_ALBUM: SanityAlbumRaw = {
  _id: "album-1",
  title: "Doe Wedding",
  clientName: "Jane",
  eventDate: "2026-08-01",
  status: "active",
  maxSelections: 40,
  storageType: "sanity",
  photos: [{ _id: "p1", filename: "DSC_1.ARW", image: { _type: "image", asset: { _ref: "ref" } } }],
};

const DRIVE_FILE_ID = "1vnhc5aZtcqCKn4nKgKs5ph9c8x-AdxGE";

function driveAlbum(overrides: Partial<SanityAlbumRaw> = {}): SanityAlbumRaw {
  return {
    ...BASE_ALBUM,
    storageType: "drive",
    photos: [{ _id: "p1", filename: "HFI_1323.JPG", image: undefined as never, driveFileId: DRIVE_FILE_ID }],
    ...overrides,
  };
}

describe("buildGalleryAlbumResponse", () => {
  it("never includes downloadUrl for a non-delivered album, even if showOriginalAfterDelivery is true", () => {
    const { album } = buildGalleryAlbumResponse({ ...BASE_ALBUM, status: "active", showOriginalAfterDelivery: true });
    expect(album.photos[0]).not.toHaveProperty("downloadUrl");
  });

  it("does not include downloadUrl for a delivered album when showOriginalAfterDelivery is false", () => {
    const { album } = buildGalleryAlbumResponse({ ...BASE_ALBUM, status: "delivered", showOriginalAfterDelivery: false });
    expect(album.photos[0]).not.toHaveProperty("downloadUrl");
  });

  it("does not include downloadUrl for a delivered album when showOriginalAfterDelivery is missing (defaults false)", () => {
    const { album } = buildGalleryAlbumResponse({ ...BASE_ALBUM, status: "delivered" });
    expect(album.photos[0]).not.toHaveProperty("downloadUrl");
  });

  it("includes the full-original downloadUrl only when delivered AND showOriginalAfterDelivery is true", () => {
    const { album } = buildGalleryAlbumResponse({ ...BASE_ALBUM, status: "delivered", showOriginalAfterDelivery: true });
    expect(album.photos[0].downloadUrl).toBe("https://img.test/original");
    // The on-screen derivative is unaffected by this gating.
    expect(album.photos[0].url).toBe("https://img.test/derivative");
  });
});

describe("buildGalleryAlbumResponse — Google Drive albums", () => {
  it("builds Drive thumbnail/view/download URLs from driveFileId", () => {
    const { album } = buildGalleryAlbumResponse(driveAlbum());
    const photo = album.photos[0];
    expect(photo.thumbnailUrl).toBe(`https://drive.google.com/thumbnail?id=${DRIVE_FILE_ID}&sz=w400`);
    expect(photo.url).toBe(`https://drive.google.com/thumbnail?id=${DRIVE_FILE_ID}&sz=w1600`);
    expect(photo.downloadUrl).toBe(`https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}`);
    expect(album.photos[0].thumbnailSrcSet).toBeUndefined();
  });

  it("always exposes the Drive download link regardless of delivery gating", () => {
    // The underlying folder is shared anyone-with-link by necessity (that's
    // what makes thumbnails render at all), so gating the payload adds no
    // protection — unlike Sanity assets which are private-dataset backed.
    const { album } = buildGalleryAlbumResponse(driveAlbum({ status: "active" }));
    expect(album.photos[0].downloadUrl).toContain("uc?export=download");
  });

  it("emits lqip:null and surfaces the drive storageType", () => {
    const { album } = buildGalleryAlbumResponse(driveAlbum());
    expect(album.storageType).toBe("drive");
    expect(album.photos[0].lqip).toBeNull();
  });

  it("appends resourceKey to every Drive URL when the file carries one", () => {
    const album = driveAlbum();
    album.photos[0].driveResourceKey = "rk_secret";
    const { album: built } = buildGalleryAlbumResponse(album);
    const photo = built.photos[0];
    expect(photo.thumbnailUrl).toContain("&resourcekey=rk_secret");
    expect(photo.url).toContain("&resourcekey=rk_secret");
    expect(photo.downloadUrl).toContain("&resourcekey=rk_secret");
  });

  it("treats a missing storageType as the legacy sanity path", () => {
    const album = { ...BASE_ALBUM } as SanityAlbumRaw;
    delete (album as unknown as Record<string, unknown>).storageType;
    const { album: built } = buildGalleryAlbumResponse(album);
    expect(built.storageType).toBe("sanity");
    expect(built.photos[0].url).toBe("https://img.test/derivative");
  });
});
