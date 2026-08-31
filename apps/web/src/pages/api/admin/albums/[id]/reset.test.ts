import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const sanityFetchMock = vi.fn();
const mutateMock = vi.fn();
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
// Mirrors the real formats in lib/cache.ts's CACHE_KEYS — asserting against
// these lets the invalidation test below actually catch a regression there,
// instead of only checking wiring against made-up strings.
vi.mock("../../../../../lib/cache", () => ({
  invalidateCache: (...args: unknown[]) => invalidateCacheMock(...args),
  CACHE_KEYS: {
    albumsList: () => "cache:admin:albums:list",
    albumSelections: (albumId: string) => `cache:admin:selections:${albumId}`,
    galleryDraft: (albumId: string) => `draft:gallery:${albumId}`,
    albumBySlug: (slug: string) => `cache:gallery:album:${slug}`,
  },
}));
vi.mock("../../../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));
vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: (...args: unknown[]) => sanityFetchMock(...args) },
  sanityWriteClient: {
    mutate: (...args: unknown[]) => mutateMock(...args),
  },
}));

import { POST } from "./reset";

function call(id = "album-1") {
  return POST({
    params: { id },
    cookies: { get: () => undefined },
  } as never);
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue({ adminId: "admin-1" });
  sanityFetchMock.mockReset();
  mutateMock.mockReset().mockResolvedValue({});
  publishAdminEventMock.mockReset().mockResolvedValue(undefined);
  publishAlbumEventMock.mockReset().mockResolvedValue(undefined);
  invalidateCacheMock.mockReset().mockResolvedValue(undefined);
  captureErrorMock.mockReset();
});

describe("POST /api/admin/albums/[id]/reset", () => {
  it("401s when there is no admin session", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("404s when the album doesn't exist", async () => {
    sanityFetchMock.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("409s instead of reopening an already-delivered album", async () => {
    sanityFetchMock.mockResolvedValue({ status: "delivered", slug: { current: "doe-wedding" } });
    const res = await call();
    expect(res.status).toBe(409);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("deletes selections and submissions, then reopens the gallery", async () => {
    sanityFetchMock.mockResolvedValue({ status: "submitted", slug: { current: "doe-wedding" } });
    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: "album-1" });

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const mutations = mutateMock.mock.calls[0][0];
    expect(mutations).toEqual([
      { delete: { query: expect.stringContaining("selection"), params: { albumId: "album-1" } } },
      { delete: { query: expect.stringContaining("submission"), params: { albumId: "album-1" } } },
      { patch: { id: "album-1", set: expect.objectContaining({ status: "active" }) } },
    ]);

    // Reset publishes its own event distinct from a plain unlock, so the
    // gallery can tell the two apart (revise-in-place vs. start-from-empty).
    expect(publishAdminEventMock).toHaveBeenCalledWith("album:reset", { albumId: "album-1" });
    expect(publishAlbumEventMock).toHaveBeenCalledWith("album-1", "album:reset");
  });

  it("invalidates the selections and draft caches (unlike a plain unlock)", async () => {
    sanityFetchMock.mockResolvedValue({ status: "submitted", slug: { current: "doe-wedding" } });
    await call();

    expect(invalidateCacheMock).toHaveBeenCalledWith(expect.arrayContaining([
      "cache:admin:albums:list",
      "cache:admin:selections:album-1",
      "draft:gallery:album-1",
      "cache:gallery:album:doe-wedding",
    ]));
  });

  it("500s and reports to error tracking when the mutation fails", async () => {
    sanityFetchMock.mockResolvedValue({ status: "submitted", slug: { current: "doe-wedding" } });
    mutateMock.mockRejectedValue(new Error("sanity down"));

    const res = await call();

    expect(res.status).toBe(500);
    expect(captureErrorMock).toHaveBeenCalled();
  });
});
