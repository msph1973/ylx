# YLx — Status & AI Agent Onboarding
> Last updated: 2026-07-20 | PR MERGED: **#19** admin dashboard, **#20** PIN rate-limit, **#21** direct-to-Sanity upload, **#22** Astro 5→6, **#23** impeccable CLI, **#25** junie review workflow, **#26** gallery-upload improvements, **#27** long-term audit improvements (CSP/HSTS + hybrid rendering + Upstash KV cache), **#28** admin login rate-limit (H-1), **#29** session revocation (M-1), **#30** Ably realtime album scoping (M-2), **#32** selection notes & gallery link improvements, **#33** Vercel Web Analytics, **#34** new-audit-2.md findings #1-#8,#10, **#35** new-audit-2.md #9,#11, **#36** mobile-first impeccable (share buttons visible + upload responsive), **#37** gallery mobile-first adapt, **#38** UI/UX audit P1/P2 (landing/login/dashboard/upload), **#40** mode reorder foto eksplisit + fallback touch, **#41** CSP connect-src fix (*.ably.net), **#42** doc sync. Semua audit temuan ✅ FIXED. **PR #43** (resize foto client-side sebelum upload) menunggu review/merge.

Baca file ini pertama kali sebelum file lain. Ini adalah satu-satunya sumber kebenaran tentang kondisi project saat ini.

---

## Platform

| Item | Value |
|------|-------|
| Production URL | https://ylx-msph.vercel.app (custom domain `ylex.my.id` juga aktif dipakai, proxy ke URL Vercel di atas) |
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
Photographer uploads photos     ✅  UploadPage.tsx — direct-to-Sanity (lewati 4.5MB Vercel), paralel 3x + auto-retry, resize client-side (Web Worker) sebelum kirim
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

> **Riwayat detail PR #19–#37** + sinkronisasi `new-audit.md` (admin dashboard, rate-limit hardening, direct-to-Sanity upload, impeccable CLI, gallery/upload perf, security audit M-1..L-6, selection notes/gallery link, Vercel Analytics) — semua sudah **MERGED**, sudah baked-in ke codebase saat ini (lihat File Map & Core User Flow). Detail lengkap: `docs/history/STATUS-ARCHIVE.md`. Hanya **4 PR terbaru dengan narasi penuh** (#38, #40, #41, #43 — #39/#42 doc-only STATUS.md sync, tidak punya section terpisah) yang masih tercantum di bawah — begitu ada PR ke-5 berikutnya, entri PR #38 dipindah ke arsip (rolling window: simpan 4).

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

> Audit keamanan 2026-07-02 (C1/C2/C3/H3+M1) + threat model 2026-07-10 (H-1) selesai. Realtime browser auth via `/api/ably/token` (subscribe-only). Read Sanity server-side pakai `SANITY_API_TOKEN` (dataset private). Known gap: Playwright e2e admin fixture (`tests/helpers/adminSession.ts`) pakai cookie palsu tanpa doc Sanity asli — akan ditolak `getSession()` sampai ada fixture seed nyata (di luar scope, didokumentasikan di helper).
>
> Detail lengkap tiap fix (root cause, commit, PR, riwayat review bot): `docs/history/STATUS-ARCHIVE.md`.

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
| `new-audit.md` | Riwayat temuan security audit — semua (M-1 s/d L-6) sudah ✅ FIXED (file sudah dihapus, riwayat lengkap di `docs/history/STATUS-ARCHIVE.md`) |
| `new-audit-2.md` | Full-codebase audit #2 (2026-07-13) — 11 temuan baru, semua ✅ FIXED (PR #34 + #35, merged) |

> `CONTEXT.md` sudah sangat outdated — jangan jadikan referensi utama. Gunakan `STATUS.md` ini.

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

**Sengaja dilewati (didokumentasikan, bukan bug):** menyembunyikan tombol reorder foto di balik mode eksplisit (opini subjektif UX, tombol panah sudah berfungsi+berlabel), dan pesan fallback untuk drag HTML5 yang tak berfungsi di touch (alasan sama, tombol panah sudah menutupi).

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

## PR #41 — Fix CSP `connect-src` Blokir Ably Realtime (`*.ably.net`) — MERGED (2026-07-19, branch `fix/csp-ably-realtime`)

