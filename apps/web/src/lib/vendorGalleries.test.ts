import { describe, it, expect, vi, beforeEach } from "vitest";

const sanityFetchMock = vi.fn();
const invalidateCacheMock = vi.fn();

vi.mock("@ylx/sanity/client", () => ({
  sanityWriteClient: {
    fetch: (...args: unknown[]) => sanityFetchMock(...args),
  },
}));
vi.mock("./cache", () => ({
  invalidateCache: (...args: unknown[]) => invalidateCacheMock(...args),
  CACHE_KEYS: {
    albumBySlug: (slug: string) => `cache:gallery:album:${slug}`,
  },
}));

import { invalidateVendorGalleries } from "./vendorGalleries";

beforeEach(() => {
  sanityFetchMock.mockReset();
  invalidateCacheMock.mockReset().mockResolvedValue(undefined);
});

describe("invalidateVendorGalleries", () => {
  it("busts slug and customSlug entries for the owner's albums", async () => {
    sanityFetchMock.mockResolvedValue([
      { slug: { current: "a" }, customSlug: "x" },
      { slug: { current: "b" } },
      {},
    ]);
    await invalidateVendorGalleries("admin.v1");
    expect(sanityFetchMock).toHaveBeenCalledWith(expect.stringContaining("owner._ref == $ownerId"), {
      ownerId: "admin.v1",
    });
    expect(invalidateCacheMock).toHaveBeenCalledWith([
      "cache:gallery:album:a",
      "cache:gallery:album:x",
      "cache:gallery:album:b",
    ]);
  });

  it("invalidates nothing when the vendor has no albums", async () => {
    sanityFetchMock.mockResolvedValue([]);
    await invalidateVendorGalleries("admin.v1");
    expect(invalidateCacheMock).toHaveBeenCalledWith([]);
  });
});
