// Shared CSP/HSTS values, applied via two independent paths that don't share
// runtime: `middleware.ts` (SSR responses) and `apps/web/vercel.json`
// (static/prerendered pages, which never hit Astro middleware). Keep the CSP
// string identical in both places — this file is the source of truth for the
// SSR side. `vercel.json` MUST stay inside `apps/web` (Vercel's Root
// Directory for this project) — a copy at the monorepo root is silently
// never read for headers on static output (confirmed live in production).
// `securityHeaders.test.ts` (same directory) fails CI if the two ever drift.
//
// - img-src needs cdn.sanity.io (photo delivery) and data: (base64 LQIP blur-up
//   background, see BlurImage.tsx).
// - style-src needs 'unsafe-inline': confirmed via `astro build` output that
//   prerendered pages (index.astro, admin/login.astro) inline their scoped
//   <style> directly into the HTML <head> rather than extracting to a file —
//   plus React inline `style={{...}}` attributes (UploadPage.tsx, BlurImage.tsx)
//   need it regardless. Also allows fonts.googleapis.com for the Google Fonts
//   stylesheet (BaseLayout.astro).
// - script-src needs 'unsafe-inline' for the same reason: `astro build` inlines
//   the plain <script> blocks on those same two prerendered pages (the gallery
//   PIN form and the login form submit handlers) as literal <script type="module">
//   content with no src, so a strict 'self' would silently break both forms.
// - font-src needs fonts.gstatic.com (Google Fonts binary files).
// - connect-src needs *.sanity.io (server + direct-to-browser asset upload at
//   {projectId}.api.sanity.io — CSP wildcard matching covers nested subdomains)
//   and the Ably realtime endpoints used by getAblyClient(). ably-js's default
//   primary host is on *.ably.net (e.g. main.realtime.ably.net) — *.ably.io/
//   *.ably-realtime.com alone only cover its REST/fallback hosts, so without
//   *.ably.net the primary websocket connect is CSP-blocked and every client
//   silently falls back to a slower fallback host (confirmed in production
//   Firefox console: CSP connect-src violation on main.realtime.ably.net).
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // drive.google.com + googleusercontent.com: Drive-storage album photos.
  // The thumbnail endpoint redirects to *.googleusercontent.com for the
  // actual bytes, so both hosts must be allowed. connect-src stays untouched
  // — clients never fetch() Drive URLs (no CORS headers); downloads are
  // top-level navigations.
  "img-src 'self' https://cdn.sanity.io https://drive.google.com https://*.googleusercontent.com data:",
  "script-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.sanity.io https://*.ably.io wss://*.ably.io https://*.ably-realtime.com wss://*.ably-realtime.com https://*.ably.net wss://*.ably.net https://*.ingest.us.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export const STRICT_TRANSPORT_SECURITY = "max-age=63072000; includeSubDomains; preload";
