#!/usr/bin/env node
// Guards against L-2 (new-audit.md): Astro serializes every `client:*` prop as
// inline JSON in the page HTML. Passing sensitive data (PIN, tokens, secrets,
// raw Sanity ids/session payloads) as a prop to a hydrated island would leak
// it straight into page source, readable by anyone before any auth check
// runs client-side. This script fails CI if a hydrated component's props
// look sensitive, instead of relying on reviewers to catch it by hand.
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";

const SENSITIVE_PROP_RE =
  /\b(pin|token|secret|password|credential|apiKey|api_key|privateKey|sessionSecret|hmac)\s*=/i;
const CLIENT_DIRECTIVE_RE = /client:(load|idle|visible|only|media)/;

const files = [];
for await (const entry of glob("src/**/*.astro", { cwd: new URL("..", import.meta.url) })) {
  files.push(entry);
}

let failed = false;

for (const file of files) {
  const fullPath = new URL(`../${file}`, import.meta.url);
  const content = readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!CLIENT_DIRECTIVE_RE.test(line)) continue;
    if (SENSITIVE_PROP_RE.test(line)) {
      failed = true;
      console.error(
        `[hydration-leak] ${file}:${i + 1} — hydrated component appears to receive a sensitive prop:\n  ${line.trim()}`
      );
    }
  }
}

if (failed) {
  console.error(
    "\nA `client:*` prop looks sensitive (PIN/token/secret/credential/...). " +
      "Astro serializes these props to inline JSON in the HTML response, " +
      "readable before any client-side auth check runs. Fetch sensitive data " +
      "from an authenticated API route on the client instead. See new-audit.md L-2."
  );
  process.exit(1);
}

console.log(`[hydration-leak] OK — checked ${files.length} .astro file(s), no sensitive client:* props found.`);
