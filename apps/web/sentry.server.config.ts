// Auto-detected by @sentry/astro at its default location
// (`<projectRoot>/sentry.server.config.ts`) — see sentry.client.config.ts for
// why the `if (dsn)` guard is here even though registration is already gated
// in astro.config.mjs.
import * as Sentry from "@sentry/astro";

const dsn = import.meta.env.PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Vercel injects VERCEL_ENV ("production" | "preview" | "development")
    // at runtime for serverless functions — lets errors from a preview
    // deployment be told apart from production ones in the Sentry UI.
    environment: process.env.VERCEL_ENV ?? "development",
    enableLogs: true,
    tracesSampleRate: 0.1,
  });
}
