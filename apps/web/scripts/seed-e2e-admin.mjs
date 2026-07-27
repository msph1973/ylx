/**
 * Seed the `playwright-admin` doc that e2e specs need to pass the
 * sessionVersion revocation check in getSession() (src/lib/auth.ts).
 *
 * Idempotent (createOrReplace). Intended for the `test` dataset only —
 * refuses to run against `production` as a safety net.
 *
 * Env: PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET, SANITY_API_TOKEN
 * Usage: node scripts/seed-e2e-admin.mjs
 */

import { createClient } from "@sanity/client";

const projectId = process.env.PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID;
const dataset = process.env.PUBLIC_SANITY_DATASET || process.env.SANITY_DATASET;
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !dataset || !token) {
  console.error("❌ A Sanity project ID, dataset, and SANITY_API_TOKEN are required (PUBLIC_SANITY_* or SANITY_* env vars)");
  process.exit(1);
}

// Allowlist the dedicated e2e dataset rather than only denying production, so
// a misconfigured staging/other dataset can't be overwritten with fixtures.
if (dataset !== "test") {
  console.error(`❌ Refusing to seed e2e fixtures into the "${dataset}" dataset; expected "test"`);
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
});

const result = await client.createOrReplace({
  _id: "playwright-admin",
  _type: "admin",
  email: "admin@ylx.test",
  name: "Playwright Admin",
  role: "admin",
  // Dummy hash — e2e never logs in via password; the cookie is signed
  // directly by tests/helpers/adminSession.ts.
  password: "$2a$12$playwright.e2e.dummy.hash.not.a.real.credentialXXXXXXX",
  sessionVersion: 0,
});

console.log(`✓ Seeded e2e admin ${result._id} in ${projectId}/${dataset}`);
