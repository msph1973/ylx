import crypto from "node:crypto";
import type { AstroCookies } from "astro";
import { getAdminSessionVersion } from "@ylx/sanity/lib/admin";
import { getCached, invalidateCache, CACHE_KEYS } from "./cache";

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: string;
  expiresAt: number;
  // Must match the admin doc's current `sessionVersion` in Sanity or the
  // session is treated as revoked (see M-1 in new-audit.md: stateless HMAC
  // cookies had no revocation list, so logout never actually invalidated a
  // stolen cookie until it expired 24h later).
  sessionVersion: number;
}

// Session version is re-checked against Sanity on every request, so it's
// cached briefly (perf, not security — invalidated explicitly on logout for
// immediate revocation rather than relying on this TTL to expire).
const SESSION_VERSION_TTL_SECONDS = 20;
const SESSION_VERSION_STALE_TTL_SECONDS = 60;

async function getCurrentSessionVersion(adminId: string): Promise<number | null> {
  return getCached(
    CACHE_KEYS.adminSessionVersion(adminId),
    SESSION_VERSION_TTL_SECONDS,
    SESSION_VERSION_STALE_TTL_SECONDS,
    () => getAdminSessionVersion(adminId)
  );
}

// Called on logout (and, in future, password change) right after bumping the
// admin doc's sessionVersion, so the very next request re-reads Sanity
// instead of trusting a cached pre-bump value for up to the TTL above.
export function invalidateSessionVersionCache(adminId: string): Promise<void> {
  return invalidateCache(CACHE_KEYS.adminSessionVersion(adminId));
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

function hmac(payload: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

// Sign a session as `<base64url(json)>.<hmac>` so the payload cannot be forged.
// Fail fast if SESSION_SECRET is missing so misconfiguration surfaces at login
// instead of silently issuing a cookie that getSession can never validate.
export function signSession(session: AdminSession): string {
  if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export async function getSession(cookies: AstroCookies): Promise<AdminSession | null> {
  const sessionCookie = cookies.get("admin_session");
  if (!sessionCookie || !SESSION_SECRET) {
    return null;
  }

  const [payload, signature] = sessionCookie.value.split(".");
  if (!payload || !signature) {
    return null;
  }

  // Verify HMAC in constant time before trusting the payload.
  const expected = hmac(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let session: AdminSession;
  try {
    session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AdminSession;
  } catch {
    return null;
  }

  // Validate essential fields to guard against a signed payload with missing
  // or wrong types (e.g. if SESSION_SECRET leaked and an attacker crafted a
  // minimal payload, or if a future code path accidentally signs an object
  // without the expected shape). Silent rejection is safe — requireAdmin
  // already treats null as unauthenticated.
  if (
    !session ||
    typeof session.id !== "string" ||
    typeof session.email !== "string" ||
    typeof session.name !== "string" ||
    typeof session.role !== "string" ||
    !Number.isFinite(session.expiresAt) ||
    typeof session.sessionVersion !== "number"
  ) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    return null;
  }

  // Revocation check: a validly-signed, non-expired cookie can still be
  // stale if the admin logged out (or changed password) since it was
  // issued — the version bump on that admin's doc makes it fail here.
  const currentVersion = await getCurrentSessionVersion(session.id);
  if (currentVersion === null || currentVersion !== session.sessionVersion) {
    return null;
  }

  return session;
}

export async function requireAdmin(cookies: AstroCookies): Promise<AdminSession | null> {
  const session = await getSession(cookies);
  if (!session || (session.role !== "admin" && session.role !== "photographer")) {
    return null;
  }
  return session;
}
