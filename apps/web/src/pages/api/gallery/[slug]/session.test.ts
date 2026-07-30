import { describe, it, expect, vi, beforeEach } from "vitest";

const getCachedMock = vi.fn();
const hasAlbumAccessMock = vi.fn();
const hasActiveSessionMock = vi.fn();
const isRateLimitedMock = vi.fn();

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
vi.mock("../../../../lib/ratelimit", () => ({
  isRateLimited: (...args: unknown[]) => isRateLimitedMock(...args),
  RATE_LIMIT_RETRY_AFTER: "900",
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
  lastUnlockedAt: "2026-07-28T00:00:00.000Z",
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
  isRateLimitedMock.mockReset().mockResolvedValue(false);
});

describe("GET /api/gallery/[slug]/session", () => {
  it("400s without a slug", async () => {
    const res = await call(undefined);
    expect(res.status).toBe(400);
  });

  it("401s for an unknown slug (same response as no access — no slug probing)", async () => {
    getCachedMock.mockResolvedValue(null);
    const res = await call("ghost");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "No active gallery session" });
  });

  it("401s without touching Sanity when no signed gallery cookie exists", async () => {
    hasActiveSessionMock.mockReturnValue(false);
    const res = await call("doe-wedding");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "No active gallery session" });
    expect(getCachedMock).not.toHaveBeenCalled();
  });

  it("500s with a generic payload when the album lookup throws", async () => {
    getCachedMock.mockRejectedValue(new Error("sanity down"));
    const res = await call("doe-wedding");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
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
      lastUnlockedAt: "2026-07-28T00:00:00.000Z",
    });
    expect(body.album.pin).toBeUndefined();
    expect(body.album.photos[0]).toMatchObject({ id: "p1", filename: "DSC_1.ARW" });
  });
});
