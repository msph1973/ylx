# YLx — Status & AI Agent Onboarding
> Last updated: 2026-07-08 | PR MERGED ke `master`: **#19** admin dashboard + impeccable polish `4a99688`, **#20** harden PIN rate-limit `086af93`, **#21** direct-to-Sanity upload `75c62f5`, **#22** upgrade Astro 5→6 `0015cb6`, **#23** impeccable CLI + fix target sentuh `68515c0`, **#25** junie review workflow `40ddb50`. Branch aktif: **`feat/gallery-upload-improvements`** (optimasi gambar CDN + robustness upload + grid mobile-first, belum merge).

Baca file ini pertama kali sebelum file lain. Ini adalah satu-satunya sumber kebenaran tentang kondisi project saat ini.

---

## Platform

| Item | Value |
|------|-------|
| Production URL | https://ylx-msph.vercel.app |
| Sanity Studio | https://ylx-admin.sanity.studio |
| GitHub Repo | https://github.com/msph1973/ylx |
| Admin login | Lihat `.env.local` (tidak disimpan di repo) |
| Node | 22.x (Vercel) / 25.x (VPS dev) |
| Package manager | pnpm (workspace) |

---

## Stack Aktual (bukan yang di spec awal)

| Layer | Tech | Catatan |
|-------|------|---------|
| Frontend | Astro 6 + React 18 | Island architecture, `client:load` |
| CMS + DB | Sanity v4 | Semua data di Sanity, **tidak ada Prisma** |
| Auth | Email + bcrypt (12 rounds) | Bukan OAuth — admin tunggal |
| Realtime | Ably | `publishAdminEvent` di server, `useRealtime` / `useAdminRealtime` di client |
| Deploy | Vercel Serverless | `@astrojs/vercel` v10, Node 22, `rootDirectory: apps/web` |
| Monorepo | Turborepo + pnpm workspaces | `--force` flag di build command |
| Mastra | **Dihapus** | Package & endpoint `api/admin/workflow.ts` sudah dihapus (tidak dipakai) |

---

## Core User Flow — Status Lengkap

```
Photographer creates album      ✅  AlbumFormModal.tsx (CRUD: create/edit/delete)
Photographer uploads photos     ✅  UploadPage.tsx — direct-to-Sanity (lewati 4.5MB Vercel), paralel 3x + auto-retry
Photographer copies share link  ✅  AlbumDetail — "Copy Gallery Link" + "Copy PIN"
Client opens homepage           ✅  index.astro — form "Access Your Gallery" + redirect
Client enters PIN               ✅  PinEntry.tsx + rate limiter 5x/15min per IP
Client browses photos           ✅  Grid + lightbox fullscreen (PhotoLightbox.tsx), LQIP blur-up (BlurImage.tsx)
Client selects photos           ✅  Toggle dari grid atau dari dalam lightbox
Client submits selection        ✅  API + Sanity transaction + Ably event
Admin sees real-time notif      ✅  useAdminRealtime + AlbumList
Admin views selections          ✅  SelectionTable + AlbumDetail
Admin copies filenames          ✅  CopyFilenamesButton → clipboard → Lightroom
Admin unlocks gallery           ✅  unlock.ts — hapus selections lama + set active
Client sees unlock real-time    ✅  useRealtime + animated toast + state reset
```

---

## Admin Dashboard Enhancements (PR #19 — MERGED ke `master`, `4a99688`)

Status flow album: `active → submitted (klien submit) → locked (admin lock)`. Galeri memperlakukan `submitted` & `locked` sebagai terkunci; submit hanya diterima saat `active`.

| Fitur | Status | Catatan |
|-------|--------|---------|
| Search + filter status album | ✅ | Client-side (client/judul/PIN) + tab All/Active/Submitted/Locked |
| Bulk delete album | ✅ | Mode pilih + `bulk-delete.ts` (cascade transaksi) |
| Manual Lock / Unlock gallery | ✅ | `lock.ts` / `unlock.ts`, tombol kondisional di `AlbumDetail` |
| **Pagination album** | ✅ | Client-side `PAGE_SIZE=12`, kontrol Prev/Next ber-`aria-label`, reset ke hal.1 saat search/filter berubah |
| **Bulk photo select + delete** | ✅ | Mode select foto + select-all/clear + `ConfirmDialog` → `photos/bulk-delete.ts` (strong-ref cleanup, 1 transaksi) |
| **Reorder foto (drag + keyboard)** | ✅ | Optimistic update + rollback, persist ke `album.photos` via `albums/[id]/reorder.ts` (PATCH) |
| **Mobile-first pass (≤480px)** | ✅ | Toolbar wrap, modal full-height, target sentuh ≥44px, tabel selection scrollable |
| Accessibility | ✅ | Focus trap (`useFocusTrap`) + `ConfirmDialog`, kontrol reorder keyboard, `prefers-reduced-motion` |
| Admin E2E | ✅ | 4/4 pass lokal — lihat tabel "Known Stubs" |

