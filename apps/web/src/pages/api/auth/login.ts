import type { APIRoute } from "astro";
import { validateAdminPassword } from "@ylx/sanity/lib/admin";
import { signSession } from "../../../lib/auth";
import {
  isRateLimited,
  isLimitReached,
  recordFailedAttempt,
  RATE_LIMIT_RETRY_AFTER,
} from "../../../lib/ratelimit";

const MAX_ATTEMPTS_PER_IP = 10;
const MAX_FAILED_PER_EMAIL = 20;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limiting: per-IP (10 attempts / 15 min) + global per-email (20 failed
    // attempts / 15 min). Mirrors the gallery PIN limiter pattern from verify.ts.
    // Uses `clientAddress` (platform socket peer, not a client-supplied header).
    if (!clientAddress && import.meta.env.PROD) {
      return new Response(
        JSON.stringify({ error: "Unable to resolve client address" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const ip = clientAddress ?? "unknown";
    const emailKey = `login:${String(email).toLowerCase()}`;

    const [ipLimited, emailLimited] = await Promise.all([
      isRateLimited(`login-ip:${ip}`, MAX_ATTEMPTS_PER_IP),
      isLimitReached(emailKey, MAX_FAILED_PER_EMAIL),
    ]);

    if (ipLimited || emailLimited) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": RATE_LIMIT_RETRY_AFTER,
          },
        }
      );
    }

    // Validate credentials — use a single generic error to prevent username enumeration
    const validated = await validateAdminPassword(email, password);

    if (!validated) {
      await recordFailedAttempt(emailKey);
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = signSession({
      id: validated._id,
      email: validated.email,
      name: validated.name,
      role: validated.role,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      sessionVersion: validated.sessionVersion ?? 0,
    });

    cookies.set("admin_session", session, {
      path: "/",
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
    });

    return new Response(
      JSON.stringify({ success: true, admin: { name: validated.name, email: validated.email, role: validated.role } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Login] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
