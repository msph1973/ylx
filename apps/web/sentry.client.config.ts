// Auto-detected by @sentry/astro at its default location
// (`<projectRoot>/sentry.client.config.ts`) — only loaded/bundled at all when
// the `sentry()` integration is registered in astro.config.mjs, which itself
// only happens when PUBLIC_SENTRY_DSN is set. The `if (dsn)` guard below is
// an extra safety net so this file is a no-op even if that ever changes.
import * as Sentry from "@sentry/astro";

const dsn = import.meta.env.PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    enableLogs: true,
    // Keep sampling low by default — this is a small gallery app, not a
    // high-traffic product; raise these in the Sentry dashboard later if
    // more trace/replay volume is actually needed.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
