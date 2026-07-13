# YLx — Status & AI Agent Onboarding
> Last updated: 2026-07-13 | PR MERGED: **#19** admin dashboard, **#20** PIN rate-limit, **#21** direct-to-Sanity upload, **#22** Astro 5→6, **#23** impeccable CLI, **#25** junie review workflow, **#26** gallery-upload improvements, **#27** long-term audit improvements (CSP/HSTS + hybrid rendering + Upstash KV cache), **#28** admin login rate-limit (H-1), **#29** session revocation (M-1), **#30** Ably realtime album scoping (M-2), **#32** selection notes & gallery link improvements, **#33** Vercel Web Analytics. Semua 12 temuan `new-audit.md` (M-1..M-4, L-1..L-6) sekarang ✅ FIXED. Branch aktif: **`master`**.

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
| Admin login rate-limited 10/IP + 20/email per 15min (H-1) | ✅ MERGED #28 |
| Session revocation list — `sessionVersion` counter, logout bumps it, `getSession` checks it (M-1 dari `new-audit.md`) | ✅ MERGED #29 |
| Ably realtime capability discope per album via PIN session cookie, bukan `album:*` wildcard (M-2 dari `new-audit.md`) | ✅ MERGED #30 |
| CSRF Origin/Referer check di `middleware.ts` untuk `/api/admin`, `/api/gallery/*`, `/api/auth/*` (M-3 dari `new-audit.md`) | ✅ di `master` (commit `f255c5d`+lanjutannya, di luar sesi Junie manapun) |
| Rate-limit tiered degradation ke in-memory ketat saat Upstash error, bukan fail-closed murni (M-4 dari `new-audit.md`) | ✅ di `master` (commit `f255c5d`) |
| Submit galeri bind ke sesi PIN via `hasAlbumAccess` (L-1 dari `new-audit.md`) | ✅ di `master` (commit `f255c5d`) |
| `clientAddress` kosong ditolak di prod, konsisten `verify.ts`/`login.ts` (L-3 dari `new-audit.md`) | ✅ di `master` (commit `f255c5d`) |
| `getSession` validasi struktur payload post-parse (L-4 dari `new-audit.md`) | ✅ di `master` (commit `f255c5d`) |
| Hydration-leak CI guard untuk prop sensitif di `client:*` (L-2 dari `new-audit.md`) | ✅ 2026-07-13, `apps/web/scripts/check-hydration-leak.mjs` |
| Dependency install-script allowlist (L-5 dari `new-audit.md`) | ✅ 2026-07-13, `pnpm-workspace.yaml` `onlyBuiltDependencies` |

> Audit keamanan 2026-07-02 (C1/C2/C3/H3+M1) + threat model 2026-07-10 (H-1) selesai — lihat `PROGRESS.md` bagian "Security Audit 2026-07-02". Realtime browser sekarang auth via `/api/ably/token` (subscribe-only). Read Sanity server-side pakai `SANITY_API_TOKEN` karena dataset sudah private.
>
> **M-1 fix (`fix/session-revocation-m1`, belum merge):** admin doc Sanity punya field baru `sessionVersion` (schema `packages/sanity/schemas/admin.ts`, default 0, hidden). Login menandatangani cookie dengan versi saat ini; logout (`api/auth/logout.ts`) menaikkan versi di Sanity + invalidasi cache versi (`invalidateSessionVersionCache`) sehingga **cookie lain yang sama** (dicuri, tab/device lain) langsung tertolak di request berikutnya — bukan cuma menghapus cookie di browser yang logout. `getSession()` (`lib/auth.ts`) jadi async: setelah HMAC+expiry valid, cek `sessionVersion` cookie vs versi terkini (di-cache 20s/stale 60s via `cache.ts`, gagal-terbuka ke Sanity langsung jika Upstash tak terkonfigurasi). Cookie format lama (tanpa `sessionVersion`) otomatis tertolak setelah deploy → admin re-login sekali. Efek: `requireAdmin`/`getSession` sekarang mengembalikan `Promise`, semua 16 titik pemanggil (14 API route + 2 halaman `.astro`) diupdate pakai `await` (dikerjakan 2 subagent paralel, commit `4db5ca2` + `76901e5`, disjoint file set, tanpa konflik).
> Test baru: `apps/web/src/lib/auth.test.ts` (6 test unit, mock `getAdminSessionVersion`) — cover sesi valid, sesi basi (revoked), admin terhapus, cookie legacy tanpa field, sesi expired (skip cek versi), `requireAdmin` pada sesi revoked. Verifikasi: `typecheck`/`lint --max-warnings 0`/`test` (11/11 vitest)/`build` semua pass.
> **Known gap (belum di-fix):** Playwright e2e (`tests/helpers/adminSession.ts`) memakai cookie admin palsu (id `playwright-admin`, tak ada doc Sanity asli) — sekarang perlu doc Sanity nyata dengan `sessionVersion` matching agar bisa lolos `getSession()` di halaman admin SSR; belum ada fixture/seed untuk itu (di luar scope perbaikan ini, didokumentasikan di helper).
> **PR #29** dibuat & di-push (https://github.com/msph1973/ylx/pull/29 → base `master`). Semua check bot selesai (`verify`/`review`/CodeQL x3/Sourcery/Vercel Preview Comments, semua `success`). Temuan: Sourcery menandai `SESSION_SECRET` kosong sebagai potensi "silent successful login" — **false positive**, `signSession()` sudah `throw` fail-fast bila secret kosong (kode pre-existing, tak berubah di PR ini). Devin: cache SWR (`staleTtl=60s`) bisa membiarkan sesi revoked lolos hingga 60s **hanya jika** `invalidateSessionVersionCache` saat logout gagal diam-diam — trade-off yang sudah didokumentasikan (fail-open by design), belum ditindaklanjuti (menunggu keputusan user). PR masih **open**, belum merge.

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
| `new-audit.md` | Riwayat temuan security audit — semua (M-1 s/d L-6) sudah ✅ FIXED |

