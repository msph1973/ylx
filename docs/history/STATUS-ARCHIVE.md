# YLx — Arsip Riwayat PR & Perbaikan

> Ini adalah arsip naratif detail untuk pekerjaan yang sudah **selesai & merged**. `STATUS.md` (root project) adalah satu-satunya sumber kebenaran untuk **kondisi terkini** — file ini murni riwayat historis untuk referensi/audit trail, tidak perlu dibaca di awal setiap sesi.
>
> Struktur: setiap kali `STATUS.md` bagian "Recent Work" bertambah entri baru dan melebihi ~3 PR/fix terakhir, entri paling lama dipindahkan ke sini (rolling window) — bukan dihapus.

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
| Admin E2E | ✅ | 4/4 pass lokal — lihat tabel "Known Stubs" di `STATUS.md` |

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

## Performance + Upload/Gallery Hardening (PR #26 — MERGED, `feat/gallery-upload-improvements`)

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

## Upstash KV Cache Layer — Admin Sanity Reads (2026-07-09, branch `feat/long-term-audit-improvements`)

- Baru `apps/web/src/lib/cache.ts`: `getCached()`/`invalidateCache()`/`CACHE_KEYS`, SWR di atas Upstash Redis REST (raw-fetch, gaya sama seperti `ratelimit.ts`), tapi **fail OPEN** (bukan fail-closed) — ini optimasi performa, bukan security control.
- Dipasang di `api/admin/albums.ts` GET (ttl=30/stale=120) + `api/gallery/[slug]/selections.ts` GET (admin-only, ttl=15/stale=60), keduanya kirim `Cache-Control: private, ...` (bukan `public`, respons bawa PIN).
- Invalidasi cache ditaruh di samping tiap `publishAdminEvent()` yang sudah ada di semua endpoint mutasi album/foto/upload/submit terkait. `reorder.ts` sengaja tidak invalidasi (`allAlbumsQuery` cuma `photoCount`, bukan urutan foto).
- Verifikasi: `pnpm --filter @ylx/web typecheck/lint/test` semua pass. Commit `a90bb9d`.

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
- Live smoke test langsung ke Upstash REST (`SET ... EX` / `GET` / `DEL`) dan ke fungsi asli `getCached()`/`invalidateCache()` di `src/lib/cache.ts` (dijalankan via Node 22 type-stripping, bukan disimulasikan) mengonfirmasi seluruh siklus SWR bekerja nyata: hard miss → fetch+store, fresh hit → no refetch, stale hit → return nilai lama + background refresh, post-refresh fresh hit, invalidate → hard miss lagi.
- **QStash** (`QSTASH_URL`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) ditambahkan sebagai cadangan ("jaga-jaga") ke `.env` dan `apps/web/.env.local` saja (bukan ke `.env.example`, atas permintaan eksplisit — supaya nama variabel tidak muncul di GitHub). **Tidak ada kode yang memakainya** — belum ada fitur async/scheduled job yang butuh QStash.

---

## PR #27 — Long-term Audit Improvements (2026-07-09)

- Branch `feat/long-term-audit-improvements` di-push ke `origin` dan PR **#27** dibuat ke base `master` (default branch repo ini, dikonfirmasi via `git remote show origin`, BUKAN `main`).
- Berisi 4 commit: `a90bb9d` (KV cache), `a218532` (CSP/HSTS + hybrid rendering), `680daeb` + `65c5208` (docs `STATUS.md`).
- URL: https://github.com/msph1973/ylx/pull/27 — status: **MERGED**.

---

## PR #27 — Fix Bot Review Findings (2026-07-09)

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

> Commit `ed0b69a`.

---

## PR #27 — Bug Nyata Ditemukan via E2E Browser Sungguhan + Fix Round-2 Bot (2026-07-09)

