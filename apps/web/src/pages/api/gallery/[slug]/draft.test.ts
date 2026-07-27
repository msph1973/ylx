import { describe, it, expect, vi, beforeEach } from "vitest";

const getCachedMock = vi.fn();
const hasAlbumAccessMock = vi.fn();
const cacheSetRawMock = vi.fn();
const publishAdminEventMock = vi.fn();

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
  cacheSetRaw: (...args: unknown[]) => cacheSetRawMock(...args),
  CACHE_KEYS: {
    albumBySlug: (slug: string) => `cache:gallery:album:${slug}`,
    galleryDraft: (albumId: string) => `draft:gallery:${albumId}`,
  },
}));
vi.mock("../../../../lib/gallerySession", () => ({
  hasAlbumAccess: (...args: unknown[]) => hasAlbumAccessMock(...args),
}));
vi.mock("../../../../lib/ably", () => ({
  publishAdminEvent: (...args: unknown[]) => publishAdminEventMock(...args),
}));

import { PUT, POST } from "./draft";

const ALBUM = {
  _id: "album-1",
  title: "Doe Wedding",
  clientName: "Jane",
  eventDate: "2026-08-01",
  status: "active",
  maxSelections: 40,
  pin: "1234",
  photos: [],
};

function call(body: unknown, slug: string | undefined = "doe-wedding") {
  return PUT({
    params: { slug },
    cookies: { get: () => undefined },
    request: new Request("http://localhost/api/gallery/doe-wedding/draft", {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  } as never);
}

beforeEach(() => {
  getCachedMock.mockReset().mockResolvedValue(ALBUM);
  hasAlbumAccessMock.mockReset().mockReturnValue(true);
  cacheSetRawMock.mockReset().mockResolvedValue(undefined);
  publishAdminEventMock.mockReset().mockResolvedValue(undefined);
});

describe("PUT /api/gallery/[slug]/draft", () => {
  it("401s without album access (uniform with unknown slug)", async () => {
    hasAlbumAccessMock.mockReturnValue(false);
    const res = await call({ count: 3 });
    expect(res.status).toBe(401);

    getCachedMock.mockResolvedValue(null);
    hasAlbumAccessMock.mockReturnValue(true);
    const res2 = await call({ count: 3 });
    expect(res2.status).toBe(401);
    expect(await res.json()).toEqual(await res2.json());
    expect(cacheSetRawMock).not.toHaveBeenCalled();
  });

  it("409s when the album is not active", async () => {
    getCachedMock.mockResolvedValue({ ...ALBUM, status: "submitted" });
    const res = await call({ count: 3 });
    expect(res.status).toBe(409);
    expect(cacheSetRawMock).not.toHaveBeenCalled();
  });

  it.each([
    ["negative", -1],
    ["above maxSelections", 41],
    ["non-integer", 1.5],
    ["non-number", "3"],
  ])("400s for %s count", async (_label, count) => {
    const res = await call({ count });
    expect(res.status).toBe(400);
    expect(cacheSetRawMock).not.toHaveBeenCalled();
    expect(publishAdminEventMock).not.toHaveBeenCalled();
  });

  it("400s for malformed JSON", async () => {
    const res = await call("{nope");
    expect(res.status).toBe(400);
  });

  it("stores the progress with a 24h TTL and publishes draft:progress", async () => {
    const res = await call({ count: 7 });
    expect(res.status).toBe(200);
    expect(cacheSetRawMock).toHaveBeenCalledWith(
      "draft:gallery:album-1",
      expect.objectContaining({ count: 7 }),
      24 * 60 * 60
    );
    expect(publishAdminEventMock).toHaveBeenCalledWith("draft:progress", {
      albumId: "album-1",
      count: 7,
    });
  });

  it("exposes POST as an alias so navigator.sendBeacon (POST-only) works", () => {
    expect(POST).toBe(PUT);
  });
});
