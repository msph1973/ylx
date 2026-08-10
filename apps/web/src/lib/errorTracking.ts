// Thin wrapper around @sentry/astro's server-side capture API.
//
// Sentry is opt-in (see astro.config.mjs): it's only registered when
// PUBLIC_SENTRY_DSN is set. When it isn't (local dev, most preview branches),
// `Sentry.captureException` is still safe to call — the SDK no-ops instead of
// throwing — so call sites don't need to branch on whether Sentry is active.
//
// Call this alongside (not instead of) the existing `console.error` in a
// catch block, so error data still shows up in Vercel logs even if Sentry
// itself is ever misconfigured.
import * as Sentry from "@sentry/astro";

/** Reports a caught error to Sentry with optional extra context (e.g. which
 *  route/albumId/photoId was involved), for errors that are already handled
 *  (logged + a clean error response returned) and therefore wouldn't
 *  otherwise be captured by Sentry's automatic unhandled-exception tracking. */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
