/// <reference path="../.astro/types.d.ts" />

// Server-side env vars this app reads via `process.env.*` (see apps/web/.env.local.example).
// Documentation-as-types only: does not add runtime validation, but catches
// typo'd env var names at compile time instead of only at runtime.
declare namespace NodeJS {
  interface ProcessEnv {
    SANITY_API_TOKEN?: string;
    SESSION_SECRET?: string;
    ABLY_API_KEY?: string;
    UPSTASH_REDIS_REST_URL?: string;
    UPSTASH_REDIS_REST_TOKEN?: string;
    PUBLIC_SANITY_PROJECT_ID?: string;
    PUBLIC_SANITY_DATASET?: string;
  }
}