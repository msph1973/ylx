import { defineMiddleware } from "astro:middleware";
import { CONTENT_SECURITY_POLICY, STRICT_TRANSPORT_SECURITY } from "./lib/securityHeaders";

const CSRF_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

export function hasValidCsrfOrigin(request: Request, requestUrl: string): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Same-origin requests carry the Origin header on cross-site submissions
  // but same-site navigations may omit it while including Referer. Every
  // caller of these protected routes (admin dashboard, gallery PIN/selection/
  // submit flow) is a real browser context, and a real browser always sends
  // at least one of Origin or Referer on a same-origin or cross-origin
  // fetch/form-post. When both are absent, fail closed: while a legitimate
  // browser normally provides at least one header, we reject headerless
  // requests as a defense-in-depth measure.
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

  return false;
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
