/**
 * Create the FIRST superadmin account (fresh installs only).
 *
 * Problem it solves: /api/auth/create-admin requires an existing superadmin,
 * so a brand-new dataset can never bootstrap itself through the app.
 * This script fills that gap exactly once — it REFUSES to run when any
 * admin document already exists.
 *
 * Env: PUBLIC_SANITY_PROJECT_ID (or SANITY_PROJECT_ID),
 *      PUBLIC_SANITY_DATASET (or SANITY_DATASET, default "production"),
 *      SANITY_API_TOKEN
 * Usage: node scripts/seed-superadmin.mjs --email you@studio.com --name "Your Name" --password 'long-secret-here'
 *        (min 8 chars; the value never leaves this machine except into Sanity's bcrypt hash)
 */

import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@sanity/client";

const projectId = process.env.SANITY_PROJECT_ID || process.env.PUBLIC_SANITY_PROJECT_ID;
// Explicit SANITY_DATASET wins so the script can be exercised against the
// `test` dataset without touching production env files.
const dataset = process.env.SANITY_DATASET || process.env.PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error("❌ A Sanity project ID and SANITY_API_TOKEN are required (PUBLIC_SANITY_* or SANITY_* env vars)");
  process.exit(1);
}

// Accepts both `--key value` and `--key=value`.
const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  const eq = /^--([^=]+)=(.*)$/.exec(rawArgs[i]);
  if (eq) {
    args[eq[1]] = eq[2];
  } else if (rawArgs[i].startsWith("--") && i + 1 < rawArgs.length) {
    args[rawArgs[i].slice(2)] = rawArgs[i + 1];
    i++;
  }
}

const email = (args.email ?? "").trim().toLowerCase();
const name = (args.name ?? "").trim();
const password = args.password ?? "";

// Mirrors isValidInviteEmail (@ylx/shared): plain node cannot resolve the
// workspace TS sources, so the linear check is duplicated here instead of
// imported. Keep in sync if the shared version changes.
const atSign = email.indexOf("@");
const emailOk =
  email.length > 0 &&
  email.length <= 254 &&
  ![...email].some((c) => c <= " " || c === "\u007f") &&
  atSign > 0 &&
  atSign === email.lastIndexOf("@") &&
  email.slice(atSign + 1).includes(".") &&
  !email.slice(atSign + 1).startsWith(".") &&
  !email.slice(atSign + 1).endsWith(".");
if (!emailOk) {
  console.error("❌ --email must be a valid address");
  process.exit(1);
}
if (name.length === 0 || [...name].length > 80) {
  console.error("❌ --name must be 1-80 characters");
  process.exit(1);
}
if ([...password].length < 8) {
  console.error("❌ --password must be at least 8 characters");
  process.exit(1);
}

const client = createClient({ projectId, dataset, apiVersion: "2024-01-01", token, useCdn: false });

// Fresh-install only: if any admin exists, there is already someone who can
// invite via the app — creating another superadmin here would bypass that.
const existing = await client.fetch(`count(*[_type == "admin"])`);
if (existing > 0) {
  console.error(`❌ Refusing: ${existing} admin doc(s) already exist in ${projectId}/${dataset} — invite via the app instead`);
  process.exit(1);
}

const hashedPassword = await bcrypt.hash(password, 12);
const result = await client.create({
  _id: `admin.${createHash("sha256").update(email).digest("hex")}`,
  _type: "admin",
  email,
  name,
  role: "superadmin",
  password: hashedPassword,
  profileComplete: true,
  sessionVersion: 0,
});

console.log(`✓ Seeded superadmin ${result.email} in ${projectId}/${dataset} — sign in with email + password`);
