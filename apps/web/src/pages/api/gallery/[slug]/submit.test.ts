import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mocks ---------------------------------------------------------------

const sanityFetchMock = vi.fn();
const transactionCommitMock = vi.fn().mockResolvedValue(undefined);
const transactionCreateMock = vi.fn().mockReturnThis();
const transactionPatchMock = vi.fn().mockReturnThis();
const transactionDeleteMock = vi.fn().mockReturnThis();

vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: (...args: unknown[]) => sanityFetchMock(...args) },
  sanityWriteClient: {
    transaction: () => ({
      create: (...args: unknown[]) => transactionCreateMock(...args),
      patch: (...args: unknown[]) => transactionPatchMock(...args),
      delete: (...args: unknown[]) => transactionDeleteMock(...args),
      commit: () => transactionCommitMock(),
    }),
  },
  urlFor: () => ({
    width: () => ({ auto: () => ({ quality: () => ({ url: () => "https://img.test/full" }) }) }),
  }),
}));
vi.mock("@ylx/sanity/lib/thumbnails", () => ({
  thumbnailUrl: () => "https://img.test/thumb",
  thumbnailSrcSet: () => "https://img.test/thumb 1x",
}));
vi.mock("../../../../lib/cache", () => ({
  invalidateCache: vi.fn().mockResolvedValue(undefined),
  CACHE_KEYS: {
    albumsList: () => "cache:albums",
    albumSelections: (id: string) => `cache:sel:${id}`,
    galleryDraft: (id: string) => `draft:${id}`,
    albumBySlug: (slug: string) => `cache:gallery:album:${slug}`,
  },
}));
vi.mock("../../../../lib/gallerySession", () => ({
  hasActiveSession: () => true,
  hasValidPinSession: () => true,
}));
vi.mock("../../../../lib/ably", () => ({
  publishAdminEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../../lib/errorTracking", () => ({
  captureError: vi.fn(),
}));

// Email lib mock — notifyAdminsOfSubmission is what submit.ts calls. Tests
// assert it's invoked on success and that a rejection doesn't leak.
const notifyAdminsMock = vi.fn();
vi.mock("../../../../lib/email", () => ({
  notifyAdminsOfSubmission: (...args: unknown[]) => notifyAdminsMock(...args),
}));

import { POST } from "./submit";

// --- fixtures ------------------------------------------------------------

const ALBUM = {
  _id: "album-1",
  title: "Doe Wedding",
  clientName: "Jane & John",
  eventDate: "2026-09-12",
  status: "active",
  maxSelections: 20,
  photos: [{ _id: "photo-1" }, { _id: "photo-2" }, { _id: "photo-3" }],
};
const PIN_RECORD = { pin: "4321" };

function call(selections: unknown[], slug = "doe-wedding") {
  return POST(
    {
      params: { slug },
      cookies: { get: () => undefined },
      request: new Request("http://ylx.test/api/gallery/doe-wedding/submit", {
        method: "POST",
        body: JSON.stringify({ selections }),
      }),
    } as never
  );
}

beforeEach(() => {
  sanityFetchMock.mockReset();
  transactionCommitMock.mockReset().mockResolvedValue(undefined);
  transactionCreateMock.mockReset().mockReturnThis();
  transactionPatchMock.mockReset().mockReturnThis();
  transactionDeleteMock.mockReset().mockReturnThis();
  notifyAdminsMock.mockReset().mockResolvedValue(1);

  // sanityFetchMock branches on the GROQ query string passed in args[0].
  // albumPinBySlugQuery is the only query that projects a `pin` field, so a
  // word-boundary match on "pin" disambiguates it from albumBySlugQuery
  // (which otherwise shares the same "slug.current == $slug ... customSlug"
  // filter). The existing-selections query is detected by `selection`.
  sanityFetchMock.mockImplementation((query: string) => {
    if (typeof query !== "string") return Promise.resolve(null);
    if (/\bpin\b/.test(query)) {
      return Promise.resolve(PIN_RECORD);
    }
    if (query.includes("customSlug")) {
      return Promise.resolve(ALBUM);
    }
    if (query.includes("selection")) {
      return Promise.resolve([]);
    }
    return Promise.resolve(null);
  });
});

// --- tests ---------------------------------------------------------------

describe("POST /api/gallery/[slug]/submit", () => {
  it("commits + notifies the admin by email on a successful submission", async () => {
    const res = await call([{ photoId: "photo-1" }, { photoId: "photo-2" }]);
    expect(res.status).toBe(200);
    expect(transactionCommitMock).toHaveBeenCalledTimes(1);
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        albumId: "album-1",
        albumTitle: "Doe Wedding",
        clientName: "Jane & John",
        selectionCount: 2,
        galleryUrl: "http://ylx.test/admin",
      })
    );
  });

  it("still returns 200 when the email notification throws (email failure must not fail submit)", async () => {
    notifyAdminsMock.mockRejectedValue(new Error("Resend is down"));
    const res = await call([{ photoId: "photo-1" }]);
    expect(res.status).toBe(200);
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
  });

  it("still returns 200 when the email notification resolves 0 sent (no admins configured)", async () => {
    notifyAdminsMock.mockResolvedValue(0);
    const res = await call([{ photoId: "photo-1" }]);
    expect(res.status).toBe(200);
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1);
  });

  it("does not send an email when the Sanity commit fails (500 path)", async () => {
    transactionCommitMock.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 500 }));
    const res = await call([{ photoId: "photo-1" }]);
    expect(res.status).toBe(500);
    expect(notifyAdminsMock).not.toHaveBeenCalled();
  });

  it("does not send an email on a 409 (already submitted)", async () => {
    transactionCommitMock.mockRejectedValue(
      Object.assign(new Error("conflict"), { statusCode: 409 })
    );
    const res = await call([{ photoId: "photo-1" }]);
    expect(res.status).toBe(409);
    expect(notifyAdminsMock).not.toHaveBeenCalled();
  });

  // A resubmit after the admin unlocked the gallery: unlock.ts leaves the
  // previous round's selection/submission docs intact, so submit.ts must
  // clear them itself instead of 409ing forever on every resubmit attempt.
  it("deletes the previous round's selections/submission and resubmits successfully when selections already exist", async () => {
    sanityFetchMock.mockImplementation((query: string) => {
      if (typeof query !== "string") return Promise.resolve(null);
      if (query.includes("customSlug")) return Promise.resolve(ALBUM);
      if (/pin\b/.test(query)) return Promise.resolve(PIN_RECORD);
      return Promise.resolve([{ _id: "existing-selection" }]); // existing
    });
    const res = await call([{ photoId: "photo-1" }]);
    expect(res.status).toBe(200);
    expect(transactionDeleteMock).toHaveBeenCalledWith("existing-selection");
    expect(transactionDeleteMock).toHaveBeenCalledWith("submission-album-1");
    expect(transactionCommitMock).toHaveBeenCalledTimes(1);
  });
});
