import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const sanityFetchMock = vi.fn();
const getDocumentMock = vi.fn();
const deleteMock = vi.fn();
const transactionCommitMock = vi.fn();
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
    getDocument: (...args: unknown[]) => getDocumentMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    transaction: () => ({
      create: () => ({
        patch: () => ({
          commit: (...args: unknown[]) => transactionCommitMock(...args),
        }),
      }),
      patch: () => ({
        delete: () => ({
          commit: (...args: unknown[]) => transactionCommitMock(...args),
        }),
      }),
    }),
  },
}));

import { DELETE } from "./final-photos";

function makeRequest(body: unknown) {
  return new Request("https://example.test/api/admin/albums/album-1/final-photos", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

function call(body: unknown, id = "album-1") {
  return DELETE({
    request: makeRequest(body),
    params: { id },
    cookies: { get: () => undefined },
  } as never);
}

const ALBUM = {
  _id: "album-1",
  _type: "album",
  status: "delivered",
  slug: { current: "doe-wedding" },
  finalPhotos: [{ _ref: "final-photo-1" }],
};

const FINAL_PHOTO = { _id: "final-photo-1", album: { _ref: "album-1" } };
const PROOFING_PHOTO = { _id: "proof-photo-1", album: { _ref: "album-1" } };

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue({ adminId: "admin-1" });
  sanityFetchMock.mockReset();
  getDocumentMock.mockReset();
  deleteMock.mockReset();
  transactionCommitMock.mockReset().mockResolvedValue({});
  publishAdminEventMock.mockReset().mockResolvedValue(undefined);
  publishAlbumEventMock.mockReset().mockResolvedValue(undefined);
  invalidateCacheMock.mockReset().mockResolvedValue(undefined);
  captureErrorMock.mockReset();
});

describe("DELETE /api/admin/albums/[id]/final-photos", () => {
  it("401s when there is no admin session", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await call({ photoId: "final-photo-1" });
    expect(res.status).toBe(401);
  });

  it("400s when photoId is missing", async () => {
    const res = await call({});
    expect(res.status).toBe(400);
  });

  // GROQ injection guard (bot review item #7): a photoId containing quotes
  // or GROQ operators must be rejected by format validation before it ever
  // reaches the `unset(finalPhotos[_ref=="<photoId>"])` string below.
  it("rejects a photoId containing quotes/GROQ operators before any Sanity call", async () => {
    const malicious = 'x"] || true; unset(finalPhotos[_ref=="';
    const res = await call({ photoId: malicious });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid photo ID format" });
    expect(sanityFetchMock).not.toHaveBeenCalled();
    expect(transactionCommitMock).not.toHaveBeenCalled();
  });

  it("404s for a well-formed photoId that belongs to the album's proofing photos but not finalPhotos", async () => {
    sanityFetchMock
      .mockResolvedValueOnce(ALBUM)
      .mockResolvedValueOnce(PROOFING_PHOTO);
    const res = await call({ photoId: "proof-photo-1" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Final photo not found on this album" });
    expect(transactionCommitMock).not.toHaveBeenCalled();
  });

  it("succeeds for a photoId that is a member of finalPhotos", async () => {
    sanityFetchMock
      .mockResolvedValueOnce(ALBUM)
      .mockResolvedValueOnce(FINAL_PHOTO);
    const res = await call({ photoId: "final-photo-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(transactionCommitMock).toHaveBeenCalledTimes(1);
    expect(publishAlbumEventMock).toHaveBeenCalledWith("album-1", "finalPhoto:deleted", { photoId: "final-photo-1" });
  });

  it("400s when the album status doesn't allow final-photo removal", async () => {
    sanityFetchMock
      .mockResolvedValueOnce({ ...ALBUM, status: "active" })
      .mockResolvedValueOnce(FINAL_PHOTO);
    const res = await call({ photoId: "final-photo-1" });
    expect(res.status).toBe(400);
    expect(transactionCommitMock).not.toHaveBeenCalled();
  });
});
