import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const sanityFetchMock = vi.fn();
const patchMock = vi.fn();
const commitMock = vi.fn();
const publishAdminEventMock = vi.fn();
const publishAlbumEventMock = vi.fn();
const invalidateCacheMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock("../../../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));
vi.mock("../../../../../lib/ably", () => ({
  publishAdminEvent: (...args: unknown[]) => publishAdminEventMock(...args),
  publishAlbumEvent: (...args: unknown[]) => publishAlbumEventMock(...args),
}));
vi.mock("../../../../../lib/cache", () => ({
  invalidateCache: (...args: unknown[]) => invalidateCacheMock(...args),
  CACHE_KEYS: {
    albumsList: () => "cache:admin:albums:list",
    albumBySlug: (slug: string) => `cache:gallery:album:${slug}`,
  },
}));
vi.mock("../../../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));
vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: (...args: unknown[]) => sanityFetchMock(...args) },
  sanityWriteClient: {
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

import { POST } from "./deliver";

function call(id = "album-1") {
  return POST({
    params: { id },
    cookies: { get: () => undefined },
  } as never);
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue({ adminId: "admin-1" });
  sanityFetchMock.mockReset();
  commitMock.mockReset().mockResolvedValue({});
  patchMock.mockReset().mockReturnValue({ set: () => ({ commit: commitMock }) });
  publishAdminEventMock.mockReset().mockResolvedValue(undefined);
  publishAlbumEventMock.mockReset().mockResolvedValue(undefined);
  invalidateCacheMock.mockReset().mockResolvedValue(undefined);
  captureErrorMock.mockReset();
});

describe("POST /api/admin/albums/[id]/deliver", () => {
  it("401s when there is no admin session", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("404s when the album doesn't exist", async () => {
    sanityFetchMock.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
  });

  // Bot review item #6: the guard only accepts 'submitted'/'locked' (an
  // already-delivered album is rejected), so the error message must not
  // list 'delivered' as if it were an accepted status.
  it("400s with an accurate error message (not mentioning 'delivered') when the album status doesn't allow delivery", async () => {
    sanityFetchMock.mockResolvedValue({ _id: "album-1", status: "active", finalPhotos: [{ _ref: "p1" }] });
    const res = await call();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Album must be submitted or locked before delivery" });
    expect(commitMock).not.toHaveBeenCalled();
  });

  it("400s (with the same guard) when the album is already delivered", async () => {
    sanityFetchMock.mockResolvedValue({ _id: "album-1", status: "delivered", finalPhotos: [{ _ref: "p1" }] });
    const res = await call();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Album must be submitted or locked before delivery" });
  });

  it("400s when there are no final photos yet", async () => {
    sanityFetchMock.mockResolvedValue({ _id: "album-1", status: "locked", finalPhotos: [] });
    const res = await call();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "At least one final photo is required to deliver" });
  });

  it("delivers a locked album with final photos", async () => {
    sanityFetchMock.mockResolvedValue({
      _id: "album-1",
      status: "locked",
      finalPhotos: [{ _ref: "p1" }],
      slug: { current: "doe-wedding" },
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: "album-1" });
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(publishAdminEventMock).toHaveBeenCalledWith("album:delivered", { albumId: "album-1" });
    expect(publishAlbumEventMock).toHaveBeenCalledWith("album-1", "album:delivered");
    // Cache must be invalidated before the realtime publish, so a client that
    // refetches on receiving the event never races an already-stale cache.
    expect(invalidateCacheMock.mock.invocationCallOrder[0])
      .toBeLessThan(publishAlbumEventMock.mock.invocationCallOrder[0]);
  });
});
