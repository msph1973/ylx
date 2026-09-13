import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();

vi.mock("../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

import { GET } from "./session";

beforeEach(() => {
  requireAdminMock.mockReset();
});

describe("GET /api/auth/session", () => {
  it("returns role and ownerId for an authenticated admin", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin.v1", role: "vendor", ownerId: "admin.v1" });
    const res = await GET({ cookies: {} } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "vendor", ownerId: "admin.v1" });
  });

  it("returns 401 without a session", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await GET({ cookies: {} } as never);
    expect(res.status).toBe(401);
  });
});
