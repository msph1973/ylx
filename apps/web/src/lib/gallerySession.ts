import type { AstroCookies } from "astro";
import { sign, verify } from "./signedCookie";

// Records which albums a browser has proven PIN knowledge for, so the Ably
// token endpoint can scope realtime capability per album instead of granting
// a blanket `album:*` subscribe to every visitor (see M-2 in new-audit.md:
// info disclosure — anyone could listen to any album's realtime events
// without ever verifying a PIN).
interface GalleryPinEntry {
  albumId: string;
  expiresAt: number;
}

const COOKIE_NAME = "gallery_pin_session";
// A browser verifying more than a handful of albums (photographer testing
// multiple client links, say) only needs the most recent ones — cap growth
// instead of letting the cookie accumulate every album ever visited.
const MAX_ENTRIES = 8;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // matches admin session length

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
// browser may subscribe to that album's realtime channel going forward.
export function grantAlbumAccess(cookies: AstroCookies, albumId: string): void {
  const entries = readEntries(cookies).filter((e) => e.albumId !== albumId);
  entries.push({ albumId, expiresAt: Date.now() + SESSION_TTL_MS });
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
// capability for a specific album's channel.
export function hasAlbumAccess(cookies: AstroCookies, albumId: string): boolean {
  return readEntries(cookies).some((e) => e.albumId === albumId);
}