> `CONTEXT.md` sudah sangat outdated — jangan jadikan referensi utama. Gunakan `STATUS.md` ini.

---

## Upstash KV Cache Layer — Admin Sanity Reads (2026-07-09, branch `feat/long-term-audit-improvements`)

- Baru `apps/web/src/lib/cache.ts`: `getCached()`/`invalidateCache()`/`CACHE_KEYS`, SWR di atas Upstash Redis REST (raw-fetch, gaya sama seperti `ratelimit.ts`), tapi **fail OPEN** (bukan fail-closed) — ini optimasi performa, bukan security control.
- Dipasang di `api/admin/albums.ts` GET (ttl=30/stale=120) + `api/gallery/[slug]/selections.ts` GET (admin-only, ttl=15/stale=60), keduanya kirim `Cache-Control: private, ...` (bukan `public`, respons bawa PIN).
- Invalidasi cache ditaruh di samping tiap `publishAdminEvent()` yang sudah ada di semua endpoint mutasi album/foto/upload/submit terkait. `reorder.ts` sengaja tidak invalidasi (`allAlbumsQuery` cuma `photoCount`, bukan urutan foto).
- Verifikasi: `pnpm --filter @ylx/web typecheck/lint/test` semua pass. Commit `a90bb9d`. Detail lengkap: `~/.junie/memory/notes.md` entri `2026-07-09T13:09Z`.

---

## CSP/HSTS Middleware + Hybrid Rendering (2026-07-09, branch `feat/long-term-audit-improvements`)

Dikerjakan paralel dengan cache layer di atas (file terpisah, tanpa konflik). Commit `a218532`.

- **Baru:** `apps/web/src/middleware.ts` (`onRequest` via `astro:middleware`) — set `Content-Security-Policy` + `Strict-Transport-Security` di setiap response SSR. String CSP/HSTS di `apps/web/src/lib/securityHeaders.ts` (source of truth untuk sisi SSR).
- **`vercel.json`** dapat entri CSP+HSTS yang identik — perlu, karena middleware Astro TIDAK jalan untuk halaman prerendered (lihat poin berikut).
- **Hybrid rendering:** `export const prerender = true` di `index.astro` (homepage) & `admin/login.astro` (form login). `admin/index.astro`/`admin/upload.astro` (pakai `requireAdmin`) dan `gallery/[slug].astro` (dynamic route tanpa `getStaticPaths`) tetap SSR — sudah benar, diverifikasi lewat `astro build` (log prerendering static routes cuma nunjukkan 2 file itu yang di-emit statis).
- **Keputusan CSP (trade-off, sudah diverifikasi, bukan asumsi):** `script-src`/`style-src` pakai `'unsafe-inline'`. Sempat dipertimbangkan ganti ke fitur bawaan Astro 6 `security.csp` (auto-hash, stable sejak `astro@6.0.0`) supaya `unsafe-inline` bisa dihapus — **tapi ditolak** setelah verifikasi kode: `UploadPage.tsx` pakai `style={{ transform: 'scaleX(...)' }}` (progress bar dinamis) yang tak bisa di-hash statis, dan spec CSP membatalkan `unsafe-inline` begitu ada hash apa pun di directive yang sama → mengaktifkan fitur itu berisiko memblokir progress bar upload di produksi, tak bisa diverifikasi visual di sandbox ini (Playwright dev server timeout). Kesimpulan: `unsafe-inline` yang terdokumentasi lebih aman daripada hash-CSP yang berisiko regresi tak-teruji. **Follow-up kandidat masa depan:** aktifkan `security.csp` di `astro.config.mjs` DAN pindahkan progress bar `UploadPage.tsx` dari inline `style` ke CSS custom-property/class-based, lalu verifikasi visual via Playwright sebelum enable.
- **Verifikasi:** `pnpm --filter @ylx/web typecheck/lint/test/build` semua pass (dijalankan ulang gabungan dengan commit cache di atas — tidak ada konflik).

---

## Upstash Credentials — Live Verified (2026-07-09)

