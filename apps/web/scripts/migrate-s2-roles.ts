/**
 * One-shot S2 role migration: `admin` -> `superadmin`, `photographer` -> `vendor`.
 *
 * Run ONCE manually before deploying S2 (code no longer recognizes the legacy
 * values — getSession rejects them, so any unmigrated doc locks that admin out
 * until this script runs). NEVER auto-run at build or boot.
 *
 * Env: PUBLIC_SANITY_PROJECT_ID (or SANITY_PROJECT_ID),
 *      PUBLIC_SANITY_DATASET (or SANITY_DATASET, default "production"),
 *      SANITY_API_TOKEN (write token)
 * Usage: node scripts/migrate-s2-roles.ts [--dry-run]
 */

import { createClient } from "@sanity/client";

const LEGACY_TO_S2: Record<string, string> = {
  admin: "superadmin",
  photographer: "vendor",
};

interface LegacyAdminDoc {
  _id: string;
  role: string;
  email?: string;
}

const projectId = process.env.PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID;
const dataset = process.env.PUBLIC_SANITY_DATASET || process.env.SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;
const dryRun = process.argv.includes("--dry-run");

if (!projectId || !token) {
  console.error(
    "A Sanity project ID and SANITY_API_TOKEN are required (PUBLIC_SANITY_PROJECT_ID or SANITY_PROJECT_ID env vars)"
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
});

const docs = await client.fetch<LegacyAdminDoc[]>(
  `*[_type == "admin" && role in ["admin", "photographer"]]{ _id, role, email }`
);

if (docs.length === 0) {
  console.log(`No legacy roles found in ${projectId}/${dataset} — nothing to do.`);
  process.exit(0);
}

for (const doc of docs) {
  console.log(
    `${dryRun ? "[dry-run] would migrate" : "migrating"} ${doc._id} (${doc.email ?? "no email"}): ${doc.role} -> ${LEGACY_TO_S2[doc.role]}`
  );
}

if (dryRun) {
  console.log(`Dry run: ${docs.length} doc(s) would be patched. Re-run without --dry-run to apply.`);
  process.exit(0);
}

const tx = docs.reduce(
  (t, doc) => t.patch(doc._id, { set: { role: LEGACY_TO_S2[doc.role] } }),
  client.transaction()
);
await tx.commit();

console.log(`Migrated ${docs.length} admin doc(s) in ${projectId}/${dataset}.`);