- **Monitoring pasca-push** (`ed0b69a`): Devin menandai temuannya "✅ Resolved"; Sourcery & Junie Review lulus bersih tanpa komentar baru.
- **Temuan baru via e2e browser sungguhan (kernel + Playwright) terhadap Vercel Preview deployment PR (bukan cuma `pnpm dev`):** `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection` **hilang total** di dua halaman prerendered (`/`, `/admin/login`) di production — cuma `Strict-Transport-Security` yang muncul (itu pun karena Vercel platform default, independen dari `vercel.json`).
- **Root cause:** `vercel.json` ada di root monorepo, padahal Vercel Root Directory project ini `apps/web` — Vercel cuma baca `vercel.json` relatif ke Root Directory, jadi konfigurasi `headers` di root **tidak pernah terbaca** untuk halaman statis.
- **Fix (commit `bffdf65`):** pindahkan file ke `apps/web/vercel.json`. **Diverifikasi live setelah redeploy:** semua header sekarang muncul benar di kedua halaman statis.
- **Fix round-2 bot findings (commit `662a47a`):** 6 titik lagi diubah jadi `await invalidateCache([...])` (jaminan cache ter-invalidasi sebelum response terkirim + satu round-trip Upstash per handler).

---

## PR #27 — Merged & Branch Dibersihkan (2026-07-09)

- PR #27 di-**merge** ke `master` via merge commit `938eca6`. Branch `feat/long-term-audit-improvements` **dihapus** baik di lokal maupun di `origin`.

---

## PR #28 — Admin Login Rate Limiting (H-1) (2026-07-10)

**Dari hasil Threat Modeling & Security Audit komprehensif — temuan HIGH H-1: admin login tanpa rate limiting.**

| Aspek | Detail |
|-------|--------|
| Fix | `apps/web/src/pages/api/auth/login.ts` — rate limiter per-IP (10/15min) + per-email global (20 failed/15min), `recordFailedAttempt` hanya increment pada failed login. Fail-closed di prod jika Upstash error |
| Fix round-2 | Sourcery: reject prod request jika `clientAddress` kosong. Junie: `String(email)` instead of `as string` |
| PR | https://github.com/msph1973/ylx/pull/28 — **MERGED** ke master via `b46083d` |
| Testing | Verifikasi via curl ke Vercel Preview: HTTP 401 untuk 10 req pertama, HTTP 429 + Retry-After: 900 mulai req ke-11 |

---

## PR #29 — Session Revocation (M-1) — MERGED (2026-07-10)

- Sanity admin doc dapat field `sessionVersion`; login menandatangani versi saat ini, logout menaikkan versi + invalidasi cache — cookie lama langsung tertolak, bukan menunggu 24 jam expiry.
- Di-merge via `gh pr merge 29 --merge --delete-branch`. Sebelum merge, diverifikasi live di preview (Kernel + Playwright, kredensial admin asli): cookie lama 401 setelah logout, revocation berlaku global per-admin, login ulang tetap berhasil.

---

## PR #30 — Ably Realtime Album Scoping (M-2) (2026-07-10)

**Temuan:** `/api/ably/token` dulu memberi capability `album:*: ["subscribe"]` ke SEMUA pengunjung tanpa verifikasi PIN.

| Aspek | Detail |
|-------|--------|
| Fix | `verify.ts` panggil `grantAlbumAccess(cookies, album._id)` setelah PIN sukses → cookie `gallery_pin_session` (HMAC-signed, 24 jam, maks 8 album/browser) |
| Token endpoint | `api/ably/token.ts` hanya beri `album:<id>: ["subscribe"]` jika `hasAlbumAccess()` true |
| Riwayat review (4 putaran, semua ditindaklanjuti) | (1) CodeQL taint-tracking false-positive lama muncul lagi karena pindah sink lokasi → `auth.ts` dikembalikan identik `master`; (2) `Array.isArray()` guard + `getAblyClient` scope tracking; (3) transisi `null→albumId` diizinkan re-authorize; (4) validasi charset `albumId` sebelum masuk capability Ably |
| PR | https://github.com/msph1973/ylx/pull/30 — **MERGED** via `gh pr merge 30 --merge --delete-branch`, merge commit `4475d60` |

