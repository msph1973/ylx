import type { AstroCookies } from "astro";
import { createHash } from "node:crypto";
import { sign, verify } from "./signedCookie";

// Records which albums a browser has proven PIN knowledge for, so the Ably
// token endpoint can scope realtime capability per album instead of granting
// a blanket `album:*` subscribe to every visitor (see M-2 in new-audit.md:
// info disclosure — anyone could listen to any album's realtime events
// without ever verifying a PIN).
interface GalleryPinEntry {
  albumId: string;
  expiresAt: number;
  // SHA-256 hex digest of the PIN that was verified to create this entry.
  // Binds the session to the PIN value itself, not just the album id, so an
  // admin changing a compromised album's PIN invalidates every browser that
  // verified the OLD PIN instead of leaving them valid for the rest of the
  // 24h TTL — see hasValidPinSession(). Optional: cookies signed before this
  // field existed won't have it, and those entries simply never satisfy
  // hasValidPinSession(), forcing a fresh PIN entry; hasAlbumAccess() (which
  // predates PIN-hash binding and has its own established callers) never
  // looks at this field, so its behavior is unaffected either way.
  pinHash?: string;
}

const COOKIE_NAME = "gallery_pin_session";
// A browser verifying more than a handful of albums (photographer testing
// multiple client links, say) only needs the most recent ones — cap growth
// instead of letting the cookie accumulate every album ever visited.
const MAX_ENTRIES = 8;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // matches admin session length

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

function readEntries(cookies: AstroCookies): GalleryPinEntry[] {
  const entries = verify<GalleryPinEntry[]>(cookies.get(COOKIE_NAME)?.value);
  // `verify()` only checks the HMAC signature, not the payload's shape — a
  // signed non-array value (e.g. an `admin_session` payload copied into this
  // cookie's slot, since both share SESSION_SECRET) would otherwise crash
  // `.filter()` below.
  if (!Array.isArray(entries)) {
    return [];
  }
  const now = Date.now();
  return entries.filter(
    (e) => e && typeof e.albumId === "string" && typeof e.expiresAt === "number" && e.expiresAt > now
  );
}

// Call on a successful PIN verification (`verify.ts`) to record that this
// browser may subscribe to that album's realtime channel going forward, and
// which PIN it proved knowledge of (see hasValidPinSession()).
export function grantAlbumAccess(cookies: AstroCookies, albumId: string, pin: string): void {
  const entries = readEntries(cookies).filter((e) => e.albumId !== albumId);
  entries.push({ albumId, expiresAt: Date.now() + SESSION_TTL_MS, pinHash: hashPin(pin) });
  const trimmed = entries.slice(-MAX_ENTRIES);

  cookies.set(COOKIE_NAME, sign(trimmed), {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

// Call from `api/ably/token.ts` to decide whether to grant subscribe
// capability for a specific album's channel. Deliberately unchanged by the
// PIN-hash binding above: only checks that a live entry exists for this
// album, same as before.
export function hasAlbumAccess(cookies: AstroCookies, albumId: string): boolean {
  return readEntries(cookies).some((e) => e.albumId === albumId);
}

// Stricter check for the gallery session-resume flow (`session.ts`): an
// album-matching entry is not enough on its own — its stored pinHash must
// also match the album's CURRENT pin, so that an admin changing a
// compromised PIN immediately invalidates every browser that verified the
// old one, rather than leaving them valid for the rest of the 24h TTL.
export function hasValidPinSession(cookies: AstroCookies, albumId: string, currentPin: string): boolean {
  const currentHash = hashPin(currentPin);
  return readEntries(cookies).some((e) => e.albumId === albumId && e.pinHash === currentHash);
}

// Check whether the browser has ANY active gallery session — cheaper than
// fetching the album from Sanity just to find out the cookie is expired or
// unsigned (session.ts unauthenticated probe guard).
export function hasActiveSession(cookies: AstroCookies): boolean {
  return readEntries(cookies).length > 0;
}
