# AGENTS.md

## Project

Full-Stack Photo Proofing Gallery Platform for wedding photographers. Clients select photos from albums via PIN-locked galleries; photographer exports selected filenames for Lightroom.

## First — Read STATUS.md

`STATUS.md` is the single source of truth for current project state. Read it before making any changes.

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

## Non-Negotiable Code Rules

- TypeScript strict, no `any`
- All admin API routes must call `requireAdmin(cookies)` at the top
- `publishAdminEvent()` after every state-changing gallery action (submit, unlock)
- `useCopyToClipboard` hook for all clipboard interactions (handles cleanup + feedback state)
- `generateUniqueSlug()` from `src/lib/slug.ts` for all slug creation/update