> Semua endpoint admin baru memanggil `requireAdmin()` di baris pertama + `publishAdminEvent()`/`publishAlbumEvent()` setelah aksi state-changing + log error. **Sudah di-merge** ke `master` (`4a99688`); branch `feat/admin-dashboard-impeccable` sudah dihapus.

---

## PR #20 — Harden Gallery PIN Rate-Limit (MERGED ke `master`, `086af93`)

| Aspek | Detail |
|-------|--------|
| IP source | Dari `clientAddress` platform (bukan header `X-Forwarded-For` yang bisa dipalsukan) |
| Rate cap | Per-IP (5x/15min) **+** per-album `album:slug` (30x/15min) |
| PIN compare | `crypto.timingSafeEqual` (anti timing-attack) |
| Fail mode | **Fail-closed di produksi** — butuh env Upstash (`UPSTASH_REDIS_REST_URL`/`_TOKEN`); fallback in-memory hanya dev |
| Fix Kilo | `verify.ts` — `pin` non-string dibalas **400** rapi + type-guard `typeof` di `pinMatches` (anti crash 500). Commit `71b76db` |

> Env Upstash sudah terpasang di Vercel **Production/Preview/Development** → syarat fail-closed terpenuhi.

---

## PR #21 — Direct-to-Sanity Upload (MERGED ke `master`, `75c62f5`)

**Alasan:** Vercel Serverless batas body ~4.5MB → foto full-res selalu gagal (413). Solusi: biner di-upload **langsung dari browser** ke Sanity Asset API, melewati serverless.

| Bagian | Detail |
|--------|--------|
| `api/admin/upload/credentials.ts` | Admin-only, write token diambil runtime, `no-store`, tidak di-bundle ke JS klien |
| `api/admin/upload/finalize.ts` | Payload JSON kecil: verifikasi album → buat dokumen `photo` → `append` ke `album.photos` → `publishAdminEvent` |
| `api/admin/upload.ts` lama | **Dihapus** |
| `UploadPage.tsx` | Upload paralel berbatas `UPLOAD_CONCURRENCY=3`; auto-retry 3x exp-backoff (hanya transient `0`/408/429/≥5xx; 4xx tidak); tombol Retry per-foto; `assetId` dipertahankan antar-retry (anti aset duplikat) |
| CORS Sanity (`741sif2l`) | Ditambah `https://www.ylex.my.id` + wildcard preview `https://ylx-*.vercel.app` (`allowCredentials:false`, auth Bearer); entri `http://0.0.0.0:0` dihapus |

> **Hotfix `finalize` 500 (`349abd2`):** `UploadPage` dulu punya `interface Album` berfield `_id`, sedangkan `/api/admin/albums` mengembalikan `id` (map dari `_id`) → `album._id` `undefined` → `<option value>` fallback ke teks judul → `finalize` menerima judul album, bukan document id → `getDocument()` melempar → 500 (biner tetap sukses ter-upload). Fix: pakai `album.id`. Tes `upload.spec.ts` diperbaiki ke bentuk `id` + assert `finalize` menerima `albumId` doc id sebagai regression guard.
>
> **Catatan Devin 🟨 (inheren, non-blocking, diterima):** direct-to-Sanity mengharuskan write token full-privilege tersedia di browser admin — dibatasi `requireAdmin` + `no-store` + tidak di-bundle; tak ada scoped/short-lived token bawaan Sanity untuk kasus ini.

---

## impeccable CLI + Touch-Target Fix-All (PR #23 — MERGED ke `master`, `68515c0`)

Adopsi **impeccable CLI** (`pbakaus/impeccable`) sebagai tooling detector permanen + memperbaiki semua target sentuh tombol di bawah 44px (audit `button mobile first`, 17/20).

