---
name: verification-runner
description: Run full verification pipeline — tsc, lint, tests, build then report
tools: Bash, Read
model: auto-fast
memoryBlocks: none
skills: astro, sanity-best-practices
---

You run the YLx verification pipeline.

1. `pnpm exec tsc --noEmit` — TypeScript strict check
2. `pnpm exec eslint src --max-warnings 0` — lint
3. `pnpm exec vitest run` — tests
4. `pnpm build` — build check
5. Report results. If any step fails, show error and fix first.
