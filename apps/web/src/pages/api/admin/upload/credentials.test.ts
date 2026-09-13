import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const requireAdminMock = vi.fn();

vi.mock("../../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

const VENDOR = { id: "admin.v1", role: "vendor", ownerId: "admin.v1" };
const SUPERADMIN = { id: "admin.super", role: "superadmin", ownerId: "admin.super" };

function get(route: { GET: (args: never) => Response | Promise<Response> }) {
  return route.GET({ cookies: {} } as never);
}

beforeEach(() => {
  vi.resetModules();
  requireAdminMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/admin/upload/credentials", () => {
  it("returns 401 when unauthenticated", async () => {
    requireAdminMock.mockResolvedValue(null);
    const route = await import("./credentials");
    const res = await get(route);
    expect(res.status).toBe(401);
  });

  it("returns 403 for vendors (Drive-only, never the instance token)", async () => {
    requireAdminMock.mockResolvedValue(VENDOR);
    vi.stubEnv("PUBLIC_SANITY_PROJECT_ID", "proj");
    vi.stubEnv("SANITY_API_TOKEN", "secret");
    const route = await import("./credentials");
    const res = await get(route);
    expect(res.status).toBe(403);
  });

  it("returns the token with no-store for superadmin", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    vi.stubEnv("PUBLIC_SANITY_PROJECT_ID", "proj");
    vi.stubEnv("SANITY_API_TOKEN", "secret");
    const route = await import("./credentials");
    const res = await get(route);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.token).toBe("secret");
  });

  it("returns 500 when upload is not configured", async () => {
    requireAdminMock.mockResolvedValue(SUPERADMIN);
    const route = await import("./credentials");
    const res = await get(route);
    expect(res.status).toBe(500);
  });
});