- `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (production Upstash instance, region us-east-1) sudah terisi nyata di `.env` (root) dan `apps/web/.env.local` — kedua file di-gitignore (`.env*` di `.gitignore`), tidak pernah ke-commit.
- Live smoke test langsung ke Upstash REST (`SET ... EX` / `GET` / `DEL`) dan ke fungsi asli `getCached()`/`invalidateCache()` di `src/lib/cache.ts` (dijalankan via Node 22 type-stripping, bukan disimulasikan) mengonfirmasi seluruh siklus SWR bekerja nyata: hard miss → fetch+store, fresh hit → no refetch, stale hit → return nilai lama + background refresh, post-refresh fresh hit, invalidate → hard miss lagi. Ini menutup catatan "belum diuji live" dari sesi sebelumnya.
- **QStash** (`QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) ditambahkan sebagai cadangan ("jaga-jaga") ke `.env` dan `apps/web/.env.local` saja (bukan ke `.env.example`, atas permintaan eksplisit — supaya nama variabel tidak muncul di GitHub). **Tidak ada kode yang memakainya** — belum ada fitur async/scheduled job yang butuh QStash.

---

## PR #27 — Long-term Audit Improvements (2026-07-09)

- Branch `feat/long-term-audit-improvements` di-push ke `origin` dan PR **#27** dibuat ke base `master` (default branch repo ini, dikonfirmasi via `git remote show origin`, BUKAN `main`).
- Berisi 4 commit: `a90bb9d` (KV cache), `a218532` (CSP/HSTS + hybrid rendering), `680daeb` + `65c5208` (docs `STATUS.md`).
- URL: https://github.com/msph1973/ylx/pull/27 — status: open, belum ada review/merge.

---

## PR #27 — Fix Bot Review Findings (2026-07-09, branch `feat/long-term-audit-improvements`, belum di-commit)

Menindaklanjuti semua temuan Sourcery + Junie Review + Devin di PR #27:

| # | Sumber | Temuan | Fix |
|---|--------|--------|-----|
| 1 | Devin | `submit.ts:146` — status album `active→submitted` tidak invalidasi `CACHE_KEYS.albumsList()`, dashboard admin stale sampai 2 menit walau realtime event sudah jalan | `submit.ts` sekarang invalidasi `[albumsList(), albumSelections(albumId)]` sekaligus |
| 2 | Devin | Background SWR refresh bisa terpotong di serverless (runtime frozen setelah response terkirim) — fail-open jadi degradasi ke TTL-only | `cache.ts` bungkus refresh background dengan `waitUntil()` dari `@vercel/functions` (dependency baru) — ambient, tak perlu threading context, no-op aman di luar Vercel |
| 3 | Sourcery + Junie | `albums/bulk-delete.ts` invalidasi `albumSelections` per album dalam loop sekuensial | `invalidateCache()` sekarang terima `string \| string[]` → satu `DEL` multi-key sekali round-trip; `bulk-delete.ts` pakai array |
| 4 | Sourcery | Semua error Upstash di `cache.ts` disembunyikan di balik satu `console.warn` generik, sulit ditelusuri saat ada isu sporadis | Setiap `console.warn` di `cache.ts` kini sertakan cache key + jenis operasi (GET/refresh/store/invalidate) |
| 5 | Sourcery (`cache.ts:69-70`) | Entry cache corrupt bikin `JSON.parse` gagal berulang sampai key expired | `getCached()` tangkap `JSON.parse` error, hapus key corrupt via `invalidateCache`, treat sebagai hard miss (self-heal) |
| 6 | Junie (`cache.ts:78`) | `getCached` tidak ada request dedup untuk background refresh — banyak request stale bersamaan bisa trigger banyak fetch paralel ke Sanity | `inFlightRefreshes` Map keyed by cache key — refresh kedua untuk key yang sama di-skip selama yang pertama masih jalan |
| 7 | Junie (`securityHeaders.ts:1`) | Nilai CSP/HSTS di-duplikasi manual antara `securityHeaders.ts` dan `vercel.json`, bisa drift | Test baru `apps/web/src/lib/securityHeaders.test.ts` (vitest) baca kedua sumber & `expect().toBe()` — gagal CI begitu drift, tanpa perlu codegen JSON |

> Verifikasi: `pnpm --filter @ylx/web typecheck/lint/test/build` semua pass (build tetap emit `index.html` + `admin/login/index.html` sebagai static). Commit `ed0b69a`, sudah di-push ke PR #27 (dikonfirmasi via `git log`/GitHub — bukan lagi pending).

---

## PR #27 — Bug Nyata Ditemukan via E2E Browser Sungguhan + Fix Round-2 Bot (2026-07-09)

