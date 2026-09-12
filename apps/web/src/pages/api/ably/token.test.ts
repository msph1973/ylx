import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminMock = vi.fn();
const createTokenRequestMock = vi.fn();

vi.mock("../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));
vi.mock("../../../lib/gallerySession", () => ({
  hasAlbumAccess: () => false,
}));
vi.mock("ably", () => ({
  // `function` so `new Ably.Rest({ key })` works like the real SDK.
  default: {
    Rest: vi.fn(function () {
      return { auth: { createTokenRequest: (...args: unknown[]) => createTokenRequestMock(...args) } };
    }),
  },
}));

import { GET } from "./token";

function get(url = "http://localhost/api/ably/token") {
  return GET({ cookies: {}, url: new URL(url) } as never);
}

beforeEach(() => {
  requireAdminMock.mockReset();
  createTokenRequestMock.mockReset().mockResolvedValue({ token: "t" });
  process.env.ABLY_API_KEY = "test-key:secret";
});

describe("GET /api/ably/token capability scoping", () => {
  it("grants superadmin the global channel", async () => {
    requireAdminMock.mockResolvedValue({ id: "a", role: "superadmin", ownerId: "a" });
    await get();
    const capability = JSON.parse(createTokenRequestMock.mock.calls[0][0].capability) as Record<
      string,
      string[]
    >;
    expect(capability["admin:updates"]).toEqual(["subscribe"]);
  });

  it("grants vendors only their owner channel, never the global one", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin.v1", role: "vendor", ownerId: "admin.v1" });
    await get();
    const capability = JSON.parse(createTokenRequestMock.mock.calls[0][0].capability) as Record<
      string,
      string[]
    >;
    expect(capability["admin:updates"]).toBeUndefined();
    expect(capability["admin:admin.v1"]).toEqual(["subscribe"]);
  });

  it("returns 403 when there is no session at all", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(403);
    expect(createTokenRequestMock).not.toHaveBeenCalled();
  });
});