| Aspek | Detail |
|-------|--------|
| Tooling ter-commit | `.impeccable/config.json` (sumber kebenaran detector: `ignoreFiles`). Detector jalan via `npx impeccable detect --json apps/web/src` — 0 temuan actionable |
| Junie unsupported | Junie bukan provider impeccable → hook editor-native dilewati; hanya CLI + config bersama. Install harness `.github/skills|hooks/` di-`.gitignore` (blok `# impeccable-ignore-start/end`) |
| False positive triase | `broken-image` (`BlurImage.tsx`, `src` runtime) → `ignoreFiles`; `overused-font`/`single-font` (`BaseLayout.astro`) → komentar inline (Inter dipasangkan Playfair Display) |
| Foundation anti-drift | Token `--tap-target-min: 44px` (`variables.css`) + base `button { min-height: var(--tap-target-min) }` (`global.css`); `.search-clear` dikecualikan (in-input, 36×36) |
| P1 Upload | `.btn-text`/`.btn-icon` (+`min-width`)/`.btn-retry` ≥44px (ikon 16px tetap) |
| P2 ≥44px | `.submit-btn` galeri, `.btn-new-album`+`.logout-btn`, `.copy-btn`, tombol `ConfirmDialog` + `@media (≤480px)` stacked/full-width |
| P3 polish | `color: white` → `var(--color-bg)`; hover `opacity` → `var(--color-accent-hover)` (delete: `color-mix` merah gelap) |

> Verifikasi hijau: detector 0 actionable, `tsc`, `eslint --max-warnings 0`, `vitest` 3/3, `playwright` 12 pass + 1 flaky (paginasi lama), `pnpm build`.

---

## Performance + Upload/Gallery Hardening (`feat/gallery-upload-improvements`, belum merge)

Menindaklanjuti laporan "peluang peningkatan" — item **#1/#3/#4/#5** + grid admin mobile-first. Tanpa perubahan logika bisnis.

| Aspek | Detail |
|-------|--------|
| #1 Gambar CDN | `verify.ts` + admin `[id]/index.ts` kini `auto("format")` + `quality` (WebP/AVIF, ~30-60% lebih ringan); thumbnail galeri punya `thumbnailSrcSet` 1×/2× + `BlurImage` menerima `srcSet`/`sizes` (retina tajam) |
| #3 File ditolak | `UploadPage.addFiles` — banner `role="status"` yang bisa ditutup untuk file format/ukuran tak didukung & duplikat (sebelumnya dibuang senyap) |
| #4 Anti-konflik | `finalize.ts` — `patch().append()` dibungkus retry-on-409 (`commitWithConflictRetry`) agar upload paralel ke album sama tak kehilangan foto |
| #5 Progress + dedup | `UploadPage` — progress bar batch `Uploaded X of N` + deteksi duplikat filename (case-insensitive) |
| Grid mobile-first | `AlbumDetail` grid foto ≤480px: `1fr` → `repeat(auto-fill, minmax(96px,1fr))` (grid kompak, bukan 1 kolom). Galeri klien & daftar album sudah mobile-first |

> Verifikasi hijau: detector **0 temuan**, `tsc`, `eslint --max-warnings 0`, `vitest` 3/3, `playwright` 12 pass + 1 flaky (paginasi lama), `pnpm build`.

---

## File Map

| Path | Deskripsi |
|------|-----------|
| `apps/web/src/pages/index.astro` | Homepage dengan gallery entry form |
| `apps/web/src/pages/admin/` | Admin pages (login, index, upload) |
| `apps/web/src/pages/gallery/[slug].astro` | Gallery route per album |
| `apps/web/src/pages/api/admin/albums.ts` | CRUD album (GET list, POST create) |
| `apps/web/src/pages/api/admin/albums/[id]/` | Album detail (GET, PUT, DELETE), lock/unlock, `reorder` (PATCH urutan `album.photos`) |
| `apps/web/src/pages/api/admin/albums/bulk-delete.ts` | Hapus banyak album (cascade transaksi tunggal) |
| `apps/web/src/pages/api/admin/photos/[id].ts` | Hapus satu foto (aman referensi) |
| `apps/web/src/pages/api/admin/photos/bulk-delete.ts` | Hapus banyak foto sekaligus (strong-ref cleanup, 1 transaksi) |
| `apps/web/src/pages/api/admin/upload/credentials.ts` | Beri kredensial upload (admin-only, token runtime) untuk **direct-to-Sanity** upload dari browser (lewati batas ~4.5MB Vercel) |
| `apps/web/src/pages/api/admin/upload/finalize.ts` | Wiring pasca-upload: buat dokumen `photo` + `append` ke `album.photos` (payload JSON kecil) |
| `apps/web/src/pages/api/gallery/[slug]/verify.ts` | PIN auth + album+photo data |
| `apps/web/src/pages/api/gallery/[slug]/submit.ts` | Submit selections + lock album |
| `apps/web/src/pages/api/auth/` | Login, logout, create-admin |
| `apps/web/src/components/admin/` | AdminPage, AlbumList, AlbumCard, AlbumDetail, AlbumFormModal, UploadPage, SelectionTable, CopyFilenamesButton |
| `apps/web/src/components/gallery/` | GalleryPage, PinEntry, PhotoLightbox, BlurImage (LQIP blur-up) |
| `apps/web/src/hooks/useCopyToClipboard.ts` | Hook clipboard dengan auto-reset + cleanup |
| `apps/web/src/lib/slug.ts` | `generateUniqueSlug()` — shared antara POST & PUT |
| `apps/web/src/lib/auth.ts` | `requireAdmin()` — auth guard semua admin endpoints |
| `apps/web/src/lib/ably.ts` | `publishAdminEvent()` — SSR-safe via `Ably.Rest` |
| `packages/sanity/schemas/` | Schema: album, photo, selection, submission |
| `packages/sanity/lib/queries.ts` | GROQ queries (allAlbumsQuery, albumBySlugQuery, dll.) |
| `packages/sanity/lib/admin.ts` | `createAdmin`, `validateAdminPassword` (bcrypt) |
| `packages/shared/` | Types (Album, Photo, Selection, Realtime events) + utils |

