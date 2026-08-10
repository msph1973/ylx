import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import sentry from "@sentry/astro";

// Sentry is opt-in: only registered when PUBLIC_SENTRY_DSN is set (e.g. in
// Vercel Production env vars). Local dev / preview branches without a DSN
// build and run exactly as before, with no Sentry SDK loaded at all.
const sentryDsn = process.env.PUBLIC_SENTRY_DSN;

export default defineConfig({
  integrations: [
    react(),
    ...(sentryDsn
      ? [
          sentry({
            // Runtime init (dsn, integrations, sample rates, replay, logs)
            // lives entirely in sentry.client.config.ts / sentry.server.config.ts
            // — @sentry/astro auto-detects those at the project root. Passing
            // `dsn` here too is deprecated (it warns at build time) now that
            // those files exist, so this integration call is left with only
            // the source-map-upload options.
            //
            // Top-level project/org/authToken (the nested
            // `sourceMapsUploadOptions` form is deprecated). Only runs when
            // these are provided (e.g. Vercel Production build); harmless
            // no-op otherwise.
            project: process.env.SENTRY_PROJECT,
            org: process.env.SENTRY_ORG,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            telemetry: false,
          }),
        ]
      : []),
  ],
  output: "server",
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  // Dev-only overlay; it intercepts pointer events over bottom-centered UI
  // (e.g. the lightbox controls) and flakes Playwright. Absent from prod builds.
  devToolbar: { enabled: false },
  vite: {
    server: {
      allowedHosts: ["ll.ylex.my.id"],
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  },
});
