# YLx — Status & AI Agent Onboarding
> Last updated: 2026-07-19 | PR MERGED: **#19** admin dashboard, **#20** PIN rate-limit, **#21** direct-to-Sanity upload, **#22** Astro 5→6, **#23** impeccable CLI, **#25** junie review workflow, **#26** gallery-upload improvements, **#27** long-term audit improvements (CSP/HSTS + hybrid rendering + Upstash KV cache), **#28** admin login rate-limit (H-1), **#29** session revocation (M-1), **#30** Ably realtime album scoping (M-2), **#32** selection notes & gallery link improvements, **#33** Vercel Web Analytics, **#34** new-audit-2.md findings #1-#8,#10, **#35** new-audit-2.md #9,#11, **#36** mobile-first impeccable (share buttons visible + upload responsive). Semua audit temuan ✅ FIXED. **PR #37** (gallery mobile-first adapt) terbuka, menunggu review/merge.

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

> **Riwayat detail PR #19–#33** + sinkronisasi `new-audit.md` (admin dashboard, rate-limit hardening, direct-to-Sanity upload, impeccable CLI, gallery/upload perf, security audit M-1..L-6, selection notes/gallery link, Vercel Analytics) — semua sudah **MERGED**, sudah baked-in ke codebase saat ini (lihat File Map & Core User Flow). Detail lengkap: `docs/history/STATUS-ARCHIVE.md`. Hanya **4 PR terbaru** (#34–#37) yang masih naratif penuh di bawah — begitu ada PR ke-5 berikutnya, entri PR #34 dipindah ke arsip (rolling window: simpan 4).

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

## PR #37 — Gallery Mobile-First Adapt (2026-07-19, branch `fix/gallery-mobile-adapt`)

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