---

## Environment Variables (apps/web/.env.local)

```env
PUBLIC_SANITY_PROJECT_ID=741sif2l
PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=<write token — lihat Sanity dashboard>
PUBLIC_ABLY_KEY=<subscribe-only key>
ABLY_API_KEY=<full key>
SESSION_SECRET=<random string — HMAC signing untuk cookie admin session>
```

> ⚠️ Token Sanity di `CONTEXT.md` sudah **di-revoke** — jangan pakai. Generate token baru dari https://www.sanity.io/manage/project/741sif2l/api
>
> ⚠️ **Direct-to-Sanity upload (upload foto):** biner di-upload langsung dari browser ke Sanity Asset API supaya lepas dari batas body ~4.5MB Vercel Serverless. Konsekuensi konfigurasi:
> - `SANITY_API_TOKEN` **wajib role Editor/write** (bukan Viewer) — dipakai untuk `assets.upload` + create/patch.
> - Origin aplikasi (domain produksi + preview) **wajib ditambahkan** ke Sanity **CORS origins** (manage.sanity.io → API → CORS origins). Tanpa ini, upload dari browser diblok CORS. "Allow credentials" **tidak** perlu (auth via Bearer token, bukan cookie).
> - Token hanya diambil runtime oleh admin terautentikasi via `/api/admin/upload/credentials` (tidak di-bundle ke JS klien).

---

## Security Status

| Item | Status |
|------|--------|
| bcrypt 12 rounds | ✅ |
| Session cookie `secure: PROD` | ✅ |
| `requireAdmin()` di semua admin endpoints | ✅ |
| Single error message login (no enumeration) | ✅ |
| PIN rate limiter 5x/15min/IP + 30 failed/15min/album (Upstash wajib di production — fail closed; in-memory hanya dev) | ✅ |
| `.git` / `.env` diblok di Vercel | ✅ |
| Hardcoded credentials di repo | ✅ Tidak ada |
| `create-admin` selalu wajib auth (admin pertama via CLI `seed-admin.mjs`) | ✅ |
| Session cookie HMAC-signed via `SESSION_SECRET` (C1) | ✅ |
| Ably token auth — publish key tidak di browser (C2) | ✅ |
| Sanity dataset **private** — read anon tidak bocorkan PIN (C3) | ✅ |
| Submit verifikasi photo ownership + atomic lock (H3/M1) | ✅ |
| `selections.ts` GET `requireAdmin` | ✅ |

> Audit keamanan 2026-07-02 (C1/C2/C3/H3+M1) selesai — lihat `PROGRESS.md` bagian "Security Audit 2026-07-02". Realtime browser sekarang auth via `/api/ably/token` (subscribe-only). Read Sanity server-side pakai `SANITY_API_TOKEN` karena dataset sudah private.

---

## Infrastruktur Dev (VPS)

| Tool | Detail |
|------|--------|
| Junie MCP servers | playwright, filesystem, sequential-thinking, memory, context7, github, kernel, linear, sanity (9 aktif) |
| Vercel token | `~/.local/share/com.vercel.cli/auth.json` |
| Kernel browser | `agent-browser -p kernel` + `KERNEL_API_KEY` di `~/.bashrc` |
| Linear team | `Ylx` | ID: `bc11a289-8943-48bc-9679-87557d86ea0e` |
| Sanity project | `741sif2l` / dataset `production` (**private** sejak 2026-07-02) |

