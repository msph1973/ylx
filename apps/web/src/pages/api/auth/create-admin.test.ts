import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AstroCookies } from "astro";

const requireSuperAdminMock = vi.fn();
const createAdminMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock("../../../lib/auth", () => ({
  // Mirrors the real gate: only superadmin sessions pass.
  requireSuperAdmin: async (...args: unknown[]) => {
    const s = (await requireSuperAdminMock(...args)) as { role?: string } | null;
    return s && s.role === "superadmin" ? s : null;
  },
}));
vi.mock("@ylx/sanity/lib/admin", () => ({
  createAdmin: (...args: unknown[]) => createAdminMock(...args),
}));
vi.mock("../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));

import { POST } from "./create-admin";

const SUPERADMIN = { id: "admin.super", role: "superadmin" };
const VENDOR = { id: "admin.v1", role: "vendor" };

function cookies() {
  return { get: vi.fn(), set: vi.fn() } as unknown as AstroCookies;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/create-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireSuperAdminMock.mockReset();
  createAdminMock.mockReset();
  captureErrorMock.mockReset();
});

describe("POST /api/auth/create-admin", () => {
  it("returns 401 for a vendor session without creating anything", async () => {
    requireSuperAdminMock.mockResolvedValue(VENDOR);
    const res = await POST({
      request: postRequest({ email: "evil@x.com", password: "hunter22", name: "E", role: "superadmin" }),
      cookies: cookies(),
    } as never);
    expect(res.status).toBe(401);
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    requireSuperAdminMock.mockResolvedValue(null);
    const res = await POST({
      request: postRequest({ email: "a@x.com", password: "hunter22", name: "A" }),
      cookies: cookies(),
    } as never);
    expect(res.status).toBe(401);
    expect(createAdminMock).not.toHaveBeenCalled();
  });

  it("creates a superadmin account for a superadmin caller", async () => {
    requireSuperAdminMock.mockResolvedValue(SUPERADMIN);
    createAdminMock.mockResolvedValue({ name: "N", email: "n@x.com", role: "superadmin" });
    const res = await POST({
      request: postRequest({ email: "n@x.com", password: "hunter22", name: "N", role: "superadmin" }),
      cookies: cookies(),
    } as never);
    expect(res.status).toBe(201);
    expect(createAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "superadmin" })
    );
  });
});
