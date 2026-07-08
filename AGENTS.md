# AGENTS.md

## Project

Full-Stack Photo Proofing Gallery Platform for wedding photographers. Clients select photos from albums via PIN-locked galleries; photographer exports selected filenames for Lightroom.

## First — Read STATUS.md

`STATUS.md` is the single source of truth for current project state. Read it before making any changes.

## Session Protocol (keep context across sessions)

Junie's in-session history is compressed by the harness and cross-session memory is easy to lose, so keep a durable external record — do not rely on the context window.

- **Session start:** read `STATUS.md` first, then the newest entry in `~/.junie/memory/notes.md`. If `~/.junie/memory/checkpoint.md` conflicts with `STATUS.md`, trust `STATUS.md` (checkpoint can be stale).
- **Session end (every task that changes the project or its state):** append one dated entry `## [YYYY-MM-DDTHH:MMZ] <task>` to `~/.junie/memory/notes.md` (what changed, PR/commit, key decisions) and sync `STATUS.md`.
- **Never write raw secrets** (tokens, PATs, passwords, bypass secrets) into any memory/doc file — reference the env var or CLI that holds them instead.

## Architecture (Actual, not original spec)

- **Frontend:** Astro 6 (island architecture) + React 18 interactive components via `client:load`
- **CMS + DB:** Sanity v4 — all data stored here; **no Prisma**
- **Auth:** Email + bcrypt (12 rounds) — single admin, not OAuth
- **Realtime:** Ably — `publishAdminEvent()` server-side, `useRealtime`/`useAdminRealtime` client-side
- **Deployment:** Vercel Serverless (`@astrojs/vercel` v10), Node 22, `rootDirectory: apps/web`
- **Monorepo:** Turborepo + pnpm workspaces
- **Mastra:** Removed entirely — package and the `api/admin/workflow.ts` stub are both deleted

## Key Concepts

1. **Album lifecycle:** Created (PIN, max selections, client name) → Shared via link → Client selects → Locked on submit → Admin can unlock (clears old selections) → Client resubmits
2. **Gallery route:** `/gallery/[album-slug]` — PIN validated server-side at `api/gallery/[slug]/verify.ts`
3. **Lightroom export:** Admin copies original filenames (comma-separated) from `CopyFilenamesButton`
4. **Slug:** Auto-generated from album title via `src/lib/slug.ts`; collision-safe with timestamp suffix

## Before Building

- Read `STATUS.md` first — stack, file map, env vars, known stubs
- Read `REVIEW.md` — lessons from 2 audit cycles, quick red flags, auto-reject criteria
- Check Astro docs for `client:load` island patterns
- Check Sanity docs for GROQ query syntax (note: subqueries use `^._id`)
- Run `pnpm exec tsc --noEmit` and `pnpm exec eslint src --max-warnings 0` before every commit

## Skills — Always Use the Relevant One

Before starting any task, scan the available Agent Skills and use **every** skill that matches the task's domain (open its doc first). Skipping a matching skill is not allowed unless the user says otherwise. Common matches in this repo: `astro` (framework), `sanity-best-practices` / `sanity-migration` / `content-modeling-best-practices` (CMS + GROQ), `impeccable` (UI/UX audit + fix), `compose:*` (`plan` / `tdd` / `subagent` / `review` / `verify`), `kernel-*` + `debug-browser-session` (browser E2E).

## Token Efficiency (mandatory)

Always minimize token usage with these installed tools:

- **caveman** (`caveman.so/docs`, skill `~/.junie/skills/caveman`): default answer/summary style — ultra-compressed (~75% fewer tokens) while keeping full technical accuracy. Sub-skills: `caveman-review` (PR feedback), `caveman-compress` (shrink memory files).
- **ponytail** (skill `~/.junie/skills/ponytail`): write the minimal YAGNI-first code; `ponytail-review` / `ponytail-audit` hunt over-engineering to delete.
- **RTK** — Rust Token Killer (`rtk`, installed at `~/.local/bin/rtk`): wrap the noisy shell commands you run so their output is filtered/compressed (~60–90% fewer tokens) before entering context. Route the verification pipeline and git/gh through it: `rtk pnpm ...`, `rtk tsc`, `rtk lint`, `rtk vitest`, `rtk playwright`, `rtk git diff`, `rtk gh`, `rtk read <file>`. (This complements — does not replace — Junie's dedicated search tools.)

## Non-Negotiable Code Rules

- TypeScript strict, no `any`
- All admin API routes must call `requireAdmin(cookies)` at the top
- `publishAdminEvent()` after every state-changing gallery action (submit, unlock)
- `useCopyToClipboard` hook for all clipboard interactions (handles cleanup + feedback state)
- `generateUniqueSlug()` from `src/lib/slug.ts` for all slug creation/update
