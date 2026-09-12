import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const sanityFetchMock = vi.fn();
const getCachedMock = vi.fn();

vi.mock("../../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));
vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: (...args: unknown[]) => sanityFetchMock(...args) },
}));
vi.mock("../../../../lib/cache", () => ({
  // Passthrough: run the fetcher so tests observe returned selections.
  getCached: (...args: unknown[]) => getCachedMock(...args),
  CACHE_KEYS: {
    albumSelections: (albumId: string) => `cache:admin:selections:${albumId}`,
  },
}));

import { GET } from "./selections";

const VENDOR = { id: "admin.v1", role: "vendor", ownerId: "admin.v1" };
const SUPER = { id: "admin.super", role: "superadmin", ownerId: "admin.super" };

const ownAlbum = { _id: "album-a", status: "active", owner: { _id: "admin.v1" } };
const foreignAlbum = { _id: "album-b", status: "active", owner: { _id: "admin.v2" } };
const legacyAlbum = { _id: "album-old", status: "active" };

function get(slug: string) {
  return GET({ params: { slug }, cookies: {} } as never);
}

beforeEach(() => {
  requireAdminMock.mockReset();
  sanityFetchMock.mockReset();
  getCachedMock.mockReset().mockImplementation((_k: unknown, _a: unknown, _b: unknown, fn: unknown) =>
    (fn as () => unknown)()
  );
});

describe("GET /api/gallery/[slug]/selections tenant scope", () => {
  it("returns selections for the vendor's own album", async () => {
    requireAdminMock.mockResolvedValue(VENDOR);
    sanityFetchMock.mockResolvedValueOnce(ownAlbum).mockResolvedValueOnce([{ _id: "sel-1" }]);
    const res = await get("slug-a");
    expect(res.status).toBe(200);
  });

  it("returns 404 for a rival vendor's album", async () => {
    requireAdminMock.mockResolvedValue(VENDOR);
    sanityFetchMock.mockResolvedValueOnce(foreignAlbum);
    const res = await get("slug-b");
    expect(res.status).toBe(404);
    expect(getCachedMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an ownerless legacy album", async () => {
    requireAdminMock.mockResolvedValue(VENDOR);
    sanityFetchMock.mockResolvedValueOnce(legacyAlbum);
    const res = await get("slug-old");
    expect(res.status).toBe(404);
  });

  it("returns selections for superadmin on any album", async () => {
    requireAdminMock.mockResolvedValue(SUPER);
    sanityFetchMock.mockResolvedValueOnce(foreignAlbum).mockResolvedValueOnce([]);
    const res = await get("slug-b");
    expect(res.status).toBe(200);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await get("slug-a");
    expect(res.status).toBe(401);
    expect(sanityFetchMock).not.toHaveBeenCalled();
  });
});