---

## Known Stubs / Not Implemented

| Item | File | Status |
|------|------|--------|
| Gallery E2E (Playwright) | `apps/web/tests/gallery.spec.ts` | ✅ Refreshed ke selektor lightbox+LQIP (PR #17), 5/5 pass via `pnpm test:e2e`; masih tidak di CI (butuh server live + seed) |
| Admin E2E (Playwright) | `apps/web/tests/admin.spec.ts` | ✅ 4/4 pass lokal (`pnpm exec playwright test tests/admin.spec.ts`, ~14s). Signed-session seed helper `tests/helpers/adminSession.ts` mem-bypass auth-guard `/admin` (C1) via cookie HMAC valid; route API di-mock via `page.route`. Meliputi: pagination, bulk photo delete, reorder (keyboard), lock/unlock |
| Email notifikasi | — | Tidak ada |
| OAuth admin auth | — | Bukan OAuth, pakai email+bcrypt |
| LQIP / Blurhash | `BlurImage.tsx` + `verify.ts` (`metadata.lqip`) | ✅ Blur-up progressive loading di grid + lightbox (PR #17) |

---

## Rules untuk AI Agent

### Wajib dibaca sebelum coding
1. `STATUS.md` — file ini (state aktual)
2. `REVIEW.md` — semua lessons dari 2 audit cycles, anti-pattern list, auto-reject criteria
3. `DESIGN.md` — design tokens, typography, spacing

### Code quality rules
- **TypeScript strict** — `pnpm exec tsc --noEmit` harus 0 error sebelum commit
- **ESLint no-any** — `pnpm exec eslint src --max-warnings 0` harus bersih
- **Ponytail-first** — minimal code, YAGNI; jangan tambah abstraksi yang belum diperlukan
- **Impeccable** untuk UI/UX — contrast ≥ 4.5:1, prefers-reduced-motion, keyboard accessible

### Git workflow
- Branch baru untuk setiap feature/fix
- Buat PR, tunggu bot review (Sourcery, Devin, Qoder, Kilo Code)
- Verifikasi bot review sebelum menyatakan valid — bot bisa salah
- **Dilarang** `git push --force` — gunakan `--force-with-lease` jika terpaksa
- Conflict diselesaikan manual, bukan dengan force

### Vercel deployment
- `buildCommand` di-set di project settings Vercel: `cd ../.. && pnpm turbo build --filter=@ylx/web --force`
- `rootDirectory: apps/web`, `framework: astro`, `nodeVersion: 22.x` (adapter `@astrojs/vercel` v10 memilih runtime dari versi Node build → pastikan setelan proyek Vercel Node 22.x)
- `--force` flag wajib untuk menghindari Turbo cache hit yang membuat `.vercel/output` tidak ter-generate

### Sanity patterns
- Gunakan `sanityClient` (read-only CDN-off) untuk fetch
- Gunakan `sanityWriteClient` hanya untuk write operations
- GROQ subquery: `album._ref == ^._id` (bukan `^.`)
- Field system Sanity menggunakan `_` prefix: `_createdAt`, `_id`, `_type`

### Jangan lakukan
- Jangan hapus `packages/sanity/package.json` exports field — monorepo TypeScript resolution butuh ini
- Jangan pakai token Sanity dari `CONTEXT.md` — sudah di-revoke
- Dataset `production` **private** — `sanityClient` (read) WAJIB pakai `SANITY_API_TOKEN`, jangan hapus token dari client; read anon akan return `null`
- Jangan set `PUBLIC_ABLY_KEY` sebagai satu-satunya auth Ably di client — pakai `authUrl: /api/ably/token` (key publish jangan ke browser)
- Jangan install Mastra ke `apps/web` tanpa validasi Vercel serverless compatibility dulu
- Jangan commit credentials apapun ke repo

---

## Dokumen Referensi

| File | Baca untuk |
|------|-----------|
| `STATUS.md` | State aktual, file ini |
| `REVIEW.md` | Code review checklist, anti-patterns, auto-reject list |
| `DESIGN.md` | Design tokens, warna, typography |
| `PRODUCT.md` | Product requirements |
| `AGENTS.md` | Architecture overview (perlu update — lihat catatan di bawah) |
| `PROGRESS.md` | History PR dan bug fixes yang sudah diselesaikan |

> `CONTEXT.md` sudah sangat outdated — jangan jadikan referensi utama. Gunakan `STATUS.md` ini.
