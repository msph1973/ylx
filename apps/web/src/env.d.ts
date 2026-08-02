/// <reference path="../.astro/types.d.ts" />

// Server-side env vars this app reads via `process.env.*` (see apps/web/.env.local.example).
// Documentation-as-types only: does not add runtime validation, but catches
// typo'd env var names at compile time instead of only at runtime.
interface ImportMetaEnv {
  readonly SANITY_API_TOKEN?: string;
  readonly SESSION_SECRET?: string;
  readonly ABLY_API_KEY?: string;
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
  readonly PUBLIC_SANITY_PROJECT_ID?: string;
  readonly PUBLIC_SANITY_DATASET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}