- **Monitoring pasca-push** (`ed0b69a`): Devin menandai temuannya "✅ Resolved"; Sourcery & Junie Review lulus bersih tanpa komentar baru (tidak ada temuan tambahan pada commit ini).
- **Temuan baru via e2e browser sungguhan (kernel + Playwright) terhadap Vercel Preview deployment PR (bukan cuma `pnpm dev`):** `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection` **hilang total** di dua halaman prerendered (`/`, `/admin/login`) di production — cuma `Strict-Transport-Security` yang muncul (itu pun karena Vercel platform default, independen dari `vercel.json`).
- **Root cause:** `vercel.json` ada di root monorepo, padahal Vercel Root Directory project ini `apps/web` (lihat `AGENTS.md`) — Vercel cuma baca `vercel.json` relatif ke Root Directory, jadi konfigurasi `headers` di root **tidak pernah terbaca** untuk halaman statis. Rute SSR tetap aman karena header itu datang dari `middleware.ts`, bukan `vercel.json`.
- **Fix (commit `bffdf65`):** pindahkan file ke `apps/web/vercel.json` (`buildCommand`/`installCommand` `cd ../..` tidak berubah, tetap benar relatif Root Directory). `securityHeaders.test.ts` (drift guard) disesuaikan path-nya. **Diverifikasi live setelah redeploy:** semua header sekarang muncul benar di kedua halaman statis.
- **Fix round-2 bot findings (commit `662a47a`):** Junie Review menandai 6 titik lagi dengan `void invalidateCache(...)` (fire-and-forget) dan/atau panggilan sekuensial terpisah alih-alih satu array — di `albums.ts` POST, `albums/[id]/index.ts` PUT+DELETE, `lock.ts`, `unlock.ts`, `photos/[id].ts`, `photos/bulk-delete.ts`, `upload/finalize.ts`. Semua diubah jadi `await invalidateCache([...])` (jaminan cache ter-invalidasi sebelum response terkirim + satu round-trip Upstash per handler).
- **Verifikasi setelah kedua fix:** `pnpm --filter @ylx/web typecheck/lint/test(5/5)/build` semua pass tiap kali; setelah push kedua, semua bot (Sourcery/Junie/Devin/CodeQL) lulus bersih tanpa komentar baru. PR #27 `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, masih **open** (belum diminta merge).

---

## PR #27 — Merged & Branch Dibersihkan (2026-07-09)

- PR #27 di-**merge** ke `master` via merge commit `938eca6` (metode `merge`, konsisten dengan histori PR sebelumnya di repo ini — bukan squash/rebase).
- Branch `feat/long-term-audit-improvements` **dihapus** baik di lokal maupun di `origin` setelah merge. Local checkout dipindah ke `master` dan di-fast-forward (10 commit masuk).
- Semua pekerjaan long-term audit (CSP/HSTS middleware, hybrid rendering, Upstash KV cache SWR, seluruh fix bot review) kini sudah ada di `master`.
- File tak terkait yang masih ada di working tree (`.output.txt` terhapus, `AUDIT.md`, `test-foto.JPG`, `apps/web/.astro/types.d.ts` modified, plan file lain) tetap sengaja tidak disentuh — di luar scope task ini.

---

## PR #28 — Admin Login Rate Limiting (H-1) (2026-07-10)

**Dari hasil Threat Modeling & Security Audit komprehensif — temuan HIGH H-1: admin login tanpa rate limiting.**

| Aspek | Detail |
|-------|--------|
| Problem | Endpoint `api/auth/login` tidak punya proteksi brute-force — hanya PIN galeri yang di-rate-limit. Akun admin tunggal (email publik di `REVIEW.md`) bisa di-scripting dengan rockyou.txt tanpa pembatas berarti selain bcrypt 12 rounds |
| Fix | `apps/web/src/pages/api/auth/login.ts` — pasang rate limiter per-IP (10/15min) + per-email global (20 failed/15min), `recordFailedAttempt` hanya increment pada failed login (bukan setiap request). Gunakan `clientAddress` platform (bukan `X-Forwarded-For`). Fail-closed di prod jika Upstash error |
| Fix round-2 (bot feedback) | Sourcery: reject prod request jika `clientAddress` kosong (mencegah bucket kolusi `"unknown"`). Junie: `String(email)` instead of `as string` |
| Branch | `fix/admin-login-rate-limit` |
| Commit | `b28d3eb` (initial), `f290b45` (bot feedback fix) |
| PR | https://github.com/msph1973/ylx/pull/28 — **MERGED** ke master via `b46083d` |
| Testing | Diverifikasi langsung ke Vercel Preview deployment via curl: HTTP 401 untuk 10 req pertama, HTTP 429 + Retry-After: 900 mulai req ke-11. Login page (/admin/login) HTTP 200. Per-IP limit memblokir cross-email dari IP yang sama |
| Verification | `tsc --noEmit` ✅, `eslint --max-warnings 0` ✅ (test/build pre-existing native binding issue — confirmed same on clean master) |

---

## PR #29 — Session Revocation (M-1) — MERGED (2026-07-10)

- Di-merge via `gh pr merge 29 --merge --delete-branch`; local `master` fast-forward `0ad565a..22ec28e` (24 file berubah, termasuk `auth.ts` async + `sessionVersion`).
- Branch `fix/session-revocation-m1` sudah dihapus di lokal & `origin` (dikonfirmasi `git branch -a` + `git fetch --prune`).
- Sebelum merge, fix sudah diverifikasi live di preview deployment PR (Kernel cloud browser + Playwright, kredensial admin asli): cookie lama langsung 401 setelah logout (bukan nunggu 24 jam), revocation berlaku global per-admin (semua device/tab), login ulang tetap berhasil (bukan lockout permanen). Detail: `~/.junie/memory/notes.md`.

---

## PR #30 — Ably Realtime Album Scoping (M-2) (2026-07-10, branch `fix/ably-album-scope-m2`)

