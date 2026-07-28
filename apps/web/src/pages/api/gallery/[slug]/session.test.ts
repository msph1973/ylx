import { describe, it, expect, vi, beforeEach } from "vitest";

const getCachedMock = vi.fn();
const hasAlbumAccessMock = vi.fn();
const hasActiveSessionMock = vi.fn(() => true);

vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: vi.fn() },
  urlFor: () => ({
    width: () => ({ auto: () => ({ quality: () => ({ url: () => "https://img.test/full" }) }) }),
  }),
}));
vi.mock("@ylx/sanity/lib/thumbnails", () => ({
  thumbnailUrl: () => "https://img.test/thumb",
  thumbnailSrcSet: () => "https://img.test/thumb 1x",
}));
vi.mock("../../../../lib/cache", () => ({
  getCached: (...args: unknown[]) => getCachedMock(...args),
  CACHE_KEYS: { albumBySlug: (slug: string) => `cache:gallery:album:${slug}` },
}));
vi.mock("../../../../lib/gallerySession", () => ({
  hasAlbumAccess: (...args: unknown[]) => hasAlbumAccessMock(...args),
  hasActiveSession: (...args: unknown[]) => hasActiveSessionMock(...args),
}));

import { GET } from "./session";

const ALBUM = {
  _id: "album-1",
  title: "Doe Wedding",
  clientName: "Jane",
  eventDate: "2026-08-01",
  status: "active",
  maxSelections: 40,
  pin: "1234",
  photos: [{ _id: "p1", filename: "DSC_1.ARW", image: { _type: "image", asset: { _ref: "ref" } }, lqip: "lqip" }],
};

function call(slug?: string) {
  return GET({
    params: { slug },
    cookies: { get: () => undefined },
  } as never);
}

beforeEach(() => {
  getCachedMock.mockReset();
  hasAlbumAccessMock.mockReset();
  hasActiveSessionMock.mockReset().mockReturnValue(true);
});

describe("GET /api/gallery/[slug]/session", () => {
  it("400s without a slug", async () => {
    const res = await call(undefined);
    expect(res.status).toBe(400);
  });

  it("401s before any fetch when the cookie has no signed entries at all", async () => {
    hasActiveSessionMock.mockReturnValue(false);
    const res = await call("any-slug");
    expect(res.status).toBe(401);
    expect(getCachedMock).not.toHaveBeenCalled();
  });

  it("401s for an unknown slug (same response as no access — no slug probing)", async () => {
    getCachedMock.mockResolvedValue(null);
    const res = await call("ghost");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "No active gallery session" });
  });

  it("401s when the cookie has no access to the album", async () => {
    getCachedMock.mockResolvedValue(ALBUM);
    hasAlbumAccessMock.mockReturnValue(false);
    const res = await call("doe-wedding");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "No active gallery session" });
  });

  it("returns the verify-shaped album payload when the cookie is valid", async () => {
    getCachedMock.mockResolvedValue(ALBUM);
    hasAlbumAccessMock.mockReturnValue(true);
    const res = await call("doe-wedding");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(hasAlbumAccessMock).toHaveBeenCalledWith(expect.anything(), "album-1");
    expect(body.album).toMatchObject({
      id: "album-1",
      status: "active",
      maxSelections: 40,
    });
    expect(body.album.pin).toBeUndefined();
    expect(body.album.photos[0]).toMatchObject({ id: "p1", filename: "DSC_1.ARW" });
  });
});
