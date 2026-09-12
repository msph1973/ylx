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
      ownerId: "admin-fresh-1",
      role: "superadmin",
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
      ownerId: "admin-stale-2",
      role: "superadmin",
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
      ownerId: "admin-deleted-3",
      role: "superadmin",
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
      ownerId: "admin-legacy-4",
      role: "superadmin",
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
      ownerId: "admin-expired-5",
      role: "superadmin",
      expiresAt: Date.now() - 1000,
      sessionVersion: 0,
    });

    const session = await getSession(makeCookies(cookieValue));
    expect(session).toBeNull();
    expect(getAdminSessionVersionMock).not.toHaveBeenCalled();
  });

  it("requireAdmin rejects a revoked session even with a superadmin role", async () => {
    const { signSession, requireAdmin } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(1); // bumped past this cookie's version

    const cookieValue = signSession({
      id: "admin-revoked-6",
      email: "a@x.test",
      name: "A",
      ownerId: "admin-revoked-6",
      role: "superadmin",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 0,
    });

    const session = await requireAdmin(makeCookies(cookieValue));
    expect(session).toBeNull();
  });

  it("fails closed (returns null, never throws) when the session-version lookup itself rejects", async () => {
    // Regression test: getCached() can propagate a thrown fetcher error on a
    // cache hard-miss. getSession/requireAdmin are documented as "return null
    // on any problem" — a transient Sanity blip here must surface as a
    // redirect-to-login, not a 500, for callers like pages/admin/*.astro that
    // `await` this in frontmatter with no try/catch of their own.
    const { signSession, getSession, requireAdmin } = await import("./auth");
    getAdminSessionVersionMock.mockRejectedValue(new Error("Sanity request timed out"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const cookieValue = signSession({
      id: "admin-fetch-error-7",
      email: "a@x.test",
      name: "A",
      ownerId: "admin-fetch-error-7",
      role: "superadmin",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 2,
    });

    await expect(getSession(makeCookies(cookieValue))).resolves.toBeNull();
    await expect(requireAdmin(makeCookies(cookieValue))).resolves.toBeNull();
  });
});


describe("S2 roles \u2014 strict union + superadmin gate", () => {
  beforeEach(() => {
    vi.resetModules();
    getAdminSessionVersionMock.mockReset();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  // Sign an arbitrary payload (bypasses signSession's type) to simulate
  // cookies issued before the S2 role migration.
  function signRaw(payloadObj: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", "test-session-secret")
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  function legacyRoleCookie(role: string): string {
    return signRaw({
      id: "admin-legacy-role",
      email: "a@x.test",
      name: "A",
      role,
      ownerId: "admin-legacy-role",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 0,
    });
  }

  it.each(["admin", "photographer"])("rejects legacy role value %j", async (role) => {
    // Dynamic import: each test re-imports auth.ts fresh so vi.resetModules()
    // gives it a clean module-scope SESSION_SECRET read (file-wide pattern).
    const { getSession, requireAdmin } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(0);

    await expect(getSession(makeCookies(legacyRoleCookie(role)))).resolves.toBeNull();
    await expect(requireAdmin(makeCookies(legacyRoleCookie(role)))).resolves.toBeNull();
  });

  it("rejects a session without ownerId (pre-S2 cookie shape)", async () => {
    const { getSession } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(0);

    const cookieValue = signRaw({
      id: "admin-no-owner",
      email: "a@x.test",
      name: "A",
      role: "superadmin",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 0,
    });

    await expect(getSession(makeCookies(cookieValue))).resolves.toBeNull();
  });

  it("requireSuperAdmin allows superadmin, rejects vendor and anonymous", async () => {
    const { signSession, requireSuperAdmin } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(0);

    const superCookie = signSession({
      id: "admin-super-1",
      email: "s@x.test",
      name: "S",
      role: "superadmin",
      ownerId: "admin-super-1",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 0,
    });
    const vendorCookie = signSession({
      id: "admin-vendor-1",
      email: "v@x.test",
      name: "V",
      role: "vendor",
      ownerId: "admin-vendor-1",
      expiresAt: Date.now() + 60_000,
      sessionVersion: 0,
    });

    const superSession = await requireSuperAdmin(makeCookies(superCookie));
    expect(superSession?.id).toBe("admin-super-1");
    await expect(requireSuperAdmin(makeCookies(vendorCookie))).resolves.toBeNull();
    await expect(requireSuperAdmin(makeCookies(undefined))).resolves.toBeNull();
  });

  it("requireAdmin accepts both superadmin and vendor", async () => {
    const { signSession, requireAdmin } = await import("./auth");
    getAdminSessionVersionMock.mockResolvedValue(0);

    for (const role of ["superadmin", "vendor"] as const) {
      const cookieValue = signSession({
        id: `admin-${role}`,
        email: `${role}@x.test`,
        name: role,
        role,
        ownerId: `admin-${role}`,
        expiresAt: Date.now() + 60_000,
        sessionVersion: 0,
      });
      const session = await requireAdmin(makeCookies(cookieValue));
      expect(session?.role).toBe(role);
    }
  });
});
