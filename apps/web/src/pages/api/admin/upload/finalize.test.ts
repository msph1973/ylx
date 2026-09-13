import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const getDocumentMock = vi.fn();
const publishAdminEventMock = vi.fn();
const invalidateCacheMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock("../../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));
vi.mock("@ylx/sanity/client", () => ({
  sanityWriteClient: {
    getDocument: (...args: unknown[]) => getDocumentMock(...args),
  },
}));
vi.mock("../../../../lib/ably", () => ({
  publishAdminEvent: (...args: unknown[]) => publishAdminEventMock(...args),
}));
vi.mock("../../../../lib/cache", () => ({
  invalidateCache: (...args: unknown[]) => invalidateCacheMock(...args),
  CACHE_KEYS: {
    albumsList: () => "cache:admin:albums:list",
    albumSelections: (id: string) => `cache:admin:selections:${id}`,
    albumBySlug: (slug: string) => `cache:gallery:album:${slug}`,
  },
}));
vi.mock("../../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));

import { POST } from "./finalize";

const VENDOR = { id: "admin.v1", role: "vendor", ownerId: "admin.v1" };

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/upload/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue(VENDOR);
  publishAdminEventMock.mockReset().mockResolvedValue(undefined);
  invalidateCacheMock.mockReset().mockResolvedValue(undefined);
  captureErrorMock.mockReset();
  getDocumentMock.mockReset().mockImplementation((id: unknown) => {
    if (id === "album-drive") {
      return Promise.resolve({
        _id: "album-drive",
        _type: "album",
        owner: { _ref: "admin.v1", _type: "reference" },
        storageType: "drive",
      });
    }
    if (id === "image-abc123") {
      return Promise.resolve({ _id: "image-abc123", _type: "sanity.imageAsset" });
    }
    return Promise.resolve(undefined);
  });
});

describe("POST /api/admin/upload/finalize storage model", () => {
  it("returns 409 for a Drive-backed album without touching assets", async () => {
    const res = await POST({
      cookies: {},
      request: postRequest({ assetId: "image-abc123", albumId: "album-drive", filename: "DSC.jpg" }),
    } as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("folder scans");
    expect(publishAdminEventMock).not.toHaveBeenCalled();
  });
});
