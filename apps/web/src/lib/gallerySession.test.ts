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
    grantAlbumAccess(cookies, "album-1", "1234");
    expect(hasAlbumAccess(cookies, "album-1")).toBe(true);
  });

  it("does not grant access to a different, unverified album", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1", "1234");
    expect(hasAlbumAccess(cookies, "album-2")).toBe(false);
  });

  it("accumulates access across multiple verified albums in the same browser", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1", "1234");
    grantAlbumAccess(cookies, "album-2", "5678");

    expect(hasAlbumAccess(cookies, "album-1")).toBe(true);
    expect(hasAlbumAccess(cookies, "album-2")).toBe(true);
  });

  it("caps stored entries so the cookie cannot grow unbounded", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    for (let i = 0; i < 10; i++) {
      grantAlbumAccess(cookies, `album-${i}`, "1234");
    }

    // The oldest entries (album-0, album-1) should have been evicted once
    // the cap (8) was exceeded; the most recent ones remain.
    expect(hasAlbumAccess(cookies, "album-0")).toBe(false);
    expect(hasAlbumAccess(cookies, "album-9")).toBe(true);
  });

  it("rejects a tampered cookie value", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1", "1234");
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

// Exercises the PIN-hash binding fix: cookie entries now record a hash of
// the PIN that was verified, so a later PIN change (e.g. after a compromise)
// invalidates sessions granted under the old PIN, without touching
// hasAlbumAccess's own established behavior above.
describe("hasValidPinSession (PIN-hash binding)", () => {
  it("succeeds when checked against the PIN it was granted with", async () => {
    const { grantAlbumAccess, hasValidPinSession } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1", "1234");
    expect(hasValidPinSession(cookies, "album-1", "1234")).toBe(true);
  });

  it("fails once the album's PIN has changed since the session was granted", async () => {
    const { grantAlbumAccess, hasValidPinSession } = await import("./gallerySession");
    const cookies = makeCookieJar();

    // Browser verified PIN "1234"...
    grantAlbumAccess(cookies, "album-1", "1234");
    // ...but the admin has since changed the album's PIN to "5678" — the
    // stale session must not resume against the new PIN.
    expect(hasValidPinSession(cookies, "album-1", "5678")).toBe(false);
    // Checked against the PIN that was actually granted, it's still valid.
    expect(hasValidPinSession(cookies, "album-1", "1234")).toBe(true);
  });

  it("fails when no entry has ever been recorded for the album", async () => {
    const { hasValidPinSession } = await import("./gallerySession");
    const cookies = makeCookieJar();

    expect(hasValidPinSession(cookies, "album-1", "1234")).toBe(false);
  });

  it("fails for a different, unrelated album even with the right PIN", async () => {
    const { grantAlbumAccess, hasValidPinSession } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1", "1234");
    expect(hasValidPinSession(cookies, "album-2", "1234")).toBe(false);
  });

  it("re-granting access replaces the stored hash instead of stacking it", async () => {
    const { grantAlbumAccess, hasValidPinSession } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1", "1234");
    // Re-verifying against a rotated PIN (e.g. re-entering the new PIN after
    // the admin changed it) must replace the old entry, not add a second one.
    grantAlbumAccess(cookies, "album-1", "5678");

    expect(hasValidPinSession(cookies, "album-1", "1234")).toBe(false);
    expect(hasValidPinSession(cookies, "album-1", "5678")).toBe(true);
  });

  it("does not affect hasAlbumAccess, which stays PIN-agnostic by design", async () => {
    const { grantAlbumAccess, hasAlbumAccess } = await import("./gallerySession");
    const cookies = makeCookieJar();

    grantAlbumAccess(cookies, "album-1", "1234");
    // hasAlbumAccess predates PIN-hash binding and callers (ably/token.ts,
    // draft.ts, submit.ts) rely on its existing behavior — it only checks
    // that a live entry exists for the album, regardless of PIN.
    expect(hasAlbumAccess(cookies, "album-1")).toBe(true);
  });
});
