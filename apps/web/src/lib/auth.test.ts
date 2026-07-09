import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AstroCookies } from "astro";

// `auth.ts` is re-imported fresh (via `vi.resetModules()`) in every test so
// each one gets its own module-scope `SESSION_SECRET` read and a clean
// `inFlightRefreshes`/cache state in `cache.ts` — this file exercises the M-1
// fix (session revocation via `sessionVersion`, see new-audit.md) in
// isolation from the real Sanity/Upstash backends.

const getAdminSessionVersionMock = vi.fn();

vi.mock("@ylx/sanity/lib/admin", () => ({
  getAdminSessionVersion: (adminId: string) => getAdminSessionVersionMock(adminId),
}));

process.env.SESSION_SECRET = "test-session-secret";

function makeCookies(cookieValue: string | undefined): AstroCookies {
  return {
    get: (name: string) =>
      name === "admin_session" && cookieValue !== undefined ? { value: cookieValue } : undefined,
  } as unknown as AstroCookies;
}

describe("getSession — session revocation (M-1)", () => {
  beforeEach(() => {
    vi.resetModules();
    getAdminSessionVersionMock.mockReset();
    // Force `cache.ts` to fail open and call the (mocked) Sanity lookup
    // directly on every test, regardless of what's in the ambient env.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("accepts a session whose sessionVersion matches the admin doc's current version", async () => {
    const { signSession, getSession } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(2);

    const cookieValue = signSession({
      id: "admin-fresh-1",
      email: "a@x.test",
      name: "A",
      role: "admin",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 2,
    });

    const session = await getSession(makeCookies(cookieValue));
    expect(session?.id).toBe("admin-fresh-1");
  });

  it("rejects a session whose sessionVersion is stale (revoked via logout)", async () => {
    const { signSession, getSession } = await import("./auth");
    // Admin logged out once since this cookie was issued -> Sanity now at v3.
    getAdminSessionVersionMock.mockResolvedValue(3);

    const cookieValue = signSession({
      id: "admin-stale-2",
      email: "a@x.test",
      name: "A",
      role: "admin",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 2,
    });

    const session = await getSession(makeCookies(cookieValue));
    expect(session).toBeNull();
  });

  it("rejects a session when the admin doc no longer exists", async () => {
    const { signSession, getSession } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(null);

    const cookieValue = signSession({
      id: "admin-deleted-3",
      email: "a@x.test",
      name: "A",
      role: "admin",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 0,
    });

    const session = await getSession(makeCookies(cookieValue));
    expect(session).toBeNull();
  });

  it("rejects a legacy cookie signed before sessionVersion existed", async () => {
    const { getSession } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(0);

    // Simulate a pre-migration payload lacking `sessionVersion` entirely by
    // constructing the cookie manually — `signSession`'s type now requires
    // the field, so an old-format cookie can no longer be produced through it.
    const payloadObj = {
      id: "admin-legacy-4",
      email: "a@x.test",
      name: "A",
      role: "admin",
      expiresAt: Date.now() + 60_000,
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", "test-session-secret")
      .update(payload)
      .digest("base64url");

    const session = await getSession(makeCookies(`${payload}.${signature}`));
    expect(session).toBeNull();
  });

  it("rejects expired sessions without ever checking sessionVersion", async () => {
    const { signSession, getSession } = await import("./auth");

    const cookieValue = signSession({
      id: "admin-expired-5",
      email: "a@x.test",
      name: "A",
      role: "admin",
      expiresAt: Date.now() - 1000,
      sessionVersion: 0,
    });

    const session = await getSession(makeCookies(cookieValue));
    expect(session).toBeNull();
    expect(getAdminSessionVersionMock).not.toHaveBeenCalled();
  });

  it("requireAdmin rejects a revoked session even with an admin role", async () => {
    const { signSession, requireAdmin } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(1); // bumped past this cookie's version

    const cookieValue = signSession({
      id: "admin-revoked-6",
      email: "a@x.test",
      name: "A",
      role: "admin",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 0,
    });

    const session = await requireAdmin(makeCookies(cookieValue));
    expect(session).toBeNull();
  });
});
