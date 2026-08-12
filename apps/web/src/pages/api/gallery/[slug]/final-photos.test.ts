import { describe, it, expect, vi, beforeEach } from "vitest";

const sanityFetchMock = vi.fn();
const hasActiveSessionMock = vi.fn();
const hasValidPinSessionMock = vi.fn();
const isRateLimitedMock = vi.fn();

vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: (...args: unknown[]) => sanityFetchMock(...args) },
  urlFor: () => ({ url: () => "https://img.test/full" }),
}));
vi.mock("@ylx/sanity/lib/thumbnails", () => ({
  thumbnailUrl: () => "https://img.test/thumb",
  thumbnailSrcSet: () => "https://img.test/thumb 1x",
}));
vi.mock("@ylx/sanity/lib/queries", () => ({
  albumFinalPhotosQuery: "albumFinalPhotosQuery",
  albumPinBySlugQuery: "albumPinBySlugQuery",
}));
vi.mock("../../../../lib/gallerySession", () => ({
  hasActiveSession: (...args: unknown[]) => hasActiveSessionMock(...args),
  hasValidPinSession: (...args: unknown[]) => hasValidPinSessionMock(...args),
}));
vi.mock("../../../../lib/ratelimit", () => ({
  isRateLimited: (...args: unknown[]) => isRateLimitedMock(...args),
  RATE_LIMIT_RETRY_AFTER: "900",
}));

import { GET } from "./final-photos";

const ALBUM = {
  _id: "album-1",
  title: "Doe Wedding",
  status: "delivered",
  finalPhotos: [
    { _id: "fp1", filename: "edit_1.jpg", image: { _type: "image", asset: { _ref: "ref" } }, lqip: "lqip" },
  ],
};

const PIN_RECORD = { pin: "1234" };

function call(slug?: string) {
  return GET({
    params: { slug },
    cookies: { get: () => undefined },
    clientAddress: "1.2.3.4",
  } as never);
}

beforeEach(() => {
  sanityFetchMock.mockReset();
  hasActiveSessionMock.mockReset().mockReturnValue(true);
  hasValidPinSessionMock.mockReset().mockReturnValue(true);
  isRateLimitedMock.mockReset().mockResolvedValue(false);
  sanityFetchMock.mockResolvedValue(ALBUM);
});

describe("GET /api/gallery/[slug]/final-photos", () => {
  it("400s without a slug", async () => {
    const res = await call(undefined);
    expect(res.status).toBe(400);
  });

  it("401s without touching Sanity when no signed gallery cookie exists", async () => {
    hasActiveSessionMock.mockReturnValue(false);
    const res = await call("doe-wedding");
    expect(res.status).toBe(401);
    expect(sanityFetchMock).not.toHaveBeenCalled();
  });

  // Rate limiting (bot review item #16): per-IP limit is checked before the
  // Sanity reads, mirroring session.ts/verify.ts.
  it("429s once the per-IP rate limit is exceeded, before any Sanity fetch", async () => {
    isRateLimitedMock.mockResolvedValue(true);
    const res = await call("doe-wedding");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
    expect(sanityFetchMock).not.toHaveBeenCalled();
  });

  it("401s when the PIN session isn't valid for this album", async () => {
    sanityFetchMock.mockResolvedValueOnce(ALBUM).mockResolvedValueOnce(PIN_RECORD);
    hasValidPinSessionMock.mockReturnValue(false);
    const res = await call("doe-wedding");
    expect(res.status).toBe(401);
  });

  it("returns the delivered final photos when the session is valid", async () => {
    sanityFetchMock.mockResolvedValueOnce(ALBUM).mockResolvedValueOnce(PIN_RECORD);
    const res = await call("doe-wedding");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.finalPhotos).toHaveLength(1);
    expect(body.finalPhotos[0]).toMatchObject({ id: "fp1", filename: "edit_1.jpg" });
    expect(isRateLimitedMock).toHaveBeenCalledWith("final-photos:1.2.3.4", 30);
  });
});
