import { describe, it, expect } from "vitest";
import type { AstroCookies } from "astro";

// Exercises the M-2 fix (new-audit.md): PIN verification now records
// per-album access in a signed cookie, so the Ably token endpoint can grant
// subscribe capability scoped to just that album instead of `album:*`.

process.env.SESSION_SECRET = "test-session-secret";

function makeCookieJar(): AstroCookies {
  const store = new Map<string, string>();
  return {
    get: (name: string) => (store.has(name) ? { value: store.get(name) } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
  } as unknown as AstroCookies;
}

describe("grantAlbumAccess / hasAlbumAccess", () => {
  it("grants access to an album after it's recorded", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    expect(hasAlbumAccess(cookies, "album-1")).toBe(false);
    grantAlbumAccess(cookies, "album-1");
    expect(hasAlbumAccess(cookies, "album-1")).toBe(true);
  });

  it("does not grant access to a different, unverified album", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1");
    expect(hasAlbumAccess(cookies, "album-2")).toBe(false);
  });

  it("accumulates access across multiple verified albums in the same browser", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1");
    grantAlbumAccess(cookies, "album-2");

    expect(hasAlbumAccess(cookies, "album-1")).toBe(true);
    expect(hasAlbumAccess(cookies, "album-2")).toBe(true);
  });

  it("caps stored entries so the cookie cannot grow unbounded", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    for (let i = 0; i < 10; i++) {
      grantAlbumAccess(cookies, `album-${i}`);
    }

    // The oldest entries (album-0, album-1) should have been evicted once
    // the cap (8) was exceeded; the most recent ones remain.
    expect(hasAlbumAccess(cookies, "album-0")).toBe(false);
    expect(hasAlbumAccess(cookies, "album-9")).toBe(true);
  });

  it("rejects a tampered cookie value", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1");
    const tampered = cookies.get("gallery_pin_session")!.value.slice(0, -2) + "xx";
    cookies.set("gallery_pin_session", tampered, {});

    expect(hasAlbumAccess(cookies, "album-1")).toBe(false);
  });

  it("returns false for every album when no cookie has been set", async () => {
    const { hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    expect(hasAlbumAccess(cookies, "album-1")).toBe(false);
  });
});
