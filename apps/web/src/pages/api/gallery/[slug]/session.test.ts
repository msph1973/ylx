import { describe, it, expect, vi, beforeEach } from "vitest";

const getCachedMock = vi.fn();
const hasValidPinSessionMock = vi.fn();
const hasActiveSessionMock = vi.fn();
const isRateLimitedMock = vi.fn();
const sanityFetchMock = vi.fn();

vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: (...args: unknown[]) => sanityFetchMock(...args) },
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
  hasValidPinSession: (...args: unknown[]) => hasValidPinSessionMock(...args),
  hasActiveSession: (...args: unknown[]) => hasActiveSessionMock(...args),
}));
vi.mock("../../../../lib/ratelimit", () => ({
  isRateLimited: (...args: unknown[]) => isRateLimitedMock(...args),
  RATE_LIMIT_RETRY_AFTER: "900",
}));

import { GET } from "./session";

// albumBySlugQuery no longer projects `pin` (fix: PINs must never be cached
// in Upstash) — the PIN now only ever comes back via the separate,
// always-fresh albumPinBySlugQuery lookup (PIN_RECORD below).
const ALBUM = {
  _id: "album-1",
  title: "Doe Wedding",
  clientName: "Jane",
  eventDate: "2026-08-01",
  status: "active",
  maxSelections: 40,
  lastUnlockedAt: "2026-07-28T00:00:00.000Z",
  photos: [{ _id: "p1", filename: "DSC_1.ARW", image: { _type: "image", asset: { _ref: "ref" } }, lqip: "lqip" }],
};

const PIN_RECORD = { _id: "album-1", pin: "1234" };

function call(slug?: string) {
  return GET({
    params: { slug },
    cookies: { get: () => undefined },
  } as never);
}

beforeEach(() => {
  getCachedMock.mockReset();
  hasValidPinSessionMock.mockReset();
  hasActiveSessionMock.mockReset().mockReturnValue(true);
  isRateLimitedMock.mockReset().mockResolvedValue(false);
  // Simulates the fresh (uncached) albumPinBySlugQuery lookup.
  sanityFetchMock.mockReset().mockResolvedValue(PIN_RECORD);
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

  it("401s when the cookie has no valid PIN session for the album", async () => {
    getCachedMock.mockResolvedValue(ALBUM);
    hasValidPinSessionMock.mockReturnValue(false);
    const res = await call("doe-wedding");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "No active gallery session" });
  });

  it("401s when the album's PIN has changed since the session was granted", async () => {
    getCachedMock.mockResolvedValue(ALBUM);
    // The PIN lookup is a separate, always-fresh fetch — simulate it
    // returning a since-rotated PIN that the stored session hash no longer
    // matches, so a stale session cannot resume.
    sanityFetchMock.mockResolvedValue({ _id: "album-1", pin: "9999" });
    hasValidPinSessionMock.mockReturnValue(false);
    const res = await call("doe-wedding");
    expect(res.status).toBe(401);
    expect(hasValidPinSessionMock).toHaveBeenCalledWith(expect.anything(), "album-1", "9999");
  });

  it("401s when the fresh PIN lookup finds no album (e.g. deleted between reads)", async () => {
    getCachedMock.mockResolvedValue(ALBUM);
    sanityFetchMock.mockResolvedValue(null);
    const res = await call("doe-wedding");
    expect(res.status).toBe(401);
    expect(hasValidPinSessionMock).not.toHaveBeenCalled();
  });

  it("returns the verify-shaped album payload when the cookie has a valid PIN session", async () => {
    getCachedMock.mockResolvedValue(ALBUM);
    hasValidPinSessionMock.mockReturnValue(true);
    const res = await call("doe-wedding");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(hasValidPinSessionMock).toHaveBeenCalledWith(expect.anything(), "album-1", "1234");
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