---

## PR #32 — Selection Notes & Gallery Link — Review Fix Round (2026-07-10)

PR dibuat user sendiri, berisi fitur selection notes/photographer reply, custom slug, dan share stats. Direview manual, ditemukan 3 bug kritis (fitur diklaim jalan tapi tidak tersambung end-to-end).

| # | Bug | Fix |
|---|-----|-----|
| 1 | `customSlug` tidak pernah dipakai untuk resolusi galeri | `albumBySlugQuery` cocok `slug.current \|\| customSlug`; `lib/slug.ts` dipecah `generateUniqueSlug`+`resolveCustomSlug`; input form ditambah |
| 2 | Notes klien & reply fotografer tak pernah sampai ke UI admin | `albums/[id]/index.ts` GET: tambah field ke interface & mapping |
| 3 | `shareCount`/`lastAccessedAt` field mati | `verify.ts` increment setelah PIN sukses (fail-open) + invalidasi cache list |
| 4 | Notes/reply tanpa batas panjang/validasi tipe | `Rule.max(500)` + validasi tipe di `submit.ts`/`selections/[id].ts` |
| 5 | `selections/[id].ts` PATCH tanpa log error, tanpa invalidasi cache | Tambah `console.error` + `invalidateCache` |

**Temuan deepsource-io (bot review baru):** valid & diperbaiki (async tanpa await, kompleksitas siklomatik tinggi di 3 endpoint diekstrak, `SelectionRow` diekstrak dari `SelectionTable`); beberapa lain false positive (IIFE-global-scope rule, `void` operator) sengaja dibiarkan, sudah didokumentasikan alasannya. `DeepSource: JavaScript` overall check gagal sejak sebelum sesi ini (whole-repo scan, pre-existing).

---

## PR #32 — Fix Semua Temuan CodeRabbit Tersisa (2026-07-10, commit `d91a9cb`)

| # | Temuan CodeRabbit | Fix |
|---|---|---|
| 1 | Race condition uniqueness slug/customSlug (check-then-write 2 langkah terpisah) | Redesign atomik: dokumen `slugLock` dengan `_id` deterministik (`slugLock.<slug>`), `.create()` gagal 409 = primitif reserve anti-race |
| 2 | `selections/[id].ts` — `request.json()` di luar try/catch | Dipindah ke dalam `try` dengan catch 400 rapi |
| 3 | `verify.ts` — update share-stat di-`await` sebelum response, menambah latency | Dipindah ke `waitUntil()` |
| 4 | `SelectionTable.tsx` — state draft balasan level-tabel, klik Reply baris lain hapus draft baris lain | State dipindah lokal per baris ke `SelectionRow.tsx` |
| 5 | `AlbumFormModal.tsx` — normalisasi custom slug tidak rapikan tanda hubung ganda | Tambah `.replace(/-{2,}/g,'-')` + `.replace(/^-+/,'')` |
| 6-7 (nitpick) | Konstanta duplikat (`MAX_TEXT_LENGTH`, `CUSTOM_SLUG_PATTERN`) | Konsolidasi ke `packages/sanity/lib/constants.ts` |

DeepSource dicabut user dari repo pada task ini — tidak lagi jadi bagian review setelahnya.

---

## PR #32 — Cek Review Baru + Testing Langsung ke Preview Sungguhan (2026-07-13)

Devin kirim 1 temuan baru: bug nyata di `PhotoLightbox.tsx` — arrow key saat mengetik catatan foto malah navigasi ke foto lain, hapus draft (fix commit `515a1d8`).

