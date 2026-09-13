import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const getAdminByEmailMock = vi.fn();
const sanityPatchMock = vi.fn();
const invalidateCacheMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock("../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));
vi.mock("@ylx/sanity/lib/admin", () => ({
  getAdminByEmail: (...args: unknown[]) => getAdminByEmailMock(...args),
}));
vi.mock("@ylx/sanity/client", () => ({
  sanityWriteClient: {
    patch: (...args: unknown[]) => sanityPatchMock(...args),
  },
}));
vi.mock("../../../lib/vendorGalleries", () => ({
  invalidateVendorGalleries: (...args: unknown[]) => invalidateCacheMock(...args),
}));
vi.mock("../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));

import { GET, PUT } from "./profile";

const VENDOR_SESSION = { id: "admin.v1", email: "a@studio.com", role: "vendor", ownerId: "admin.v1" };
const VENDOR_DOC = {
  _id: "admin.v1",
  email: "a@studio.com",
  name: "Vendor Baru",
  role: "vendor",
  profileComplete: false,
  sessionVersion: 0,
};

function cookies() {
  return { get: vi.fn(), set: vi.fn() } as never;
}

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue(VENDOR_SESSION);
  getAdminByEmailMock.mockReset().mockResolvedValue(VENDOR_DOC);
  sanityPatchMock.mockReset().mockImplementation(() => ({
    set: (patch: unknown) => {
      (sanityPatchMock as unknown as { lastPatch?: unknown }).lastPatch = patch;
      return { commit: () => Promise.resolve({ _id: "admin.v1" }) };
    },
  }));
  invalidateCacheMock.mockReset().mockResolvedValue(undefined);
  captureErrorMock.mockReset();
});

describe("GET /api/admin/profile", () => {
  it("returns 401 without a session", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await GET({ cookies: cookies() } as never);
    expect(res.status).toBe(401);
  });

  it("returns the caller's own profile with onboarding state", async () => {
    const res = await GET({ cookies: cookies() } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      email: "a@studio.com",
      name: "Vendor Baru",
      profileComplete: false,
    });
  });

  it("treats superadmins as complete regardless of the flag", async () => {
    requireAdminMock.mockResolvedValue({ id: "s", email: "b@x.com", role: "superadmin", ownerId: "s" });
    getAdminByEmailMock.mockResolvedValue({ ...VENDOR_DOC, role: "superadmin" });
    const res = await GET({ cookies: cookies() } as never);
    expect(await res.json()).toMatchObject({ profileComplete: true });
  });
});

describe("PUT /api/admin/profile", () => {
  it("saves the vendor's own display name and completes onboarding", async () => {
    const res = await PUT({ request: putRequest({ name: "Studio Priday" }), cookies: cookies() } as never);
    expect(res.status).toBe(200);
    expect(sanityPatchMock).toHaveBeenCalledWith("admin.v1");
    const patch = (sanityPatchMock as unknown as { lastPatch: Record<string, unknown> }).lastPatch;
    expect(patch).toMatchObject({ name: "Studio Priday", profileComplete: true });
  });

  it("returns 400 for an empty name and never patches", async () => {
    const res = await PUT({ request: putRequest({ name: "   " }), cookies: cookies() } as never);
    expect(res.status).toBe(400);
    expect(sanityPatchMock).not.toHaveBeenCalled();
  });

  it("validates brand and busts gallery caches on brand change", async () => {
    const bad = await PUT({
      request: putRequest({ brand: { accentColor: "red" } }),
      cookies: cookies(),
    } as never);
    expect(bad.status).toBe(400);
    const ok = await PUT({
      request: putRequest({ brand: { accentColor: "#e8a06a" } }),
      cookies: cookies(),
    } as never);
    expect(ok.status).toBe(200);
    expect(invalidateCacheMock).toHaveBeenCalledWith("admin.v1");
  });

  it("returns 401 without a session", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await PUT({ request: putRequest({ name: "X" }), cookies: cookies() } as never);
    expect(res.status).toBe(401);
  });
});
