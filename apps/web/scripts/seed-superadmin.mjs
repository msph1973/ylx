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
 * Usage: node scripts/seed-superadmin.mjs --email you@studio.com --name "Your Name"
 *        (password comes from a hidden interactive prompt — never argv, so it
 *        stays out of shell history and process listings; or --password-file
 *        <path> for automation with a 0600 file)
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
// Password arrives via hidden prompt (default) or --password-file, never
// argv. It is cleared right after hashing.
let password = "";
if (args["password-file"] !== undefined) {
  if (typeof args["password-file"] !== "string" || args["password-file"].length === 0) {
    console.error("❌ --password-file needs a file path");
    process.exit(1);
  }
  try {
    password = (await readFile(args["password-file"], "utf8")).replace(/\s+$/, "");
  } catch {
    console.error(`❌ Cannot read password file ${args["password-file"]} — check the path and permissions`);
    process.exit(1);
  }
} else {
  if (!process.stdin.isTTY) {
    console.error("❌ No --password-file and no interactive terminal — password prompt needs a TTY");
    process.exit(1);
  }
  // No readline interface: in terminal mode readline re-renders the line
  // buffer (echoing the secret). Raw stdin + manual per-character scan
  // handles pasted multi-char chunks too (paste arrives as one data event).
  password = await new Promise((resolve) => {
    const stdin = process.stdin;
    try {
      if (typeof stdin.setRawMode === "function") stdin.setRawMode(false);
    } catch { /* leave echo state alone on exotic platforms */ }
    process.stdout.write("Password (min 8 chars, hidden): ");
    try {
      if (typeof stdin.setRawMode === "function") stdin.setRawMode(true);
    } catch { /* best effort; raw mode is what hides the echo */ }
    stdin.resume();
    let buf = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stdin.off("data", onData);
      try {
        if (typeof stdin.setRawMode === "function") stdin.setRawMode(false);
      } catch { /* ignore */ }
      stdin.pause();
      process.stdout.write("\n");
      resolve(buf);
    };
    const onData = (chunk) => {
      for (const s of String(chunk)) {
        if (done) return;
        if (s === "\r" || s === "\n" || s === "\u0004") {
          finish();
          return;
        } else if (s === "\u007f" || s === "\b") {
          buf = buf.slice(0, -1);
        } else {
          buf += s;
        }
      }
    };
    stdin.on("data", onData);
  });
}
if ([...password].length < 8) {
  password = "";
  console.error("❌ password must be at least 8 characters");
  process.exit(1);
}
// bcrypt silently truncates past 72 bytes — reject instead of creating two
// credentials that compare equal.
if (Buffer.byteLength(password, "utf8") > 72) {
  password = "";
  console.error("❌ password must be at most 72 bytes (bcrypt limit)");
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
password = "";

// Atomic first-admin-only: the sentinel and the admin doc are created in ONE
// transaction with deterministic IDs, so two concurrent runs cannot both
// succeed — the loser gets a 409 conflict. (The count check above is just a
// friendly fast path.)
const adminId = `admin.${createHash("sha256").update(email).digest("hex")}`;
try {
  const result = await client
    .transaction()
    .create({
      _id: "admin.bootstrap",
      _type: "bootstrap",
      createdAt: new Date().toISOString(),
      email,
    })
    .create({
      _id: adminId,
      _type: "admin",
      email,
      name,
      role: "superadmin",
      password: hashedPassword,
      profileComplete: true,
      sessionVersion: 0,
    })
    .commit();
  console.log(`✓ Seeded superadmin ${email} in ${projectId}/${dataset} — sign in with email + password`);
  void result;
} catch (err) {
  const statusCode = err?.statusCode ?? err?.response?.statusCode;
  if (statusCode === 409) {
    console.error(`❌ Already bootstrapped in ${projectId}/${dataset} — invite via the app instead`);
    process.exit(1);
  }
  throw err;
}