**Testing langsung ke Vercel Preview** menemukan 2 bug nyata yang lolos semua automated check:

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 1 | `shareCount`/`lastAccessedAt` tidak pernah tersimpan di production | `waitUntil()` cuma reliable dengan Fluid Compute aktif (tak bisa diasumsikan) | Commit `58bce86`: kembali ke `await` langsung |
| 2 | Setelah fix #1 masih gagal: `Cannot increment "shareCount" because it is not present` | `sanityWriteClient.create()` tak pernah inisialisasi `shareCount` awal | Commit `ca5ffae`: tambah `.setIfMissing({shareCount:0})` sebelum `.inc()` |

Verifikasi live end-to-end lengkap (custom slug, PIN verify, upload, notes, reply, share stats) — semua fitur PR #32 terkonfirmasi jalan di production, bukan cuma lolos check otomatis.

---

## PR #32 & PR #33 — Merged (2026-07-13)

| PR | Judul | Branch | Merge commit |
|---|---|---|---|
| #32 | Selection Notes & Gallery Link Improvements | `feat/selection-notes-gallery-links` | `faa7ca5` |
| #33 | Install Vercel Web Analytics (dibuat `vercel[bot]`) | `vercel/install-vercel-web-analytics-8a4rhn` | `b44e27b` |

PR #33 sempat draft — ditandai "ready for review" dulu sebelum di-merge; isinya `@vercel/analytics` + `<Analytics />` di `BaseLayout.astro`.

---

## `new-audit.md` — Sinkronisasi + Fix Sisa Temuan L-2 & L-5 (2026-07-13)

Dicek langsung ke kode — M-3, M-4, L-1, L-3, L-4 sudah diperbaiki lewat commit langsung ke `master` (`f255c5d`, `8838910`, `1995646`, `b1a0184`), dan L-6 memang tidak butuh aksi. Hanya **L-2** (CI guard hydration-leak) dan **L-5** (dependency install-script allowlist) yang belum ada — diselesaikan pada task ini.

| # | Temuan | Fix |
|---|---|---|
| L-2 | Tidak ada guard otomatis mencegah prop sensitif (PIN/token/secret) diteruskan ke komponen `client:*` | `apps/web/scripts/check-hydration-leak.mjs` + step baru di `.github/workflows/ci.yml` |
| L-5 | Tidak ada pembatasan paket mana yang boleh menjalankan lifecycle install script | `pnpm-workspace.yaml` `onlyBuiltDependencies: [esbuild, sharp]` |

**Catatan koreksi:** solusi awal `new-audit.md` untuk L-5 (`.npmrc` `enable-pre-post-scripts=false`) **diverifikasi tidak efektif** — diganti `onlyBuiltDependencies` yang terbukti benar-benar memblokir/mengizinkan sesuai daftar.

**Semua 12 temuan `new-audit.md` (M-1 s/d M-4, L-1 s/d L-6) berstatus ✅ FIXED.** File `new-audit.md` sendiri sudah dihapus dari project (2026-07-13).

---

## Diagnosis Junie Review Bot Failure — NO_LICENSE (2026-07-13)

User melapor "Junie is failed! output file path is not set" dari GitHub Actions run. Root cause: `JetBrains/junie-github-action` gagal auth dengan `403 NO_LICENSE — No active JetBrains AI subscription found` untuk `JUNIE_API_KEY` yang dipakai — bukan bug workflow/kode repo. User memilih menangani sendiri rotasi/renewal API key di luar sesi.

---

## `new-audit-2.md` — Full Codebase Audit #2 (2026-07-13)

Full audit codebase (3 subagent paralel — memory leak, backend, frontend) menemukan 11 temuan baru (7 MEDIUM + 4 LOW) di luar cakupan `new-audit.md`. Ditulis ke `new-audit-2.md` sebelum diputuskan mana yang di-fix (lihat PR #34/#35 di `STATUS.md` untuk hasil fix-nya — semua 11 temuan kini ✅ FIXED).
