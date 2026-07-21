# YLx — Arsip Riwayat PR & Perbaikan

> Ini adalah arsip naratif detail untuk pekerjaan yang sudah **selesai & merged**. `STATUS.md` (root project) adalah satu-satunya sumber kebenaran untuk **kondisi terkini** — file ini murni riwayat historis untuk referensi/audit trail, tidak perlu dibaca di awal setiap sesi.
>
> Struktur: `STATUS.md` menyimpan **4 PR/fix terbaru** sebagai naratif penuh. Saat entri ke-5 ditambahkan, entri paling lama dipindahkan ke sini (rolling window) — bukan dihapus.

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
| Junie unsupported | Junie bukan provider impeccable → hook editor-native dilewati; hanya CLI + config bersama. Install harness `.github/skills\|hooks/` di-`.gitignore` (blok `# impeccable-ignore-start/end`) |
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

---

## PR #34 — Fix `new-audit-2.md` Findings #1-#7 + Bonus #8, #10 (2026-07-16, branch `fix/audit-2-issues`)

Menindaklanjuti full-codebase audit #2 (`new-audit-2.md`, 11 temuan baru ditemukan via 3 subagent paralel — memory leak, backend, frontend). User mengerjakan 7 fix utama sendiri; sesi ini mereview hasilnya, menemukan+memperbaiki 2 bug di dalamnya, lalu commit/push/buka PR.

| # | Temuan | Fix |
|---|---|---|
| 1 | `submit.ts`/`verify.ts` — `request.json()` tanpa try/catch di endpoint publik | Dibungkus try/catch, return 400 rapi |
| 2 | `lock.ts`/`unlock.ts` — `catch {}` kosong total, tanpa logging | Tambah `console.error` sebelum return 500 |
| 3 | `albums/[id]/index.ts` — catch GET/PUT/DELETE tidak log error | Tambah `console.error` + konteks album id di ketiga handler |
| 4 | `finalize.ts` — tidak ada validasi tipe/ukuran file di server | Tambah validasi MIME type + ukuran |
| 5 | `CopyFilenamesButton.tsx` — bypass `useCopyToClipboard`, `setTimeout` tanpa cleanup | Refactor pakai hook, konsisten dengan tombol copy lain |
| 6 | `PhotoLightbox.tsx` — modal galeri klien tanpa focus trap | Terapkan `useFocusTrap` (sudah dipakai admin modal) |
| 7 | `albums.ts`/`albums/[id]/index.ts` — `slugLock` tidak dirilis kalau write album gagal setelah reservasi | Tambah rollback (`releaseSlugLock`) di catch block |
| 8 (bonus) | `ratelimit.ts` — in-memory `Map` fallback tanpa eviction | Tambah periodic sweep |
| 10 (bonus) | `middleware.ts` — prefix CSRF `/api/admin` tanpa trailing slash | Disamakan jadi `/api/admin/` |

**2 bug ditemukan & diperbaiki saat review hasil fix user (sebelum commit):**
- Fix #3 di handler GET awalnya mendeklarasikan `albumId` di dalam blok `try`, sehingga logging baru di `catch` tidak bisa mengakses variabel tsb — `tsc` gagal total (`TS2304`). Diperbaiki: pindahkan deklarasi `albumId` ke luar `try`, sama seperti pola di `PUT`/`DELETE`.
- Fix #4 awalnya tidak menyertakan `image/tiff` di `VALID_MIME_TYPES`, padahal client (`UploadPage.tsx`) sudah mengizinkan upload TIFF — akan mematahkan fitur yang sudah berjalan. Ditambahkan `image/tiff` + `image/x-tiff`.

Temuan **#9** (`UploadPage.tsx` tanpa `AbortController`/unmount-guard) dan **#11** (`cache.ts` fail-open teoretis kalau `fetcher` throw sinkron) **belum** ditangani di PR ini — keduanya prioritas rendah, didokumentasikan sebagai follow-up di `new-audit-2.md`.

