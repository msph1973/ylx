import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdTokenMock = vi.fn();
const OAuth2ClientMock = vi.fn();
const getAdminByEmailMock = vi.fn();
const signSessionMock = vi.fn();
const isRateLimitedMock = vi.fn();
const isLimitReachedMock = vi.fn();
const recordFailedAttemptMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    constructor(...args: unknown[]) {
      OAuth2ClientMock(...args);
    }
    verifyIdToken = (...args: unknown[]) => verifyIdTokenMock(...args);
  },
}));
vi.mock("@ylx/sanity/lib/admin", () => ({
  getAdminByEmail: (...args: unknown[]) => getAdminByEmailMock(...args),
}));
vi.mock("../../../lib/auth", () => ({
  signSession: (...args: unknown[]) => signSessionMock(...args),
}));
vi.mock("../../../lib/ratelimit", () => ({
  isRateLimited: (...args: unknown[]) => isRateLimitedMock(...args),
  isLimitReached: (...args: unknown[]) => isLimitReachedMock(...args),
  recordFailedAttempt: (...args: unknown[]) => recordFailedAttemptMock(...args),
  RATE_LIMIT_RETRY_AFTER: "900",
}));
vi.mock("../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));

import { POST } from "./google";

process.env.GOOGLE_CLIENT_ID = "test-client-id";

const VENDOR_DOC = {
  _id: "admin.vendor1",
  email: "vendor@studio.com",
  name: "Vendor",
  role: "vendor",
  sessionVersion: 0,
};

function googlePayload(overrides: Record<string, unknown> = {}) {
  return {
    email: "vendor@studio.com",
    email_verified: true,
    aud: "test-client-id",
    ...overrides,
  };
}

function postRequest(idToken: unknown): Request {
  return new Request("http://localhost/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
}

function ctx(idToken: unknown) {
  const set = vi.fn();
  return {
    context: {
      request: postRequest(idToken),
      cookies: { get: vi.fn(), set },
      clientAddress: "1.2.3.4",
    } as never,
    set,
  };
}

beforeEach(() => {
  verifyIdTokenMock.mockReset().mockResolvedValue({ getPayload: () => googlePayload() });
  OAuth2ClientMock.mockReset();
  getAdminByEmailMock.mockReset().mockResolvedValue(VENDOR_DOC);
  signSessionMock.mockReset().mockReturnValue("signed-cookie");
  isRateLimitedMock.mockReset().mockResolvedValue(false);
  isLimitReachedMock.mockReset().mockResolvedValue(false);
  recordFailedAttemptMock.mockReset().mockResolvedValue(undefined);
  captureErrorMock.mockReset();
});

describe("POST /api/auth/google", () => {
  it("rejects an uninvited Google email with generic 403", async () => {
    getAdminByEmailMock.mockResolvedValue(null);
    const { context } = ctx("valid-token");
    const res = await POST(context);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Access denied" });
    expect(recordFailedAttemptMock).toHaveBeenCalledWith("login:vendor@studio.com");
  });

  it("issues a vendor session with role and ownerId forced from the doc", async () => {
    const { context, set } = ctx("valid-token");
    const res = await POST(context);
    expect(res.status).toBe(200);
    expect(signSessionMock).toHaveBeenCalledWith({
      id: "admin.vendor1",
      email: "vendor@studio.com",
      name: "Vendor",
      role: "vendor",
      ownerId: "admin.vendor1",
      expiresAt: expect.any(Number),
      sessionVersion: 0,
    });
    // Cookie options copied exactly from login.ts
    expect(set).toHaveBeenCalledWith("admin_session", "signed-cookie", {
      path: "/",
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
    });
    expect(await res.json()).toEqual({
      success: true,
      admin: { name: "Vendor", email: "vendor@studio.com", role: "vendor" },
    });
  });

  it("verifies the IdToken against GOOGLE_CLIENT_ID from env", async () => {
    const { context } = ctx("valid-token");
    await POST(context);
    expect(OAuth2ClientMock).toHaveBeenCalledWith("test-client-id");
    expect(verifyIdTokenMock).toHaveBeenCalledWith({ idToken: "valid-token", audience: "test-client-id" });
  });

  it("rejects a forged/expired token with generic 403", async () => {
    verifyIdTokenMock.mockRejectedValue(new Error("invalid signature"));
    const { context } = ctx("forged-token");
    const res = await POST(context);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Access denied" });
    expect(signSessionMock).not.toHaveBeenCalled();
  });

  it("rejects an unverified Google email with generic 403", async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => googlePayload({ email_verified: false }) });
    const { context } = ctx("valid-token");
    const res = await POST(context);
    expect(res.status).toBe(403);
    expect(signSessionMock).not.toHaveBeenCalled();
  });

  it("rejects a disabled vendor with generic 403", async () => {
    getAdminByEmailMock.mockResolvedValue({ ...VENDOR_DOC, disabled: true });
    const { context } = ctx("valid-token");
    const res = await POST(context);
    expect(res.status).toBe(403);
    expect(signSessionMock).not.toHaveBeenCalled();
  });

  it("lowercases the email before lookup and forces role from the doc", async () => {
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => googlePayload({ email: "Vendor@Studio.COM" }) });
    getAdminByEmailMock.mockResolvedValue({ ...VENDOR_DOC, role: "superadmin" });
    const { context } = ctx("valid-token");
    const res = await POST(context);
    expect(getAdminByEmailMock).toHaveBeenCalledWith("vendor@studio.com");
    expect(signSessionMock).toHaveBeenCalledWith(expect.objectContaining({ role: "superadmin" }));
    expect(res.status).toBe(200);
  });

  it("returns 429 when the IP is rate limited", async () => {
    isRateLimitedMock.mockResolvedValue(true);
    const { context } = ctx("valid-token");
    const res = await POST(context);
    expect(res.status).toBe(429);
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the ID token is missing", async () => {
    const { context } = ctx(undefined);
    const res = await POST(context);
    expect(res.status).toBe(400);
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });
});
