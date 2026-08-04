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
// Astro/JSX components are PascalCase by convention; lowercase tags are plain
// HTML elements and never take `client:*` directives.
const TAG_START_RE = /<[A-Z][\w.]*/g;

const files = [];
for await (const entry of glob("src/**/*.astro", { cwd: new URL("..", import.meta.url) })) {
  files.push(entry);
}

let failed = false;

// Counts consecutive backslashes immediately before `index` and reports
// whether the character at `index` is escaped (odd count) or not (even
// count, including zero). A single `\` escapes the following character
// (quote stays open), but `\\` is itself an escaped backslash so the
// following character (e.g. a closing quote) is NOT escaped — checking only
// the single preceding character gets this wrong for runs of backslashes.
function isEscaped(content, index) {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && content[i] === "\\") {
    backslashes++;
    i--;
  }
  return backslashes % 2 === 1;
}

// Accumulates source text from a `<ComponentName` start (the index of its
// `<`) up to its matching `/>` or `>` close, tracking `{...}` prop-expression
// nesting and quoted strings so a `>` used inside an expression (e.g.
// `data={x > 2}`) isn't mistaken for the end of the tag. This lets the
// client-directive and sensitive-prop regexes both run against the *whole*
// opening tag even when it spans multiple lines (directive on one line, a
// sensitive prop on another) instead of only a single source line.
function extractTag(content, startIndex) {
  let braceDepth = 0;
  let quote = null;
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    if (quote) {
      if (char === quote && !isEscaped(content, i)) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      braceDepth++;
    } else if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (char === ">" && braceDepth === 0) {
      return content.slice(startIndex, i + 1);
    }
  }
  return content.slice(startIndex);
}

for (const file of files) {
  const fullPath = new URL(`../${file}`, import.meta.url);
  const content = readFileSync(fullPath, "utf-8");

  for (const match of content.matchAll(TAG_START_RE)) {
    const tag = extractTag(content, match.index);
    if (!CLIENT_DIRECTIVE_RE.test(tag)) continue;
    if (SENSITIVE_PROP_RE.test(tag)) {
      failed = true;
      const line = content.slice(0, match.index).split("\n").length;
      console.error(
        `[hydration-leak] ${file}:${line} — hydrated component appears to receive a sensitive prop:\n  ${tag.trim().replace(/\s+/g, " ")}`
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