`new-audit.md` (audit #1, 12 temuan, semua sudah fixed) dihapus dari project; `new-audit-2.md` (audit #2, 11 temuan) ditambahkan sebagai referensi.

> Verifikasi: `pnpm --filter @ylx/web typecheck/lint --max-warnings 0/test (17/17 vitest)/build` semua pass. Commit `29a1a89` di branch `fix/audit-2-issues`; PR https://github.com/msph1973/ylx/pull/34 → base `master`.

## PR #34 — Bot Review Fixes + Merged (2026-07-16)

Setelah PR #34 dibuka, Sourcery dan CodeRabbit review. Temuan yang diperbaiki:

| Bot | Temuan | Fix (commit `1386617`) |
|-----|--------|---|
| Sourcery | `releaseSlugLock` di catch bisa mask original error | Wrap setiap call dalam try/catch defensif |
| Sourcery | Typo "satupun"→"satu pun", "gaya-nya"→"gayanya" di `new-audit-2.md` | Fixed |
| CodeRabbit | JSON `null` body → 500 di `submit.ts`/`verify.ts` | Tambah structural non-null object check sebelum property access |
| CodeRabbit | `useCopyToClipboard` tidak expose failure state | Hook return `{ copied, error, copy }`; `CopyFilenamesButton` tampilkan "Copy failed" |
| CodeRabbit | Error feedback animation tanpa `useReducedMotion` | Tambah conditional animation (commit `3739ce6`) |

PR merged via squash (`d6b9c6f`).

---

## PR #35 — Fix `new-audit-2.md` Remaining #9, #11 (2026-07-16, branch `fix/audit-2-remaining`)

Dua temuan terakhir dari audit #2 yang belum ditangani di PR #34:

| # | Temuan | Fix (commit `4d1f52e`) |
|---|--------|---|
| 9 | `UploadPage.tsx` — tidak ada unmount guard untuk async setState | Tambah `mountedRef` + guard di `endActivity` callback |
| 11 | `cache.ts` — fail-open contract tidak terjamin kalau fetcher throw sinkron | `await fetcher()` eksplisit; `storeInCache` jadi fire-and-forget pada hard miss |

`new-audit-2.md` header diupdate: "Semua 11 temuan ✅ FIXED".

> Verifikasi: tsc + eslint pass. PR merged via squash (`b4df7dc`). Semua 11 temuan `new-audit-2.md` sekarang selesai.

---

## PR #36 — Mobile-First Impeccable UI (2026-07-16, branch `fix/mobile-first-impeccable`)

User melaporkan **button share link tidak terlihat di mobile** pada admin album detail. Audit menemukan:
- Share actions (Copy Gallery Link, Copy PIN, Lock/Unlock) terletak di bawah metadata grid — di viewport 375px, butuh scroll panjang sebelum terlihat.
- `UploadPage.tsx` tidak punya @media query sama sekali — semua sizing desktop-first.

**Fix:**

| Komponen | Perubahan |
|----------|-----------|
| `AlbumDetail.tsx` | Reorder JSX: share-actions dipindah ke **sebelum** metadata-grid (langsung setelah album header + status hint). Wrap dalam `.detail-body` flex container dengan gap + margin-bottom. |
| `AlbumDetail.tsx` | Mobile margins: tambah `.share-stats`, `.status-hint` ke horizontal margin rule di 480px breakpoint. |
| `AlbumDetail.tsx` | A11y: `focusable="false"` di 4 decorative SVGs dalam share buttons. |
| `UploadPage.tsx` | Tambah `@media (max-width: 480px)`: drop zone padding dikurangi (`space-12`→`space-6`), file list items compact, progress bar flexible (`max-width` bukan fixed `width`), upload stats wrap, file list header stack vertikal. |

**Bot review fixes:**
- Sourcery: ganti fixed `min-width: 70px` / `width: 50px` dengan flexible `max-width` sizing.
- CodeRabbit: tambah `focusable="false"` ke decorative SVGs; restore section spacing via `.detail-body { gap + margin-bottom }`.

> Verifikasi: tsc + eslint pass; semua 10 CI checks pass. PR merged via squash (`1cc54ee`). Tidak ada PR terbuka.

---

## PR #37 — Gallery Mobile-First Adapt — MERGED (2026-07-19, branch `fix/gallery-mobile-adapt`)

Follow-up dari PR #36: audit teknis (dimensi a11y/perf/theming/responsive/anti-pattern) atas rute `/gallery/[slug]` menemukan theming+perf sudah baik, tapi beberapa celah mobile nyata. Fix diterapkan:

| Area | Perubahan |
|------|-----------|
| Safe-area (notch) | `viewport-fit=cover` di `BaseLayout.astro`; `env(safe-area-inset-*)` di header/content (`GalleryLayout.astro`) dan lightbox backdrop (`GalleryPage.tsx`) |
| Thumb-zone | `.gallery-selection-bar` (hitung + submit) dipindah dari atas konten ke `position: fixed` di bawah layar; `.gallery-view`/`.unlock-toast` disesuaikan agar tidak tertutup |
| Lightbox footer | `flex-wrap` + note-input `order`/`flex-basis: 100%` di ≤480px supaya tidak sesak (sebelumnya 4 kontrol sejajar di satu baris) |
| Swipe gesture | `PhotoLightbox.tsx`/`BlurImage.tsx` — touch-based swipe kiri/kanan untuk navigasi foto (mirror tombol panah/keyboard yang sudah ada) |
| PIN autofill | `PinEntry.tsx` — `onPaste` handler sebar 4 digit sekaligus (dari SMS/clipboard) + `autoComplete="one-time-code"` di digit pertama |
| Error feedback | `GalleryPage.tsx` — toast error (dismissible) untuk kegagalan submit selection; sebelumnya gagal kirim di koneksi mobile yang flaky senyap total tanpa feedback ke klien |

> Verifikasi: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run` (17/17), `astro build`, dan detector anti-pattern impeccable (`detect.mjs`) semua pass. Commit `79762ee` (docs housekeeping) + `c05fabe` (fix) di branch `fix/gallery-mobile-adapt`; PR https://github.com/msph1973/ylx/pull/37 → base `master`. Sesuai kebijakan baru di `AGENTS.md` §Git Workflow, commit/push/PR dijalankan otomatis begitu fix selesai & terverifikasi, tanpa menunggu instruksi eksplisit.

**Bot review round 2 (Sourcery + CodeRabbit):**

| Bot | Temuan | Fix |
|-----|--------|-----|
| Sourcery | `PhotoLightbox` swipe handler pakai `touches[0]`/`changedTouches[0]` tanpa guard → gesture multi-jari (pinch-zoom) bisa memicu swipe | Guard `touches.length !== 1` di `handleTouchStart`, `changedTouches.length !== 1` di `handleTouchEnd` (commit `a971f79`, dikerjakan user di agent lain) |
| Sourcery (overall feedback) | Swipe hanya reset di `touchend`, tidak menangani `touchcancel` (gesture terinterupsi — panggilan masuk, gesture nav OS) | Tambah `onTouchCancel` handler di `PhotoLightbox.tsx`/`BlurImage.tsx` yang membersihkan start-point (commit `5f6b9ef`, sesi ini) |
| Sourcery (overall feedback) | `--selection-bar-h` hardcoded, dipakai ulang untuk posisi toast | **Sengaja dilewati** — tinggi 76px stabil untuk elemen fixed-height; refactor `ResizeObserver` dinilai over-engineering |
| CodeRabbit | `GalleryPage` — error toast submit tidak dibersihkan saat submit ulang/unlock, bisa tumpang tindih dengan unlock toast | `setError(null)` di awal `handleSubmit` + saat proses unlock (commit `a971f79`) |
| CodeRabbit | Error toast tidak pakai `safe-area-inset` horizontal (landscape notch) | Disamakan dengan selection bar: `max(var(--space-4), env(safe-area-inset-*))` (commit `a971f79`) |
| CodeRabbit | `PinEntry.handlePaste` tidak membersihkan slot lama sebelum isi kode pendek → sisa digit basi | `next = ['', '', '', '']` sebelum diisi (commit `a971f79`) |
| CodeRabbit | `PinEntry.handleChange` OTP autofill lewat satu event `change` cuma menyimpan karakter terakhir | Deteksi `value.length > 1`, sebar digit ke box berikutnya + 2 regression test baru (commit `a971f79`) |
| CodeRabbit | Pipe (`\|`) di tabel Markdown `STATUS-ARCHIVE.md` merusak rendering | Diganti jadi 2 path terpisah (commit `a971f79`) |
| CodeRabbit | Kebijakan rolling-window beda angka antara `STATUS.md` (~3) dan arsip (~3) vs isi aktual (4 PR) | Disamakan eksplisit jadi "4 PR terbaru" di kedua file (commit `a971f79`) |

> Semua temuan bot round 2 sudah ✅ FIXED. Commit `a971f79` (oleh user, agent lain) + `5f6b9ef` (touchcancel, sesi ini). `tsc`/`eslint --max-warnings 0`/`vitest run` (19/19)/`astro build` semua pass.

**Remaining impeccable commands (critique/optimize/onboard/harden gallery + audit admin bonus):**

Melanjutkan rekomendasi command yang belum dijalankan (`audit`/`adapt` sudah selesai sebelumnya). Detector anti-pattern (`detect.mjs`) bersih di gallery & admin sebelum dan sesudah perubahan. Temuan manual (design review + heuristik) dan fix:

| Temuan | Fix |
|---|---|
| Grid galeri tanpa foto tampil kosong total tanpa pesan (onboarding gap) | State kosong baru: "No photos yet" + penjelasan |
| Tidak ada instruksi first-run di atas grid | Baris teks singkat "Tap a photo to preview it, then select up to N" |
| Menekan foto saat sudah di batas maksimal diam-diam tidak berefek (terlihat seperti bug) | Toast info baru "You've reached the limit of N photos..." (berlaku baik dari grid maupun lightbox, sumber logic sama) |
| Submit foto langsung mengunci galeri tanpa konfirmasi, padahal aksi tidak bisa dibatalkan sendiri oleh klien | Tap pertama mengarmed konfirmasi ("Selections are final... Send now?" + tombol Cancel), tap kedua baru benar-benar submit (auto-batal setelah 5 detik) |
| PIN salah menyisakan 4 digit terisi — klien harus hapus manual sebelum mencoba lagi | Digit otomatis dikosongkan + fokus kembali ke kotak pertama saat error muncul |
| Error jaringan (`fetch` gagal total) menampilkan pesan teknis mentah ("Failed to fetch") | Pesan ramah: "Could not connect. Please check your internet connection and try again." |
| Semua foto grid dimuat `loading=lazy` termasuk baris pertama yang langsung terlihat (memperlambat LCP) | 4 foto pertama (baris atas layar) dimuat `eager`, sisanya tetap `lazy` |
| **Audit admin (bonus)** — `SelectionTable`/`AlbumCard` | Tidak ada temuan kritis: tabel sudah scroll horizontal di ≤480px, kartu album sudah full-width responsive. Tombol reply kecil (32px) di bawah AAA (44px) tapi masih lolos AA (24px) — dibiarkan, tidak worth tambahan kompleksitas untuk backoffice density |

> Verifikasi: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run` (19/19), `astro build`, dan `detect.mjs` (gallery + admin) semua pass. `critique`/`polish` command formal (skoring heuristik 10-poin + laporan penuh) tidak dijalankan sebagai command terpisah — browser automation tidak tersedia di sesi ini (headless), jadi temuan digabung langsung ke fix di atas alih-alih laporan skor terpisah.

**Kebijakan baru: verifikasi manual/browser via Vercel Preview Deployment (2026-07-19):**

Karena app jalan di Vercel Serverless, `astro dev` lokal berbeda perilaku (middleware dev-only, tidak ada cold-start serverless nyata, header cache/edge berbeda) — bisa menyembunyikan bug yang cuma muncul setelah deploy. `AGENTS.md` §"Manual/Browser Verification" baru mewajibkan: prioritaskan testing di URL Vercel Preview Deployment milik branch/PR (auto-di-comment bot Vercel di PR, pola `https://ylx-git-<branch>-msph.vercel.app`) begitu status check `Vercel` = `Ready`/`SUCCESS`, dev lokal tetap boleh untuk iterasi cepat saat menulis kode. Diverifikasi: preview PR #37 (`ylx-git-fix-gallery-mobile-adapt-msph.vercel.app`) aktif, `/` dan `/admin/login` HTTP 200. Commit `574fae3` (doc-only, di branch/PR yang sama).

> **PR #37 merged** via squash ke `master`, tidak ada review manusia yang menahan (hanya komentar bot, semua sudah ditindaklanjuti), semua 9 CI check hijau.

---

## PR #38 — UI/UX Audit P1/P2 Fixes: Landing, Login, Admin Dashboard, Upload — MERGED (2026-07-19, branch `fix/ui-audit-p1-p2`)

Follow-up dari PR #37: audit teknis 5-dimensi (a11y/perf/theming/responsive/anti-pattern) via 3 subagent paralel atas 3 area yang belum pernah diaudit — landing (`index.astro`) + login (`admin/login.astro`), dashboard admin (`admin/index.astro`+`AlbumCard`+`AlbumFormModal`), dan detail-album/upload (`AlbumDetail.tsx`+`UploadPage.tsx`). Skor: 15/20, 16/20, 13/20 — tidak ada P0. Semua temuan P1 + P2 yang layak dieksekusi diperbaiki:

| Area | Perbaikan |
|------|-----------|
| `admin/login.astro` | Kontras placeholder AA (hapus override lokal `opacity:0.6`), `autocomplete` email/password, landmark `<main>`, focus ring pakai token `--color-accent-ring` baru |
| `index.astro` | Focus ring disamakan dengan login; input+tombol "Open" stack di ≤360px |
| `BaseLayout.astro` | Trim 2 weight Playfair Display yang tidak dipakai (400/500) — kurangi request font render-blocking |
| `UploadPage.tsx` | ARIA `role="progressbar"` di progress bar per-file (sebelumnya cuma progress bar total yang punya ARIA); throttle update progress state supaya tidak re-render seluruh daftar file di tiap tick |
| `AlbumFormModal.tsx`/`ConfirmDialog.tsx`/`AlbumList.tsx` | `z-index` hardcoded (50/60/10) diganti token `--z-modal`/`--z-dropdown` — modal berpotensi tertutup header sticky admin (`z-index:200`) |
| `AlbumFormModal.tsx` | `aria-labelledby` mengikuti `<h2>` asli (sebelumnya `aria-label` literal beda teks) |
| `AlbumCard.tsx`/`AlbumDetail.tsx` | Kontras badge status "submitted" dipertajam (18%→12% tint, sama bug di 2 file); animasi spring under-damped diredam (`damping` dinaikkan ke nilai kritis) |
| `AlbumDetail.tsx` | Hardcoded `44px` diganti token `--tap-target-min` (4 lokasi) |

**Sengaja dilewati (didokumentasikan, bukan bug):** menyembunyikan tombol reorder foto di balik mode eksplisit (opini subjektif UX, tombol panah sudah berfungsi+berlabel), dan pesan fallback untuk drag HTML5 yang tak berfungsi di touch (alasan sama, tombol panah sudah menutupi) — dituntaskan belakangan di PR #40.

> Verifikasi: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run` (19/19), `astro build`, dan `detect.mjs` semua pass. Commit `7a1e3b9` di branch `fix/ui-audit-p1-p2`; PR https://github.com/msph1973/ylx/pull/38 → base `master`.

**Bot review round (CodeRabbit):**

| Temuan | Fix (commit `9eb9b69`) |
|---|---|
| `AlbumFormModal.tsx` — spring physics (`stiffness`/`damping`) selalu override `duration`, jadi `duration:0` untuk `prefers-reduced-motion` diam-diam diabaikan (animasi tetap berjalan) | Branch eksplisit: `{ duration: 0 }` (tween) saat reduced motion, spring config hanya dipakai kalau tidak |
| `UploadPage.tsx` — ikon centang selesai upload cuma `aria-label` di `<span>` generik, tidak konsisten terekspos ke assistive tech | Tambah `role="img"` |

> Ditunggu hingga tidak ada review/komentar baru pasca-fix (semua 10 CI check + review bot pass, `mergeStateStatus: CLEAN`), lalu **PR #38 merged** via squash ke `master` (`a1d72b9`).

---

## PR #40 — Mode Reorder Foto Eksplisit + Pesan Fallback Touch — MERGED (branch `fix/photo-reorder-touch-mode`)

Menuntaskan 2 temuan yang sengaja ditunda di PR #38 (`AlbumDetail.tsx`): tombol panah reorder selalu tampil di setiap foto (padahal HTML5 drag-and-drop tidak berfungsi di layar sentuh tanpa pesan penjelasan apapun).

| Perubahan | Detail |
|-----------|--------|
| Mode "Reorder photos" baru | Toggle terpisah dari "Select photos" (saling eksklusif); tombol panah ↑/↓ dan drag-and-drop kini hanya tampil/aktif saat mode ini diaktifkan — tile foto default jadi lebih ringkas |
| Pesan bantuan touch | Saat mode reorder aktif, teks "Drag isn't supported on touchscreens — use the ↑/↓ buttons..." muncul khusus di perangkat `pointer: coarse` (CSS media query, tidak render di desktop) |
| Tombol hapus foto | Disembunyikan juga selama mode reorder aktif (konsisten dengan pola mode selection yang sudah ada) |

**Bot review (Junie automated review — `github-actions[bot]`):**

| Temuan | Fix |
|---|---|
| Tombol "Reorder photos"/"Done reordering" hilang kalau jumlah foto turun jadi 1 saat mode reorder aktif (mis. via tab lain) — pengguna terjebak tanpa cara keluar | Guard tombol ditambah `\|\| photoReorderMode` supaya tetap tampil |
| Prop `disabled` di kedua tombol toggle membuat cabang peralihan mode di `onClick` masing-masing jadi tidak pernah tercapai | `disabled` dihapus — kedua handler sudah membersihkan state mode lain dengan benar, jadi peralihan langsung kini benar-benar berfungsi |
| Tile foto tetap bisa mulai drag saat `isSavingOrder` (permintaan reorder sebelumnya masih diproses) — berisiko permintaan reorder tumpang tindih | `draggable`/`onDragStart` ditambah guard `!isSavingOrder` |

> Verifikasi: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run` (19/19), `astro build`, dan `detect.mjs` semua pass. **PR #40 merged** via squash ke `master` (`35ff157`).

---
