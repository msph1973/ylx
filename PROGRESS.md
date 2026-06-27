# YLx — Progress & Status Report
> Last updated: 2026-06-27  
> Branch: `master` (all fix PRs merged; PR #7 `feat/ux-fixes` open)

---

## Platform Status

| Item | Status |
|------|--------|
| Production URL | https://ylx-msph.vercel.app |
| Sanity Studio | https://ylx-admin.sanity.studio |
| Admin login | `admin@ylex.my.id` / `klp123` |
| Vercel deployment | ✅ Live |
| TypeScript strict | ✅ 0 errors |
| ESLint | ✅ 0 warnings |

---

## Core User Flow — Current Status

```
Photographer creates album    →  ✅ AlbumFormModal.tsx (PR #5 merged)
Photographer uploads photos   →  ✅ UploadPage.tsx (useEffect fix, PR #7)
Photographer shares link      →  ✅ "Copy Gallery Link" + "Copy PIN" in AlbumDetail (PR #7)
Client opens gallery          →  ✅ Homepage gallery form (PR #7)
Client enters PIN             →  ✅ PinEntry.tsx + rate limiter
Client browses photos         →  ✅ Grid + lightbox full-preview (PR #7)
Client selects photos         →  ✅ Toggle select (from grid or inside lightbox)
Client submits                →  ✅ API + Sanity transaction + Ably
Admin sees real-time notif    →  ✅ useAdminRealtime + AlbumList
Admin views selections        →  ✅ SelectionTable + AlbumDetail
Admin copies filenames        →  ✅ CopyFilenamesButton → Lightroom
Admin unlocks if needed       →  ✅ unlock.ts + auth guard
Client sees unlock in real-time →  ✅ useRealtime + toast notification (PR #7)
```

---

## Completed Branches (merged to master)

### `fix/gallery-core` — P0 Blocking Bugs
- `selectionIds → photoIds` submit mismatch fixed
- Field `slug` added to Sanity album schema
- `thumbnailUrl` + `url` generated via `urlFor()` in verify.ts

### `fix/security` — Security
- `requireAdmin()` on unlock, create-admin, albums endpoints
- Cookie `secure: import.meta.env.PROD`
- Single generic login error (prevent username enumeration)
- Rate limiter 5 req/15 min per IP+slug on verify.ts

### `fix/bugs-p1` — P1 Bugs
- `useCallback` on `AlbumList.fetchAlbums` (fix infinite Ably resubscription)
- `album.eventDate` fix in AlbumDetail (was undefined `createdAt`)
- `publishAdminEvent('submission:received')` after `transaction.commit()`

### `fix/p2-polish` — P2 Inconsistencies
- GROQ `^.` → `^._id`, PIN added to `allAlbumsQuery`
- `getAblyClient()` SSR-safe via `Ably.Rest`

### `feat/album-crud` (PR #5, merged) — CRUD Albums
- Create / Edit / Delete album via admin UI
- `AlbumFormModal.tsx` — shared form, framer-motion, validations
- Date picker with `min` attribute + timezone-aware validation
- Slug collision detection, 404 on missing album before PATCH

---

## Open PR

### PR #7 — `feat/ux-fixes`
**Status:** Open, awaiting CI + bot review

| Fix | File | Detail |
|-----|------|--------|
| P0-C Upload mount | `UploadPage.tsx` | `useEffect(() => fetchAlbums(), [fetchAlbums])` |
| P0-A Share link | `AlbumDetail.tsx` | "Copy Gallery Link" + "Copy PIN" buttons |
| P0-B Homepage form | `index.astro` | "Access Your Gallery" form with slug input |
| P1-A Lightbox | `PhotoLightbox.tsx` (new) | Fullscreen, keyboard nav, select inside |
| P1-B Realtime unlock | `GalleryPage.tsx` | `useRealtime` + animated toast 4s |

---

## Infrastructure & Tooling

### MCP Servers (9 active)
playwright, filesystem, sequential-thinking, memory, context7, github, kernel, linear, sanity

> Vercel: use token at `~/.local/share/com.vercel.cli/auth.json` via curl

### Linear
- Team: **Ylx** | ID: `bc11a289-8943-48bc-9679-87557d86ea0e`
- API: `https://api.linear.app/graphql`

### Sanity
- Project: `741sif2l` | Dataset: `production` | Token role: `write`

---

## Security Checklist

| Item | Status |
|------|--------|
| bcrypt 12 rounds | ✅ |
| Session cookie secure | ✅ `PROD` only |
| Auth guards all admin endpoints | ✅ |
| Username enumeration prevented | ✅ |
| PIN brute-force rate limiter | ✅ |
| `.git` / `.env` web exposure | ✅ Blocked |
| Hardcoded credentials in repo | ✅ None |

---

## Known Stubs

| Item | File | Note |
|------|------|------|
| Mastra workflow | `api/admin/workflow.ts` | Returns `{ success: true }` — not actually running Mastra |
| E2E tests | `apps/web/tests/` | No Playwright tests exist yet |

---

## Reference Files

| File | Content |
|------|---------|
| `AGENTS.md` | Architecture guidelines for AI agents |
| `CONTEXT.md` | Full project context |
| `DESIGN.md` | Design system tokens + guidelines |
| `PRODUCT.md` | Product requirements |
| `REVIEW.md` | Code review checklist (lessons from 2 audit cycles) |
| `PROGRESS.md` | This file |