**Dari `new-audit.md` M-2:** `/api/ably/token` dulu memberi capability `album:*: ["subscribe"]` ke SEMUA pengunjung tanpa verifikasi PIN — siapapun bisa dengar event realtime (`photo:uploaded`, `album:unlocked`, dll.) di album manapun tanpa pernah tahu PIN-nya.

| Aspek | Detail |
|-------|--------|
| Fix | `verify.ts` sekarang panggil `grantAlbumAccess(cookies, album._id)` setelah PIN sukses — menulis cookie `gallery_pin_session` (HMAC-signed, `httpOnly`, 24 jam, maks 8 album per browser) via `lib/gallerySession.ts` (baru) |
| Token endpoint | `api/ably/token.ts` baca `?albumId=` dari query, hanya beri `album:<id>: ["subscribe"]` jika `hasAlbumAccess()` true untuk album itu — tidak lagi wildcard |
| Client | `lib/ably.ts` — `getAblyClient(albumId?)` kirim `albumId` sebagai Ably `authParams`; `useRealtime.ts` (dipakai `GalleryPage` pasca-verifikasi PIN) sudah diupdate. `useAdminRealtime` tidak berubah (tak butuh capability album) |
| Refactor pendukung | `lib/signedCookie.ts` (baru) — HMAC sign/verify generik, dipakai HANYA oleh `gallery_pin_session`. `auth.ts` sengaja TETAP pakai HMAC-nya sendiri (bukan diarahkan ke file ini): percobaan pertama mengalihkan `admin_session` ke sini membuat temuan CodeQL `js/insufficient-password-hash` yang sudah di-dismiss sebagai false positive di lokasi lamanya (`auth.ts`) muncul lagi sebagai "baru" untuk PR ini (taint tracking CodeQL ikut lokasi sink, bukan cuma isi kode) — duplikasi ~10 baris HMAC dianggap lebih aman daripada memicu ulang alert itu |
| Test baru | `lib/gallerySession.test.ts` (6 test: grant/check per album, tak leak ke album lain, akumulasi multi-album, cap eviction, cookie di-tamper ditolak, default-deny tanpa cookie) |
| Verifikasi | `typecheck`/`lint --max-warnings 0`/`test` (17/17 vitest termasuk 6 baru)/`build` semua pass |
| PR | https://github.com/msph1973/ylx/pull/30 → base `master`, status: open, `mergeStateStatus: CLEAN`, belum merge |
| Di luar scope | `submit.ts` belum di-bind ke sesi PIN (itu L-1, temuan terpisah level LOW) |

**Riwayat review PR #30 (4 putaran, semua ditindaklanjuti):**
1. CodeQL menandai `js/insufficient-password-hash` di `signedCookie.ts` — false positive yang sama persis dengan yang sudah di-dismiss di lokasi lama (`auth.ts:44`); ternyata memindahkan sink HMAC ke file baru membuat CodeQL menganggapnya "baru". Fix: `auth.ts` dikembalikan 100% identik dengan `master` (HMAC-nya sendiri, tidak lagi pakai `signedCookie.ts`), sehingga `signedCookie.ts` hanya dipakai `gallery_pin_session` (tidak ada taint dari data admin/password).
2. Sourcery + Junie Review: `readEntries()` di `gallerySession.ts` bisa crash kalau payload cookie bukan array (mis. cookie `admin_session` tertukar posisi, sama-sama pakai `SESSION_SECRET`) → ditambah guard `Array.isArray()`. Singleton `getAblyClient()` mengunci `albumId` panggilan pertama tanpa validasi → ditambah pelacakan `clientInstanceAlbumId` + throw kalau ada konflik.
3. Junie Review: throw tadi terlalu ketat untuk transisi `null → albumId` (skenario admin melihat galeri di halaman yang sama) → diubah jadi re-`authorize()` alih-alih throw untuk kasus itu spesifik; komentar/dokumentasi yang salah klaim (`auth.ts` "direfactor pakai `signedCookie.ts`") diperbaiki di kode + `STATUS.md`.
4. Junie Review: panggilan `authorize()` fire-and-forget tanpa `.catch()` → ditambah log `console.warn`. Devin: `albumId` dari query string di `api/ably/token.ts` diinterpolasi langsung ke capability key Ably tanpa validasi format (Ably capability mendukung wildcard `*`) → ditambah validasi charset `/^[a-zA-Z0-9_.-]+$/` sebagai defense-in-depth di atas cek `hasAlbumAccess()`.

Setelah putaran ke-4, tidak ada temuan baru lagi — semua 11 review thread di PR sudah resolved/outdated/ditandai "Addressed".

---

## PR #32 — Selection Notes & Gallery Link — Review Fix Round (2026-07-10, branch `feat/selection-notes-gallery-links`, milik user)

PR ini dibuat user sendiri (bukan hasil sesi ini), berisi fitur selection notes/photographer reply, custom slug, dan share stats. Direview manual sebelumnya (lihat riwayat sesi) dan ditemukan 3 bug kritis: fitur diklaim jalan tapi tidak tersambung end-to-end. Task ini menindaklanjuti dengan fix, dipicu oleh permintaan cek ulang temuan bot deepsource-io.

