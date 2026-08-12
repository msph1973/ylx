import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const sanityFetchMock = vi.fn();
const getDocumentMock = vi.fn();
const deleteMock = vi.fn();
const transactionCommitMock = vi.fn();
const patchCommitMock = vi.fn();
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
      createIfNotExists: () => ({
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
    patch: () => ({
      setIfMissing: () => ({
        append: () => ({
          commit: (...args: unknown[]) => patchCommitMock(...args),
        }),
      }),
    }),
  },
}));

import { DELETE, POST } from "./final-photos";

function makeRequest(body: unknown, method = "DELETE") {
  return new Request("https://example.test/api/admin/albums/album-1/final-photos", {
    method,
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

function callPost(body: unknown, id = "album-1") {
  return POST({
    request: makeRequest(body, "POST"),
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
  patchCommitMock.mockReset().mockResolvedValue({});
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

const POST_ALBUM = {
  _id: "album-1",
  _type: "album",
  status: "locked",
  slug: { current: "doe-wedding" },
  customSlug: undefined,
  finalPhotos: [],
};
const ASSET = { _type: "sanity.imageAsset", mimeType: "image/jpeg", size: 1024 };

const ASSET_ID = "image-abc123-800x600-jpg";
// The photoId is deterministic (`final-<assetId>`), not a random UUID — see
// final-photos.ts for why: it makes a lookup by this id structurally unable
// to ever match an unrelated proofing `photo` document that references the
// same asset (a real bug an earlier assetId+album *query*-based idempotency
// check had).
const DETERMINISTIC_PHOTO_ID = `final-${ASSET_ID}`;

describe("POST /api/admin/albums/[id]/final-photos", () => {
  it("creates a new photo document + finalPhotos entry when none exists yet for this asset", async () => {
    sanityFetchMock.mockResolvedValueOnce(POST_ALBUM); // album lookup
    getDocumentMock
      .mockResolvedValueOnce(ASSET) // asset validation
      .mockResolvedValueOnce(null); // idempotency check: no existing photo for this id
    const res = await callPost({ assetId: ASSET_ID, filename: "edit-01.jpg" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, photoId: DETERMINISTIC_PHOTO_ID });
    expect(transactionCommitMock).toHaveBeenCalledTimes(1);
    expect(patchCommitMock).not.toHaveBeenCalled();
  });

  // Idempotency guard (bot review, third+fourth pass): a retried request for
  // an asset that was already fully wired up must not create a duplicate
  // photo document or a duplicate finalPhotos entry — and the lookup must be
  // by the deterministic id (not a fuzzy album+assetId query) so it can never
  // latch onto an unrelated proofing photo that happens to share the asset.
  it("is idempotent: a retry with the same assetId that's already linked returns the existing photo without creating anything new", async () => {
    const existing = { _id: DETERMINISTIC_PHOTO_ID };
    sanityFetchMock.mockResolvedValueOnce({ ...POST_ALBUM, finalPhotos: [{ _ref: DETERMINISTIC_PHOTO_ID }] });
    getDocumentMock
      .mockResolvedValueOnce(ASSET)
      .mockResolvedValueOnce(existing);
    const res = await callPost({ assetId: ASSET_ID, filename: "edit-01.jpg" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, photoId: DETERMINISTIC_PHOTO_ID });
    expect(transactionCommitMock).not.toHaveBeenCalled();
    expect(patchCommitMock).not.toHaveBeenCalled();
    expect(publishAdminEventMock).not.toHaveBeenCalled();
  });

  it("finishes a half-completed link: an existing photo document not yet in finalPhotos gets appended instead of duplicated", async () => {
    const existing = { _id: DETERMINISTIC_PHOTO_ID };
    sanityFetchMock.mockResolvedValueOnce({ ...POST_ALBUM, finalPhotos: [] });
    getDocumentMock
      .mockResolvedValueOnce(ASSET)
      .mockResolvedValueOnce(existing);
    const res = await callPost({ assetId: ASSET_ID, filename: "edit-01.jpg" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, photoId: DETERMINISTIC_PHOTO_ID });
    expect(transactionCommitMock).not.toHaveBeenCalled();
    expect(patchCommitMock).toHaveBeenCalledTimes(1);
    expect(publishAlbumEventMock).toHaveBeenCalledWith("album-1", "finalPhoto:uploaded", { photoId: DETERMINISTIC_PHOTO_ID, filename: "edit-01.jpg" });
  });

  // The P1 bug this deterministic-id redesign closes: a fuzzy album+assetId
  // query could previously match a PROOFING photo (created by
  // upload/finalize.ts, also `_type: "photo"`, also referencing `album` and
  // the same asset) if a photographer reused the same original file as its
  // own final photo — risking the wrong image being served, and a later
  // final-photo delete corrupting the shared proofing document. The
  // deterministic id makes that structurally impossible: a proofing photo's
  // `_id` is a plain random UUID, never `final-<assetId>`.
  it("never matches a proofing photo that happens to reference the same asset — always creates/uses the final-<assetId> document instead", async () => {
    sanityFetchMock.mockResolvedValueOnce({ ...POST_ALBUM, finalPhotos: [] });
    getDocumentMock
      .mockResolvedValueOnce(ASSET) // asset validation
      // Idempotency lookup is by the deterministic id, which a proofing
      // photo (random-UUID id) could never satisfy — simulate that: no
      // document exists yet at `final-<assetId>` even though a proofing
      // photo referencing the same asset exists elsewhere in the dataset.
      .mockResolvedValueOnce(null);
    const res = await callPost({ assetId: ASSET_ID, filename: "edit-01.jpg" });
    expect(res.status).toBe(201);
    expect(getDocumentMock).toHaveBeenNthCalledWith(2, DETERMINISTIC_PHOTO_ID);
    expect(transactionCommitMock).toHaveBeenCalledTimes(1);
  });
});
