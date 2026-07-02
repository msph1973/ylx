import crypto from "node:crypto";
import type { AstroCookies } from "astro";

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: string;
  expiresAt: number;
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

function hmac(payload: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

// Sign a session as `<base64url(json)>.<hmac>` so the payload cannot be forged.
export function signSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function getSession(cookies: AstroCookies): AdminSession | null {
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

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AdminSession;
    if (session.expiresAt < Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function requireAdmin(cookies: AstroCookies): AdminSession | null {
  const session = getSession(cookies);
  if (!session || (session.role !== "admin" && session.role !== "photographer")) {
    return null;
  }
  return session;
}
