import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, STRICT_TRANSPORT_SECURITY } from "./securityHeaders";

// `apps/web/vercel.json` duplicates these values by hand for prerendered
// pages, which never run Astro's `middleware.ts`. There is no way to import
// TS into that static JSON file at deploy time, so this test is the drift
// guard: it fails CI the moment the two copies disagree.
// `vercel.json` MUST live inside `apps/web` (Vercel's configured Root
// Directory for this project — see AGENTS.md/STATUS.md), not the monorepo
// root: Vercel only reads vercel.json relative to the Root Directory, so a
// copy at the repo root is silently ignored for headers on static output
// (confirmed live: HSTS is a Vercel platform default so it still showed up,
// but CSP/X-Frame-Options/etc from a repo-root vercel.json never reached
// prerendered pages in production).
// `vitest run` (see package.json) executes with cwd = apps/web, so the file
// is one level up from this lib directory.
const vercelJsonPath = resolve(process.cwd(), "vercel.json");

interface VercelHeaderEntry {
  key: string;
  value: string;
}

interface VercelJson {
  headers?: Array<{ source: string; headers: VercelHeaderEntry[] }>;
}

function readVercelHeaderValue(key: string): string | undefined {
  const vercelJson = JSON.parse(readFileSync(vercelJsonPath, "utf-8")) as VercelJson;
  for (const block of vercelJson.headers ?? []) {
    const entry = block.headers.find((h) => h.key === key);
    if (entry) return entry.value;
  }
  return undefined;
}

describe("security headers stay in sync between middleware.ts and vercel.json", () => {
  it("Content-Security-Policy matches", () => {
    expect(readVercelHeaderValue("Content-Security-Policy")).toBe(CONTENT_SECURITY_POLICY);
  });

  it("Strict-Transport-Security matches", () => {
    expect(readVercelHeaderValue("Strict-Transport-Security")).toBe(STRICT_TRANSPORT_SECURITY);
  });
});
