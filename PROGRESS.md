# YLx — Progress & History
> Last updated: 2026-07-02 | Branch: `master` (all PRs merged)

For current state, see `STATUS.md`. This file records history of what was fixed and when.

---

## All Merged PRs

### PR #1 — `fix/gallery-core` (P0 Blocking)
- `selectionIds → photoIds` submit mismatch fixed (gallery submit always failed)
- Field `slug` added to Sanity album schema (gallery routes always 404'd)
- `thumbnailUrl` + `url` generated via `urlFor()` in `verify.ts` (photos never showed)

### PR #2 — `fix/security`
- `requireAdmin()` on unlock, create-admin, albums GET endpoints
- Session cookie `secure: import.meta.env.PROD`
- Single generic login error message (prevent username enumeration)
- Rate limiter 5 req/15 min per IP+slug on `verify.ts`

### PR #3 — `fix/bugs-p1`
- `useCallback` on `AlbumList.fetchAlbums` (fix infinite Ably resubscription)
- `album.eventDate` fix in AlbumDetail (was reading undefined `createdAt`)
- `publishAdminEvent('submission:received')` after `transaction.commit()`

### PR #4 — `fix/p2-polish`
- GROQ `^.` → `^._id` in `albumWithSelectionsQuery`
- PIN added to `allAlbumsQuery` so AlbumCard can display it
- `getAblyClient()` SSR-safe via `Ably.Rest`
- `isLocked` field added to album detail API response

### PR #5 — `feat/album-crud`
- Create / Edit / Delete album via admin UI
- `AlbumFormModal.tsx` — shared form, framer-motion, focus trap, Esc key handler
- Date picker with `min` attribute + timezone-aware validation (no past dates)
- Slug collision detection, 404 on missing album before PATCH
- PIN validation via `Rule.custom()` (not `Rule.regex()` — Studio message issue)
- Bot review fixes: `maxSelections` raw string while typing, backdrop block during submit

### PR #6 — `qoder-setup-actions` (Qoder CI workflow)
- Added Qoder code review bot to CI

### PR #7 — `feat/ux-fixes`
- Upload page: `useEffect(() => fetchAlbums(), [fetchAlbums])` — albums auto-load on mount
- AlbumDetail: "Copy Gallery Link" + "Copy PIN" buttons with 2s feedback state
- Homepage: "Access Your Gallery" form with slug normalization + redirect
- `PhotoLightbox.tsx` (new): fullscreen overlay, keyboard nav (←/→/Esc), select from inside
- `GalleryPage.tsx`: click photo = open lightbox; `useRealtime` with `onAlbumUnlocked` toast
- `unlock.ts`: delete existing selections + submissions before reactivating (allows re-submit)
- Toast copy updated to "please reselect and resubmit your photos"

### PR #8 — `fix/ponytail-cleanup`
- Delete `packages/mastra/` (zero imports in apps/web)
- Delete dead code: `formatPin`, `truncateFilename`, `formatFilenames`
- Delete `packages/sanity/lib/image.ts` (unused wrappers)
- Simplify `packages/shared/index.ts` to direct type imports
- Extract `src/lib/slug.ts` — `generateUniqueSlug()` shared by POST & PUT
- Extract `src/hooks/useCopyToClipboard.ts` — cleanup on unmount, typed correctly
- Remove `./lib/image` stale export from `packages/sanity/package.json`
- Security: remove hardcoded admin credentials from plan doc

### Security Audit 2026-07-02 (PR #9–#12)
- **PR #9 `fix/session-hmac` (C1):** admin session cookie now signed `base64url(json).hmacSHA256` via `SESSION_SECRET` + timing-safe verify in `getSession()`; forged `{"role":"admin"}` cookies rejected (auth-bypass closed). `signSession()` fails fast if secret missing.
- **PR #10 `fix/submit-hardening` (H3+M1):** `submit.ts` verifies every `photoId` belongs to the album + dedupes; deterministic `submission-<albumId>` `_id` acts as atomic lock (concurrent double-submit → 409); realtime publish wrapped in try/catch so it can't turn a committed submit into a 500. `selections.ts` GET now `requireAdmin`.
- **PR #11 `fix/ably-token-auth` (C2):** new `/api/ably/token` mints short-lived subscribe-only tokens (`album:*` for everyone, `admin:updates` only for authenticated admins); browser uses `authUrl` so the publish-capable key never ships client-side; `publishAdminEvent` uses server-only `ABLY_API_KEY`.
- **PR #12 `fix/sanity-private` (C3):** read client authenticates with `SANITY_API_TOKEN` + warns if missing. **Dataset `production` flipped `public → private`** via Management API — anonymous Sanity queries no longer leak PINs/album data (verified: anon read → `null`; app-token read + gallery PIN flow still work).

### Backlog Audit 2026-07-02 (PR #14–#16)
- **PR #14 `chore/astro5-upgrade` (H2, L4):** Astro `4.16.19` → `5.18.2` (closes astro/glob/tar/vite XSS advisories — `4.16.19` was the last 4.x). `@astrojs/vercel` `6.1.4` → `^8.2.11` (runtime `nodejs22.x`; the old adapter forced the now-rejected `nodejs18.x`), `@astrojs/react` `3` → `4`, adapter import `@astrojs/vercel/serverless` → `@astrojs/vercel`, root `engines.node` `>=20`, Vercel `nodeVersion` `22.x`. Removed deps unused in `apps/web`: `@astrojs/node`, `sanity`, `bcryptjs`, `@types/bcryptjs`.
- **PR #15 `chore/test-ci` (H1):** Vitest `include: src/**/*.{test,spec}` so it no longer crashes on the Playwright specs in `tests/`; added `.github/workflows/ci.yml` (install → typecheck → lint → unit test → build on Node 22 + pnpm).
- **PR #16 `fix/backlog-audit` (M2/M4/L1/L2/L3):** rate limiter extracted to `src/lib/ratelimit.ts` — **Upstash Redis (REST) persistence** when `UPSTASH_REDIS_REST_URL`/`TOKEN` set (verified live: 6th attempt → 429, key persists in Upstash with ~15min TTL), in-memory fallback otherwise. `create-admin` stays **unconditionally** `requireAdmin` (REVIEW.md §2.1) with PII logging removed; first admin seeded via CLI `seed-admin.mjs`. Deleted `api/admin/workflow.ts` stub (L1). `albums.ts` logs errors before generic 500 (L2). Removed stale docs `ini.md` + `AUDIT-2026-06-24.md`, reconciled STATUS/AGENTS/REVIEW (L3).

---

## Post-merge Hot Fixes (on master)

- **Sanity schema deploy:** `packages/sanity` upgraded to v4 — added `react`/`react-dom` as devDependencies to fix Vite Rollup "cannot resolve react" error during `sanity deploy`
- **`useCdn: false`** on Sanity client (was `true`) — prevented new albums from appearing
- **`order(_createdAt desc)`** fix (was `createdAt`) — Sanity system fields use `_` prefix
- **`setAlbum(data.album)`** fix in GalleryPage (was `setAlbum(data)`) — API shape mismatch

---

## Bot Review Policy (learned from PRs)

Verify every bot claim against actual code before implementing. Common false positives:

| Bot | False Positive Pattern |
|-----|----------------------|
| Sourcery | `\d{4}` in HTML pattern (valid regex, JS validation is the real guard) |
| Qoder | "field always undefined" when data is fetched from a different API shape |
| Any | Flagging abstractions as missing when YAGNI applies |

---

## Security Checklist

| Item | Status |
|------|--------|
| bcrypt 12 rounds | ✅ |
| Session cookie `secure: PROD` | ✅ |
| `requireAdmin()` all admin endpoints | ✅ |
| Username enumeration prevented | ✅ |
| PIN rate limiter 5×/15min/IP | ✅ |
| `.git` / `.env` web exposure | ✅ Blocked |
| Hardcoded credentials in repo | ✅ None |
| `create-admin` endpoint protected | ✅ |
| Admin session cookie HMAC-signed (C1) | ✅ |
| Ably token auth — publish key not in browser (C2) | ✅ |
| Sanity dataset **private** — no anon PIN leak (C3) | ✅ |
| Submit verifies photo ownership + atomic lock (H3/M1) | ✅ |

---

## Reference Files

| File | Content |
|------|---------|
| `STATUS.md` | **Current state** — read this first |
| `AGENTS.md` | Architecture + rules for AI agents |
| `REVIEW.md` | Code review checklist, auto-reject criteria |
| `DESIGN.md` | Design system tokens + guidelines |
| `PRODUCT.md` | Product requirements |
