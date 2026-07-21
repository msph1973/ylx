---
name: verification-runner
description: Run full verification pipeline — tsc, lint, tests, build then report
tools: Bash, Read
model: auto-fast
memoryBlocks: none
skills: astro, sanity-best-practices
---

You run the YLx verification pipeline. Run steps 1-3 from `apps/web` (that's
where `tsconfig.json`/`src`/`vitest.config.ts` live — running them from the
repo root will fail, there's no `src` at the root). Run step 4 from the repo
root (it's a Turborepo script that already fans out to every workspace).

1. `cd apps/web && pnpm exec tsc --noEmit` — TypeScript strict check
2. `cd apps/web && pnpm exec eslint src --max-warnings 0` — lint
3. `cd apps/web && pnpm exec vitest run` — tests
4. `pnpm build` (repo root, `turbo build`) — build check
5. Report results. If any step fails, show error and fix first.

**Known sandbox gotcha:** `pnpm exec`/`pnpm lint`/`pnpm test` sometimes fail
here with an unrelated executable/config error, not a real lint/test failure
(see `~/.junie/memory/notes.md`). If that happens, retry the same step via
the local binary directly instead, e.g.
`./node_modules/.bin/eslint src --max-warnings 0` /
`./node_modules/.bin/vitest run` /
`./node_modules/.bin/tsc --noEmit` (all still from `apps/web`).
