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
  photos: [{ _id: "p1", filename: "DSC_1.ARW", image: { _type: "image", asset: { _ref: "ref" } } }],
};

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
