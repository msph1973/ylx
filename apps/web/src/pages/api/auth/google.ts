import type { APIRoute } from "astro";
import { OAuth2Client } from "google-auth-library";
import { getAdminByEmail } from "@ylx/sanity/lib/admin";
import { signSession, type AdminRole } from "../../../lib/auth";
import {
  isRateLimited,
  isLimitReached,
  recordFailedAttempt,
  RATE_LIMIT_RETRY_AFTER,
} from "../../../lib/ratelimit";
import { captureError } from "../../../lib/errorTracking";

const MAX_ATTEMPTS_PER_IP = 10;
const MAX_FAILED_PER_EMAIL = 20;



function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function rateLimited(): Response {
  return json({ error: "Too many attempts. Please try again later." }, 429, {
    "Retry-After": RATE_LIMIT_RETRY_AFTER,
  });
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return json({ error: "Request body must be a valid JSON object" }, 400);
  }

  try {
    const { idToken } = rawBody as Record<string, unknown>;

    if (typeof idToken !== "string" || idToken.length === 0) {
      return json({ error: "ID token is required" }, 400);
    }

    // Rate limiting: per-IP (10 attempts / 15 min) + per-email (20 failed
    // attempts / 15 min), mirroring login.ts. Uses `clientAddress` (platform
    // socket peer, not a client-supplied header). The IP gate runs before
    // verification (no email is known yet); the email gate runs after.
    if (!clientAddress && import.meta.env.PROD) {
      return json({ error: "Unable to resolve client address" }, 400);
    }
    const ip = clientAddress ?? "unknown";
    if (await isRateLimited(`login-ip:${ip}`, MAX_ATTEMPTS_PER_IP)) {
      return rateLimited();
    }

    // Client ID comes from the environment only — never hardcoded — and is
    // passed as the verification audience, so `aud` mismatches fail here.
    // `iss` (accounts.google.com) and `exp` are checked inside the library.
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("[GoogleAuth] GOOGLE_CLIENT_ID is not set");
      return json({ error: "Internal server error" }, 500);
    }
    const client = new OAuth2Client(clientId);

    let email: string;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.email || payload.email_verified !== true) {
        return json({ error: "Access denied" }, 403);
      }
      email = payload.email.trim().toLowerCase();
    } catch {
      // Forged, expired, or wrong-audience token — generic 403, no detail
      // (anti-enumeration, same policy as login.ts's generic failure).
      return json({ error: "Access denied" }, 403);
    }

    const emailKey = `login:${email}`;
    if (await isLimitReached(emailKey, MAX_FAILED_PER_EMAIL)) {
      return rateLimited();
    }

    // Invite-only: the email must already have an admin doc, and the role is
    // ALWAYS taken from that doc — never from the client or the token.
    const doc = await getAdminByEmail(email);
    if (!doc || doc.disabled || (doc.role !== "vendor" && doc.role !== "superadmin")) {
      await recordFailedAttempt(emailKey);
      return json({ error: "Access denied" }, 403);
    }

    const session = signSession({
      id: doc._id,
      email: doc.email,
      name: doc.name,
      // Runtime gate above already rejected anything but vendor|superadmin,
      // so this cast cannot smuggle a forged role (role never comes from client).
      role: doc.role as AdminRole,
      ownerId: doc._id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      sessionVersion: doc.sessionVersion ?? 0,
    });

    // Cookie options copied exactly from login.ts.
    cookies.set("admin_session", session, {
      path: "/",
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
    });

    return json(
      { success: true, admin: { name: doc.name, email: doc.email, role: doc.role } },
      200
    );
  } catch (err) {
    console.error("[GoogleAuth] Error:", err);
    captureError(err, { route: "auth/google POST" });
    return json({ error: "Internal server error" }, 500);
  }
};
