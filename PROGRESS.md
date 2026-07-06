# YLx — Progress & History
> Last updated: 2026-07-03 | Branch: `feat/admin-dashboard-impeccable` (PR #19 OPEN — belum merge); semua PR lain sudah di `master`

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

### PR #17 — `feat/lqip-e2e` (LQIP blur-up + gallery E2E refresh)
- **LQIP (P1-C):** `albumBySlugQuery` selects `metadata.lqip`; `verify.ts` threads it per photo as `lqip`; `Photo.lqip?` added to shared type.
- **`BlurImage.tsx` (new):** wrapper `<div>` holds the Sanity LQIP base64 placeholder as `background-image` (always visible) while the inner `<img>` fades `opacity: 0 → 1` on top — fixes the bot-found bug where an `opacity:0` image also hid its own background so the blur never showed. `prefers-reduced-motion` aware, resets on `src` change. Used in grid + lightbox.
- **z-index fix:** lightbox moved from hardcoded `100` (below sticky header `--z-sticky:200`) to `--z-modal` (400); unlock toast → `--z-toast` (500).
- **Gallery E2E refresh:** `tests/gallery.spec.ts` updated to `{ album }` response shape + lightbox open/close (Escape) + select/deselect-from-lightbox flow; hydration-safe PIN helper (waits for React `__reactFiber$`/`__reactProps$`) fixes the dropped-first-digit flake. 5/5 pass via `pnpm test:e2e`.
- Bot reviews (Sourcery, Devin) addressed: `loaded` reset on `src`, `Photo` metadata fields made optional to match the verify API, blur-up wrapper visibility fix.
- `tests/admin.spec.ts` still fails (pre-existing, out of scope): needs a signed-session seed helper for the `/admin` auth guard.

---

## Open Work

### PR #19 — `feat/admin-dashboard-impeccable` (OPEN, belum merge)

Penyempurnaan admin dashboard (audit admin) di atas commit `1e49b3b`. Keputusan merge menunggu reviewer.

**Fondasi (commit `1e49b3b`):** search + filter album, bulk-delete album, manual Lock/Unlock, grid foto + hapus per-foto, status `submitted` (schema Studio sudah deploy), `ConfirmDialog` + `useFocusTrap`, helper `cascadeDeleteAlbums` / `albumStatus`.

**Perbaikan review PR #19:**
- `AlbumFormModal.tsx` — validasi future-date hanya saat `mode === 'create'`; album event lampau kini bisa diedit & disimpan (`min` juga dilepas saat edit).
- `AlbumList.tsx` / `AlbumDetail.tsx` — `setIsLoading(true)` di awal fetch; retry menampilkan spinner, bukan flash "No albums" / "Album not found".
- `SelectionTable.tsx` + tipe `Selection`/`Photo` — `thumbnailUrl` jadi field bertipe, cast longgar `as { thumbnailUrl?: string }` dibuang.

**Fitur baru:**
- **Pagination album** — client-side `PAGE_SIZE=12` atas `filteredAlbums`, kontrol Prev/Next ber-`aria-label` + summary `aria-live`, reset ke halaman 1 saat search/filter berubah; select-all beroperasi pada halaman aktif.
- **Bulk photo delete** — endpoint baru `api/admin/photos/bulk-delete.ts` (`requireAdmin`, validasi kepemilikan album, unset selection dari submission + hapus selection + unset dari `album.photos` + hapus foto dalam 1 transaksi, `publishAdminEvent('photo:deleted')`/`selection:changed` + `publishAlbumEvent`); UI mode select + select-all/clear + `ConfirmDialog` di `AlbumDetail`.
- **Reorder foto** — endpoint baru `api/admin/albums/[id]/reorder.ts` (PATCH; `requireAdmin`, validasi semua `_ref` milik album, `set` ulang `album.photos` sambil menjaga `_key`, `publishAdminEvent('album:updated')` + `publishAlbumEvent`); UI native HTML5 drag + tombol naik/turun keyboard, optimistic update + rollback lalu refetch.
- **Mobile-first pass (≤480px)** — `AlbumList`/`AlbumDetail`/`AlbumFormModal`/`SelectionTable`: toolbar wrap, modal full-height (`100dvh`), grid 1 kolom, tabel selection scrollable, target sentuh ≥44px — pakai token `variables.css`.

**Test readiness:**
- `tests/helpers/adminSession.ts` — seed cookie `admin_session` HMAC-signed (selaras `auth.ts`) untuk bypass auth-guard `/admin`.
- `tests/admin.spec.ts` — 4 test (pagination, bulk photo delete, reorder keyboard, lock/unlock); semua route API di-mock via `page.route`, jadi tidak butuh Sanity/Ably live. **4/4 pass lokal** (~14s).

**Impeccable polish pass (audit follow-up, 6 fixes):** (P1) `DESIGN.md` diselaraskan ke ramp amber ter-*ship* `#b8864e`/`#c99660`/`#9e7040` + muted `#a0a0a0`; (P2) overlay `rgba(0,0,0,…)` → token `--overlay-*` di `variables.css` (dipakai `AlbumFormModal`/`ConfirmDialog`/`GalleryPage`); (P2) target sentuh ≥44px pada `.admin-link` + kontrol lightbox; (P2) `::placeholder` eksplisit AA global di `global.css`; (P3) island admin `client:load` → `client:idle` (galeri tetap `client:load`); (P3) hover `.gallery-btn` pakai `--color-accent-hover`. `astro.config.mjs` menambah `devToolbar: { enabled: false }` (overlay dev menghalangi klik lightbox di Playwright; absen di prod). Detail: `docs/admin-dashboard-enhancements.md`.

**Devin follow-up (2 temuan, diperbaiki):** (1) respons selections di `api/admin/albums/[id]/index.ts` kini menyertakan `albumId`/`photoId` (query `selectionsByAlbumQuery` menambah `"albumId": album._ref` + `"photoId": photo._ref`) sehingga sesuai kontrak tipe bersama `Selection` — rute galeri `selections.ts` ikut selaras; (2) konvensi tiga-status didokumentasikan pada `description` field `status` di `schemas/album.ts` ("album tertutup = `status !== 'active'`, jangan hanya cek `=== 'locked'`") untuk konsumen eksternal. Catatan deploy: perubahan GROQ hanya dipakai runtime web app (tak perlu redeploy Studio); `description` skema hanya teks bantuan editor (redeploy Studio opsional, tanpa migrasi data).

**Verifikasi (fresh):** `pnpm exec tsc --noEmit` lolos, `pnpm exec eslint src --max-warnings 0` lolos, `pnpm exec vitest run` 3/3, `pnpm exec playwright test` (admin 4/4 + gallery 5/5), `pnpm build` lolos.

> Update: PR #19 & #20 **sudah di-merge ke `master`**.

### `feat/direct-sanity-upload` — Direct-to-Sanity upload (OPEN)

Migrasi upload foto dari serverless-proxy ke **direct-to-Sanity** karena Vercel Serverless membatasi body request ~4.5MB — foto full-res (>4.5MB) selalu 413 lewat `/api/admin/upload` lama.

**Arsitektur baru (2 langkah):**
1. Browser fetch kredensial dari `api/admin/upload/credentials.ts` (`requireAdmin`, token diambil runtime, `Cache-Control: no-store`, tidak di-bundle).
2. Browser upload biner **langsung** ke Sanity Asset API (`https://<projectId>.api.sanity.io/v2024-01-01/assets/images/<dataset>`) via XHR (progress nyata) → dapat `asset._id`.
3. Browser POST JSON kecil ke `api/admin/upload/finalize.ts` → server buat dokumen `photo` + `append` ke `album.photos` + `publishAdminEvent('photo:uploaded')`. Endpoint `upload.ts` lama dihapus.

**Performa & retry (requirement):**
- **Paralel berbatas** — `runWithConcurrency` upload `UPLOAD_CONCURRENCY = 3` file sekaligus. Sekuensial murni buang waktu tunggu jaringan; paralel tak terbatas banjiri bandwidth/memori & progress tak terbaca.
- **Auto-retry** — tiap file `MAX_UPLOAD_ATTEMPTS = 3` (1 + 2 retry) dengan exponential backoff (800ms→1600ms). Hanya kegagalan transient yang di-retry (`status 0`/408/429/≥500); 4xx (auth/payload/validasi) permanen → tidak di-retry.
- **Retry manual** — tombol "Retry" per-foto + tombol utama berubah "Retry N failed" saat hanya ada yang gagal; pesan error asli ditampilkan per item.
- **Refresh kredensial per-batch**; token 401 mid-batch → cache di-drop agar attempt berikutnya fetch ulang.

**Konfigurasi wajib (deploy):** `SANITY_API_TOKEN` role **Editor/write** (sudah di-set user); origin app **wajib** di Sanity **CORS origins** (manage.sanity.io → API → CORS origins), tanpa "Allow credentials".

**Perbaikan review bot (PR #21, Devin + Sourcery):**
- **Devin (dataset):** `credentials.ts` semula punya fallback `SANITY_DATASET` yang tak dikenali write client → risiko biner ter-upload ke dataset berbeda dari dokumen. Diselaraskan persis ke `PUBLIC_SANITY_DATASET || "production"` (sama seperti `packages/sanity/client.ts`).
- **Devin (orphan):** `finalize.ts` kini **verifikasi album ada** (`getDocument` + cek `_type === 'album'`) sebelum buat foto — `patch(...).append` pada dokumen hilang adalah no-op senyap yang bisa meninggalkan foto orphan.
- **Sourcery (anti-duplikat):** `uploadWithRetry` menyimpan `assetId` antar-attempt; jika upload biner sukses tapi finalize gagal, retry hanya mengulang finalize (tidak re-upload biner → tak ada aset duplikat/orphan).
- **Sourcery (kredensial):** kredensial di-*warm* sekali di awal batch → 3 worker paralel berbagi satu request, bukan masing-masing fetch.
- **Sourcery (race):** `isUploading` kini pakai counter aktivitas (`beginActivity`/`endActivity`) agar tak flip ke false saat masih ada upload berjalan.

**Verifikasi:** `tsc` lolos, `eslint` lolos, `vitest` 3/3, `playwright` **13/13** (admin 4 + gallery 5 + **upload 4**: happy path, retry transient, gagal permanen→Retry sukses, gagal kredensial), `pnpm build` lolos. Detail: `docs/direct-sanity-upload.md`.

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
