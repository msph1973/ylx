import { defineMiddleware } from "astro:middleware";
import { CONTENT_SECURITY_POLICY, STRICT_TRANSPORT_SECURITY } from "./lib/securityHeaders";

// Runs on every SSR request (prerendered pages bypass this — see vercel.json
// for the equivalent headers on those routes). Only adds headers; body/status
// from `next()` pass through untouched. Never touches Cache-Control — per-route
// caching for /api/* is owned elsewhere.
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY);

  return response;
});