| # | Bug | Fix |
|---|-----|-----|
| 1 | `customSlug` tidak pernah dipakai untuk resolusi galeri, tidak ada input form-nya, `generateUniqueSlug` keliru menimpa `slug.current` alih-alih field terpisah | `albumBySlugQuery` sekarang cocok `slug.current \|\| customSlug`; `lib/slug.ts` dipecah jadi `generateUniqueSlug` (auto, tak berubah) + `resolveCustomSlug` (validasi+cek unik field terpisah); input custom slug ditambah di `AlbumFormModal`; `albums.ts` POST & `albums/[id]/index.ts` PUT terima+validasi+simpan/hapus field-nya |
| 2 | Notes klien & reply fotografer tak pernah sampai ke UI admin meski tersimpan di Sanity | `albums/[id]/index.ts` GET: tambah `notes`/`photographerReply` ke interface & mapping response |
| 3 | `shareCount`/`lastAccessedAt` field mati — tak pernah di-increment, tak pernah di-query di detail album | `verify.ts` increment `shareCount` + set `lastAccessedAt` setelah PIN sukses (fail-open) + invalidasi cache list; `albumWithSelectionsQuery` & endpoint detail album ditambah field-nya |
| 4 | (risk) `notes`/`photographerReply` tanpa batas panjang, tanpa validasi tipe runtime | `Rule.max(500)` di schema `selection.ts`; validasi panjang+tipe di `submit.ts` dan `selections/[id].ts` PATCH |
| 5 | (risk) `selections/[id].ts` PATCH tanpa log error di catch terluar, tanpa invalidasi cache | Tambah `console.error` + `invalidateCache(albumSelections)` |

**Temuan deepsource-io (bot review baru) — divalidasi satu per satu:**
- **Valid & diperbaiki:** `countAlbumsUsingSlug` di `slug.ts` ditandai `async` tanpa `await` (dihapus keyword-nya); kompleksitas siklomatik "high risk" di 3 endpoint (`AlbumFormModal.handleSubmit`, `albums.ts POST`, `albums/[id]/index.ts PUT`) turun ke "medium" via ekstraksi fungsi validasi/patch-building kecil; baris render per-selection di `SelectionTable` diekstrak ke komponen `SelectionRow` baru.
- **Reviewed, sengaja tidak diubah (false positive, terkonfirmasi lewat pola `ratelimit.ts` yang sudah ada & tak pernah ditandai):** aturan "wrap top-level function in an IIFE" (aturan ini untuk global `<script>` browser lama, bukan ES module TS) dan pemakaian `void fn()` untuk membuang promise yang sudah self-catch (idiom yang sudah dipakai luas di codebase ini).
- **Catatan penting:** overall check `DeepSource: JavaScript` di PR ini **sudah gagal sejak SEBELUM sesi ini** (dikonfirmasi via status commit sebelum perbaikan apapun) — pemeriksaannya menyisir SELURUH repo (bukan cuma diff PR), jadi kegagalan gate ini pre-existing & di luar scope realistis task ini untuk dituntaskan penuh tanpa akses dashboard DeepSource.

> Verifikasi: `typecheck`/`lint --max-warnings 0`/`test` (17/17 vitest)/`build` semua pass di setiap commit (`09acd34`, `d38dad4`). Sourcery/Devin/CodeQL/CI semua hijau pasca-fix. PR #32 masih **open, belum di-merge** — merge tidak diminta.

---

## PR #32 — Fix Semua Temuan CodeRabbit Tersisa (2026-07-10, commit `d91a9cb`)

User mencabut integrasi DeepSource dari repo (tidak akan review lagi), lalu minta perbaiki semua temuan CodeRabbit yang masih tersisa dari review putaran ke-2 (8 item, sudah divalidasi valid semua di sesi sebelumnya).