User melaporkan console Firefox di production menunjukkan CSP `connect-src` violation yang memblokir `main.realtime.ably.net` (requestToken XHR + websocket upgrade). Root cause: `connect-src` cuma mengizinkan `*.ably.io`/`*.ably-realtime.com` — ably-js (2.23.0) pakai host utama di domain `*.ably.net` yang tidak pernah masuk allowlist, jadi koneksi realtime utama selalu CSP-blocked dan tiap klien terpaksa jatuh ke fallback host yang lebih lambat (`*.a.fallback.ably-realtime.com`, kebetulan sudah diizinkan — makanya realtime tetap jalan tapi lebih lambat + console penuh error).

**Fix:** tambah `https://*.ably.net wss://*.ably.net` ke `connect-src` di `securityHeaders.ts` (SSR middleware) **dan** `vercel.json` (halaman prerender) — dijaga tetap identik oleh drift-guard test yang sudah ada.

**Item console lain yang dicek (tidak perlu tindakan):**

| Temuan | Alasan aman diabaikan |
|---|---|
| `-moz-osx-font-smoothing` "unknown property" | Snippet font-smoothing standar lintas-browser di `global.css`; Firefox hanya kenali properti ini di build macOS — warning kosmetik yang sama muncul di hampir semua situs (mis. Tailwind preflight) |
| "Rule set diabaikan karena selector salah" | Rule `::-webkit-scrollbar` di `global.css`; Firefox memang tidak dukung pseudo-element scrollbar vendor-prefixed ini (pakai `scrollbar-width`/`scrollbar-color`), diabaikan secara aman |
| `_vercel/insights/script.js` gagal dimuat | Same-origin, sudah tercakup `script-src 'self'`; biasa disebabkan ad-blocker browser yang memblokir path script analytics dikenal, bukan masalah CSP/app — `@vercel/analytics` didesain gagal diam-diam |

> Verifikasi: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run` (19/19, termasuk drift-guard test CSP/vercel.json), `astro build` semua pass. PR https://github.com/msph1973/ylx/pull/41 → base `master`, merged squash (`64229392`).

---

## PR #43 — Resize/Compress Foto Client-Side Sebelum Upload (branch `fix/upload-image-resize`)

User melaporkan upload 5 foto sekaligus terasa lama tanpa progres pasti. Diagnosis: upload memang direct-to-Sanity (dibatasi bandwidth upload klien, bukan server), tapi foto asli (sampai 50MB, termasuk TIFF/PNG) dikirim tanpa resize sama sekali — bottleneck nyata untuk galeri *proofing* yang tidak butuh resolusi penuh (lihat juga diskusi storage sebelumnya). Riset best-practice bulk-upload menambahkan 1 requirement: proses resize harus di luar main thread (Web Worker) supaya tidak macet saat beberapa foto besar diproses bersamaan.

| Perubahan | Detail |
|-----------|--------|
| `lib/imageResize.ts` (baru) | Fungsi murni `resizeImageForUpload()` — skip TIFF/PNG-non-berukuran-besar tanpa decode; decode via `createImageBitmap(file, { imageOrientation: 'from-image' })` (hormati EXIF orientation); skip re-encode jika sudah ≤2500px kedua sisi; downscale ke long-edge 2500px, JPEG/WebP quality 0.85; fallback ke file asli kalau hasil tidak lebih kecil atau proses gagal (tidak pernah throw) |
| `lib/imageResize.worker.ts` (baru) | Web Worker tipis yang membungkus `resizeImageForUpload()` via `postMessage`/`onmessage`, correlate by `id` |
| `lib/imageResizeClient.ts` (baru) | Client wrapper: 1 worker persisten (lazy-created) untuk seluruh siklus hidup app — resize CPU-bound jauh lebih cepat dari upload network-bound, jadi 1 worker cukup mengimbangi concurrency upload (3) tanpa perlu worker pool; timeout 30s fallback ke file asli kalau worker tidak pernah merespons |
| `UploadPage.tsx` | `uploadWithRetry` memanggil resize (status `'resizing'` baru) sebelum percobaan upload pertama; progress bar agregat diubah dari basis "jumlah file selesai" ke basis **byte yang benar-benar terkirim** (`loadedUploadBytes / totalUploadBytes`) — sebelumnya bar bisa diam lama lalu melompat kalau beberapa file besar diupload bersamaan |

**Tidak diterapkan (dipertimbangkan, ditolak by design):** upload resumable/chunked (tus dll.) — berlebihan untuk file ≤50MB yang makin kecil setelah resize; kompleksitas protokol tidak sepadan di skala ini.

> Verifikasi: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run` (28/28, termasuk 15 test baru untuk `imageResize`/`imageResizeClient`), `astro build` (dikonfirmasi worker ter-bundle sebagai chunk terpisah) semua pass.

