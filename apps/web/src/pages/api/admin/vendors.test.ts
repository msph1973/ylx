import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AstroCookies } from "astro";

const requireAdminMock = vi.fn();
const listVendorsMock = vi.fn();
const createInvitedVendorMock = vi.fn();
const getAdminByEmailMock = vi.fn();
const sanityPatchMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock("../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
  // Faithful stand-in for the real gate (unit-tested in lib/auth.test.ts):
  // only superadmin sessions pass; vendors and null are denied.
  requireSuperAdmin: async (...args: unknown[]) => {
    const s = (await requireAdminMock(...args)) as { role?: string } | null;
    return s && s.role === "superadmin" ? s : null;
  },
}));
vi.mock("@ylx/sanity/lib/admin", () => ({
  listVendors: (...args: unknown[]) => listVendorsMock(...args),
  createInvitedVendor: (...args: unknown[]) => createInvitedVendorMock(...args),
  getAdminByEmail: (...args: unknown[]) => getAdminByEmailMock(...args),
}));
vi.mock("@ylx/sanity/client", () => ({
  sanityWriteClient: {
    patch: (...args: unknown[]) => sanityPatchMock(...args),
  },
}));
vi.mock("../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));

import { GET, POST, PUT } from "./vendors";

const SUPERADMIN = { id: "admin.super", email: "boss@ylx.com", name: "Boss", role: "superadmin" };
const VENDOR = { id: "admin.vendor1", email: "vendor@studio.com", name: "Vendor", role: "vendor" };

function cookies() {
  return { get: vi.fn(), set: vi.fn() } as unknown as AstroCookies;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAdminMock.mockReset();
  listVendorsMock.mockReset().mockResolvedValue([]);
  createInvitedVendorMock.mockReset();
  getAdminByEmailMock.mockReset();
  sanityPatchMock.mockReset().mockImplementation(() => ({
    set: () => ({ commit: () => Promise.resolve({ _id: "admin.aaa" }) }),
  }));
  captureErrorMock.mockReset();
});

describe("GET /api/admin/vendors", () => {
  it("returns 403 when unauthenticated", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await GET({ cookies: cookies() } as never);
    expect(res.status).toBe(403);
    expect(listVendorsMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a vendor session", async () => {
    requireAdminMock.mockResolvedValue(VENDOR);
    const res = await GET({ cookies: cookies() } as never);
    expect(res.status).toBe(403);
    expect(listVendorsMock).not.toHaveBeenCalled();
  });

  it("returns the vendor list for superadmin without password hashes", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    listVendorsMock.mockResolvedValue([
      { _id: "admin.aaa", email: "a@studio.com", name: "A", role: "vendor", invitedBy: "admin.super", sessionVersion: 0 },
    ]);
    const res = await GET({ cookies: cookies() } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vendors: Array<Record<string, unknown>> };
    expect(body.vendors).toHaveLength(1);
    expect(body.vendors[0]).toMatchObject({ email: "a@studio.com", name: "A", role: "vendor" });
    expect(body.vendors[0]).not.toHaveProperty("password");
  });
});

describe("POST /api/admin/vendors", () => {
  it("returns 403 for a vendor session without creating anything", async () => {
    requireAdminMock.mockResolvedValue(VENDOR);
    const res = await POST({ request: postRequest({ email: "new@studio.com", name: "New" }), cookies: cookies() } as never);
    expect(res.status).toBe(403);
    expect(createInvitedVendorMock).not.toHaveBeenCalled();
  });

  it("returns 403 when unauthenticated", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await POST({ request: postRequest({ email: "new@studio.com", name: "New" }), cookies: cookies() } as never);
    expect(res.status).toBe(403);
    expect(createInvitedVendorMock).not.toHaveBeenCalled();
  });

  it("creates an invite with 201 for superadmin, attributing invitedBy", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    createInvitedVendorMock.mockResolvedValue({
      _id: "admin.abc",
      email: "new@studio.com",
      name: "New",
      role: "vendor",
      invitedBy: "admin.super",
      sessionVersion: 0,
    });
    const res = await POST({ request: postRequest({ email: "New@studio.com", name: "New" }), cookies: cookies() } as never);
    expect(res.status).toBe(201);
    expect(createInvitedVendorMock).toHaveBeenCalledWith({
      email: "New@studio.com",
      name: "New",
      invitedBy: "admin.super",
    });
    const body = (await res.json()) as { vendor: Record<string, unknown> };
    expect(body.vendor).toMatchObject({ email: "new@studio.com", role: "vendor" });
    expect(body.vendor).not.toHaveProperty("password");
  });

  it("returns 409 for a duplicate invite email", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    createInvitedVendorMock.mockResolvedValue(null);
    const res = await POST({ request: postRequest({ email: "dup@studio.com", name: "Dup" }), cookies: cookies() } as never);
    expect(res.status).toBe(409);
  });

  it("returns 400 for a malformed email", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    const res = await POST({ request: postRequest({ email: "not-an-email", name: "New" }), cookies: cookies() } as never);
    expect(res.status).toBe(400);
    expect(createInvitedVendorMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty name and for a name over 80 chars", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    const empty = await POST({ request: postRequest({ email: "a@studio.com", name: "   " }), cookies: cookies() } as never);
    expect(empty.status).toBe(400);
    const long = await POST(
      { request: postRequest({ email: "a@studio.com", name: "x".repeat(81) }), cookies: cookies() } as never
    );
    expect(long.status).toBe(400);
    expect(createInvitedVendorMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/vendors (brand)", () => {
  const VENDOR_DOC = {
    _id: "admin.aaa",
    email: "a@studio.com",
    name: "A",
    role: "vendor",
    sessionVersion: 0,
  };

  it("returns 403 for a vendor session", async () => {
    requireAdminMock.mockResolvedValue(VENDOR);
    const res = await PUT(
      { request: postRequest({ email: "a@studio.com", brand: {} }), cookies: cookies() } as never
    );
    expect(res.status).toBe(403);
    expect(getAdminByEmailMock).not.toHaveBeenCalled();
  });

  it("sets a valid brand with 200", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    getAdminByEmailMock.mockResolvedValue(VENDOR_DOC);
    const res = await PUT(
      {
        request: postRequest({ email: "a@studio.com", brand: { accentColor: "#e8a06a" } }),
        cookies: cookies(),
      } as never
    );
    expect(res.status).toBe(200);
    expect(sanityPatchMock).toHaveBeenCalledWith("admin.aaa");
  });

  it("returns 400 for a non-hex accent", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    const res = await PUT(
      {
        request: postRequest({ email: "a@studio.com", brand: { accentColor: "red" } }),
        cookies: cookies(),
      } as never
    );
    expect(res.status).toBe(400);
    expect(sanityPatchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a low-contrast accent", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    const res = await PUT(
      {
        request: postRequest({ email: "a@studio.com", brand: { accentColor: "#111111" } }),
        cookies: cookies(),
      } as never
    );
    expect(res.status).toBe(400);
    expect(sanityPatchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-vendor email", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    getAdminByEmailMock.mockResolvedValue(null);
    const res = await PUT(
      {
        request: postRequest({ email: "ghost@studio.com", brand: {} }),
        cookies: cookies(),
      } as never
    );
    expect(res.status).toBe(404);
    expect(sanityPatchMock).not.toHaveBeenCalled();
  });
});