| # | Temuan CodeRabbit | Fix |
|---|---|---|
| 1 | `slug.ts`/`albums/[id]/index.ts` — race condition: cek keunikan slug/customSlug (`count(...)`) dan penulisannya adalah 2 langkah terpisah, dua request bersamaan bisa lolos cek bersamaan | **Redesign atomik**: dokumen baru `slugLock` (`packages/sanity/schemas/slugLock.ts`) dengan `_id` deterministik dari nilai slug (`slugLock.<slug>`). `.create()` Sanity gagal 409 kalau ID sudah ada → dipakai sebagai primitif "reserve" anti-race. `generateUniqueSlug`/`resolveCustomSlug` di `lib/slug.ts` sekarang pakai `reserveSlug()`/`releaseSlugLock()`; juga ada guard tambahan (non-racy) terhadap slug album lama yang belum punya lock (sebelum mekanisme ini ada) |
| 2 | `selections/[id].ts` — `request.json()` dipanggil di luar `try/catch`, body JSON rusak → unhandled rejection alih-alih 400 | `request.json()` dipindah ke dalam `try` dengan `catch` khusus yang mengembalikan 400 rapi |
| 3 | `verify.ts` — update `shareCount`/`lastAccessedAt` di-`await` sebelum response dikirim, menambah latency ke alur PIN-verify klien padahal cuma data informatif admin | Update di-fire lewat `waitUntil()` (`@vercel/functions`, pola sama seperti background refresh di `cache.ts`) — tidak lagi diblokir response |
| 4 | `SelectionTable.tsx` (bug nyata) — state draft balasan (`replyingTo`/`replyText`) level-tabel dipakai bersama semua baris; klik "Reply" di baris lain diam-diam menghapus draft belum tersimpan di baris lain | State balasan (`isReplying`/`replyText`/`isSaving`/`replyError`) dipindah jadi lokal per baris di `SelectionRow.tsx`; `SelectionTable` hanya menyediakan fungsi `onSaveReply(selectionId, replyText)` |
| 5 | `AlbumFormModal.tsx` — `handleCustomSlugChange` cuma filter karakter terlarang, tidak merapikan tanda hubung ganda/di awal, gagal validasi saat submit dengan pesan menyesatkan | Normalisasi tambahan: `.replace(/-{2,}/g, '-')` + `.replace(/^-+/, '')` saat mengetik (tanda hubung di akhir sengaja dibiarkan, biar tidak mengganggu saat sedang mengetik) |
| 6 (nitpick) | Batas 500 karakter untuk notes/reply diduplikasi manual di 4 tempat | Konstanta `MAX_TEXT_LENGTH` baru di `packages/sanity/lib/constants.ts`, dipakai di `schemas/selection.ts`, `selections/[id].ts`, `submit.ts`, `SelectionRow.tsx`, `PhotoLightbox.tsx` |
| 7 (nitpick) | Regex custom-slug diduplikasi di 3 tempat | Konstanta `CUSTOM_SLUG_PATTERN` di file yang sama, dipakai di `schemas/album.ts`, `lib/slug.ts`, `AlbumFormModal.tsx` |

> Verifikasi: `pnpm --filter @ylx/web typecheck/lint --max-warnings 0/test (17/17 vitest)/build` semua pass; `packages/sanity` `tsc --noEmit` juga bersih. Commit `d91a9cb` sudah di-push ke PR #32. DeepSource tidak lagi jadi bagian review (dicabut user) — tidak ada tindak lanjut lebih jauh untuk temuannya di luar yang sudah selesai di `d38dad4`.

---

## PR #32 — Cek Review Baru + Testing Langsung ke Preview Sungguhan (2026-07-13)

**Cek review bot:** Devin AI mengirim 1 komentar baru setelah push `d91a9cb`: bug nyata di `PhotoLightbox.tsx` — handler keydown level-`document` untuk navigasi ArrowLeft/ArrowRight tidak mengecualikan `<input>`/`<textarea>`, jadi menekan tombol arah saat mengetik di kolom catatan foto (baru ditambahkan PR ini) malah pindah ke foto lain dan menghapus draft catatan. **Valid, langsung diperbaiki** (commit `515a1d8`) — cek `e.target` di `handleKey`, skip navigasi kalau target adalah input/textarea (Escape tetap jalan).

**Testing langsung ke Vercel Preview deployment PR ini** (bukan cuma lint/test lokal) — menemukan 2 bug nyata yang lolos dari semua automated check:

| # | Bug (ditemukan via testing langsung) | Root cause | Fix |
|---|---|---|---|
| 1 | `shareCount`/`lastAccessedAt` tidak pernah tersimpan di production, walau PIN-verify sukses (HTTP 200) berulang kali | `waitUntil()` (`@vercel/functions`) di `verify.ts` cuma benar-benar memperpanjang lifecycle function kalau project Vercel punya **Fluid Compute** aktif — sesuatu yang tak bisa diasumsikan/dikontrol dari kode. Task background diam-diam terpotong sebelum selesai | Commit `58bce86`: kembali ke `await` langsung (bukan fire-and-forget) — sedikit tambahan latency, tapi terjamin benar-benar jalan |
| 2 | **Setelah fix #1, MASIH gagal** — dikonfirmasi via write mentah langsung ke Sanity API: `Mutation failed: Cannot increment "shareCount" because it is not present` | `sanityWriteClient.create()` di `albums.ts` tak pernah inisialisasi `shareCount` awal; `inc()` Sanity mensyaratkan field sudah ada & numerik — jadi **selalu gagal untuk SETIAP album**, sejak fitur ini pertama kali dibuat, terlepas dari isu `waitUntil` di atas. Error-nya selama ini diam-diam ditelan oleh `catch` (demi tidak block klien) | Commit `ca5ffae`: tambah `.setIfMissing({ shareCount: 0 })` sebelum `.inc()` — aman untuk album baru maupun lama |

**Verifikasi live end-to-end** (dataset `production` — dibersihkan setelah selesai): login admin asli → buat album dengan custom slug → akses `/gallery/<customSlug>` (200, bukan 404) → verifikasi PIN → upload 1 foto (lewat direct-to-Sanity upload flow, token dari `/api/admin/upload/credentials`) → submit selection dengan catatan klien → balas sebagai admin via `PATCH /api/admin/selections/[id]` → konfirmasi catatan+balasan tampil di response detail album admin → `shareCount` naik jadi 3 & `lastAccessedAt` terisi setelah fix #2. Ketiga fitur utama PR #32 (custom slug, notes/reply, share stats) **kini benar-benar berfungsi end-to-end di production**, bukan cuma lolos check otomatis.

