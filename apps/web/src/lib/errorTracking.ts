// Thin wrapper around @sentry/astro's server-side capture API.
//
// Sentry is opt-in (see astro.config.mjs): it's only registered when
// PUBLIC_SENTRY_DSN is set. When it isn't (local dev, most preview branches),
// call sites still don't need to branch on whether Sentry is active — but
// unlike calling `Sentry.captureException` unconditionally, this file checks
// the same env var itself first. Without that check, every `captureError`
// call would still reach the (never-initialized) SDK and log its own
// "You have to call init() before calling captureException()" console
// warning on top of the existing `console.error` at every call site — noisy
// and confusing in exactly the "Sentry disabled" state this is meant to be
// a safe no-op for.
//
// Call this alongside (not instead of) the existing `console.error` in a
// catch block, so error data still shows up in Vercel logs even if Sentry
// itself is ever misconfigured.
import * as Sentry from "@sentry/astro";

/** Reports a caught error to Sentry with optional extra context (e.g. which
 *  route/albumId/photoId was involved), for errors that are already handled
 *  (logged + a clean error response returned) and therefore wouldn't
 *  otherwise be captured by Sentry's automatic unhandled-exception tracking.
 *  No-ops (doesn't even call into the SDK) when Sentry isn't configured. */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (!import.meta.env.PUBLIC_SENTRY_DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
