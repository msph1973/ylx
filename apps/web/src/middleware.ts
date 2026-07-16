import { defineMiddleware } from "astro:middleware";
import { CONTENT_SECURITY_POLICY, STRICT_TRANSPORT_SECURITY } from "./lib/securityHeaders";

const CSRF_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function hasValidCsrfOrigin(request: Request, requestUrl: string): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Same-origin requests carry the Origin header on cross-site submissions
  // but same-site navigations may omit it while including Referer.  When both
  // are absent the request is likely a same-origin form POST from a non-browser
  // HTTP client (e.g. curl, server-to-server) — sameSite=lax already blocks
  // cross-origin cookie transmission, so allowing this path is safe.
  if (origin) {
    try {
      const u = new URL(origin);
      return u.origin === new URL(requestUrl).origin;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      const u = new URL(referer);
      return u.origin === new URL(requestUrl).origin;
    } catch {
      return false;
    }
  }

  return true;
}

function csrfForbidden(): Response {
  return new Response(JSON.stringify({ error: "CSRF validation failed" }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY,
    },
  });
}

// Runs on every SSR request (prerendered pages bypass this — see vercel.json
// for the equivalent headers on those routes). Only adds headers; body/status
// from `next()` pass through untouched. Never touches Cache-Control — per-route
// caching for /api/* is owned elsewhere.
export const onRequest = defineMiddleware(async (context, next) => {
  // CSRF defense-in-depth (M-3): sameSite=lax blocks cross-site POST at the
  // cookie layer, but this adds a server-side Origin/Referer check on top so
  // a future endpoint that mutates on GET, or a non-compliant browser, cannot
  // bypass the cookie defence.
  const path = context.url.pathname;
  const isProtectedWrite =
    CSRF_METHODS.has(context.request.method) &&
    (path.startsWith("/api/admin/") ||
      path.startsWith("/api/gallery/") ||
      path.startsWith("/api/auth/"));
  if (isProtectedWrite && !hasValidCsrfOrigin(context.request, context.url.href)) {
    return csrfForbidden();
  }

  const response = await next();

  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY);

  return response;
});