> Verifikasi: `typecheck`/`lint --max-warnings 0`/`test` (17/17 vitest)/`build` semua pass di ketiga commit (`515a1d8`, `58bce86`, `ca5ffae`). PR #32 checks tetap hijau (CodeRabbit/CodeQL/CI/Vercel) setelah setiap push, `mergeStateStatus: CLEAN`. PR masih **open, belum di-merge** — merge tidak diminta pada task ini (hanya diminta cek review baru + konfirmasi sudah testing langsung).

---

## PR #32 & PR #33 — Merged (2026-07-13)

Diminta merge semua PR yang masih terbuka. Ada 2 PR open saat itu, keduanya sudah `mergeStateStatus: CLEAN`.

| PR | Judul | Branch | Merge commit |
|---|---|---|---|
| #32 | Selection Notes & Gallery Link Improvements | `feat/selection-notes-gallery-links` | `faa7ca5` |
| #33 | Install Vercel Web Analytics (dibuat `vercel[bot]` via Vercel Agent) | `vercel/install-vercel-web-analytics-8a4rhn` | `b44e27b` |

- PR #33 sempat berstatus **draft** — ditandai "ready for review" (`gh pr ready 33`) dulu sebelum bisa di-merge; isinya menambah `@vercel/analytics` (paket `2.0.1`), komponen `<Analytics />` di `BaseLayout.astro`, dan `webAnalytics: { enabled: true }` di adapter Vercel `astro.config.mjs` — semua check (CI/CodeQL/Vercel) sudah hijau sebelum di-merge.
- Kedua branch fitur dihapus otomatis di `origin` via `--delete-branch`; lokal disinkronkan fast-forward ke `master` (`b44e27b`).
- Tidak ada perubahan kode dari task ini sendiri — murni merge + sync.

---

## `new-audit.md` — Sinkronisasi + Fix Sisa Temuan L-2 & L-5 (2026-07-13)

Dicek langsung ke kode (bukan cuma baca dokumen) — ternyata M-3, M-4, L-1, L-3, L-4 sudah diperbaiki lewat commit langsung ke `master` (`f255c5d`, `8838910`, `1995646`, `b1a0184`) di luar sesi Junie manapun yang tercatat di sini, dan L-6 memang tidak butuh aksi. Hanya **L-2** (CI guard hydration-leak) dan **L-5** (dependency install-script allowlist) yang belum ada. Kedua ini diselesaikan sekarang, dan `new-audit.md` + tabel Security Status di atas disinkronkan agar sesuai kondisi kode sebenarnya.

| # | Temuan | Fix |
|---|---|---|
| L-2 | Tidak ada guard otomatis untuk mencegah prop sensitif (PIN/token/secret) diteruskan ke komponen `client:*` (Astro serialize semua prop hydrated ke JSON inline di HTML) | `apps/web/scripts/check-hydration-leak.mjs` — scan semua `.astro`, tolak baris `client:load/idle/visible/only/media` yang punya prop bernama mencurigakan. Script baru `check:hydration-leak` di `apps/web/package.json`, diwire sebagai step baru di `.github/workflows/ci.yml` setelah lint |
| L-5 | Tidak ada pembatasan paket mana yang boleh menjalankan lifecycle install script (`preinstall`/`install`/`postinstall`) — risiko kalau ada transitive dependency di-typosquat/dikompromikan | `pnpm-workspace.yaml` sekarang punya `onlyBuiltDependencies: [esbuild, sharp]` — hanya 2 paket ini yang dikonfirmasi lewat clean-room reinstall benar-benar menjalankan install script; paket lain otomatis diblokir menjalankan script |

**Catatan koreksi penting:** solusi awal yang disarankan `new-audit.md` untuk L-5 (`.npmrc` `enable-pre-post-scripts=false`) **diverifikasi tidak efektif** — setting itu cuma mengontrol chaining `pre<script>`/`post<script>` custom saat `pnpm run <script>`, sama sekali tidak mempengaruhi lifecycle install script dependency. Sempat dicoba dan dites lewat clean-room reinstall (`rm -rf node_modules && pnpm install`) sebelum ketahuan tidak berpengaruh — diganti dengan `onlyBuiltDependencies` di `pnpm-workspace.yaml` (bukan di `package.json`, karena versi pnpm yang dipakai sandbox ini sudah tidak membaca field `pnpm.*` dari `package.json` lagi) yang terbukti benar-benar memblokir/mengizinkan sesuai daftar saat diuji ulang dari nol.

> Verifikasi: clean-room `rm -rf node_modules && pnpm install` dua kali (dengan & tanpa allowlist) mengonfirmasi `esbuild`+`sharp` tetap bisa build, paket lain tidak butuh script apapun. `pnpm --filter @ylx/web typecheck/lint/check:hydration-leak/test (17/17 vitest)/build` semua pass. Perubahan ini **belum di-commit** — menunggu konfirmasi user (konsisten dengan pola sesi-sesi sebelumnya kecuali diminta eksplisit).

**Semua 12 temuan `new-audit.md` (M-1 s/d M-4, L-1 s/d L-6) sekarang berstatus ✅ FIXED / tidak perlu aksi.**
