# YLx — Status & AI Agent Onboarding
> Last updated: 2026-08-04 | PR MERGED: #19–#52, #54–#65, #67, #69–#71, #73, #75–#77, #79–#87 (#68, #74, #78 closed/superseded) — lihat tabel pointer di bawah. PR #79 (mobile reorder + keyboard-safe notes + notes clamp) merged & diverifikasi langsung di produksi 2026-08-02 (album baru + upload foto + full lifecycle test). PR #81–#87: audit penuh codebase (2026-08-02) dikerjakan 7 subagent paralel di 7 branch terpisah, direview independen, dibandingkan dengan bot review, di-follow-up 2 ronde. **2026-08-04: SEMUA 7 PR (#81–#87) sudah MERGED ke master** (satu konflik nyata diselesaikan manual — `submit.ts`/`admin/albums.ts`, PR #86 vs PR #83, menggabungkan kedua perbaikan bukan menimpa salah satu; PR #81 ditambah 1 ronde fix lagi — `ifRevisionID` guard cross-process race — sebelum di-merge terakhir). Vercel Production deployment untuk commit merge final (`de053c6`) **success**. PR #88 (OPEN): kalender date-picker kustom untuk Event Date (ganti `<input type="date">` native) di `AlbumFormModal`. Full narratives: `~/.junie/tasks/`.

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

> **Riwayat detail PR #19–#40** + sinkronisasi `new-audit.md` (admin dashboard, rate-limit hardening, direct-to-Sanity upload, impeccable CLI, gallery/upload perf, security audit M-1..L-6, selection notes/gallery link, Vercel Analytics) — semua sudah **MERGED**, sudah baked-in ke codebase saat ini (lihat File Map & Core User Flow). `docs/history/STATUS-ARCHIVE.md` **dibekukan** per PR #40 — tidak ada entri baru di sana. Narasi PR #41 dan seterusnya ada di `~/.junie/tasks/` (lokal, lihat tabel di bawah).

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

> Audit keamanan 2026-07-02 (C1/C2/C3/H3+M1) + threat model 2026-07-10 (H-1) selesai. Realtime browser auth via `/api/ably/token` (subscribe-only). Read Sanity server-side pakai `SANITY_API_TOKEN` (dataset private). Playwright e2e admin fixture: doc `playwright-admin` di-seed idempotent via `apps/web/scripts/seed-e2e-admin.mjs` ke dataset `test` (job `e2e` di CI menjalankannya sebelum Playwright).
>
> Detail lengkap tiap fix (root cause, commit, PR, riwayat review bot): `docs/history/STATUS-ARCHIVE.md` (s.d. PR #40, dibekukan) atau `~/.junie/tasks/` (PR #41 dan seterusnya, lokal).

---

## Infrastruktur Dev (VPS)

| Tool | Detail |
|------|--------|
| Junie MCP servers | playwright, filesystem, sequential-thinking, memory, context7, github, kernel, linear, sanity (9 aktif) |
| Vercel token | `~/.local/share/com.vercel.cli/auth.json` |
| Kernel browser | `agent-browser -p kernel` + `KERNEL_API_KEY` di `~/.bashrc` |
| Linear team | `Ylx` | ID: `bc11a289-8943-48bc-9679-87557d86ea0e` |
| Sanity project | `741sif2l` / dataset `production` (**private** sejak 2026-07-02); dataset `test` (**public**, dummy e2e saja — plan tidak mendukung private kedua) |

---

## Known Stubs / Not Implemented

| Item | File | Status |
|------|------|--------|
| Gallery E2E (Playwright) | `apps/web/tests/gallery.spec.ts` | ✅ Refreshed ke selektor lightbox+LQIP (PR #17), 5/5 pass; jalan di CI (job `e2e` di `ci.yml`) |
| Admin E2E (Playwright) | `apps/web/tests/admin.spec.ts` | ✅ 4/4 pass. Signed-session helper `tests/helpers/adminSession.ts` + doc Sanity `playwright-admin` (seed: `apps/web/scripts/seed-e2e-admin.mjs`, dataset `test`); route API di-mock via `page.route`. Jalan di CI (job `e2e`). Meliputi: pagination, bulk photo delete, reorder (keyboard), lock/unlock |
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
| `AGENTS.md` | Operating rules & session protocol (arsitektur, git workflow, skills, memory — termasuk referensi ke `~/.junie/memory/system` cross-agent memory bank) |
| `new-audit.md` | Riwayat temuan security audit — semua (M-1 s/d L-6) sudah ✅ FIXED (file sudah dihapus, riwayat lengkap di `docs/history/STATUS-ARCHIVE.md`) |
| `docs/history/STATUS-ARCHIVE.md` | Full-codebase audit #2 (2026-07-13) — 11 temuan baru, semua ✅ FIXED (PR #34 + #35, merged; `new-audit-2.md` sudah dihapus, riwayat lengkap di sini) |
| `~/.junie/tasks/README.md` | Konvensi penyimpanan narasi task/PR lokal (di luar repo, tidak ter-push) — mulai PR #41 |
| `~/.junie/memory/system/ylx/overview.md` | Cross-agent memory bank (juga dipakai agent lain di luar Junie, mis. Letta Code — `.letta/`) — index ke conventions/gotchas/tooling/architecture; auto-generated, tetap menganggap `STATUS.md`/`AGENTS.md` sebagai sumber kebenaran, jangan diedit manual dari sesi Junie |

> `CONTEXT.md` sudah sangat outdated — jangan jadikan referensi utama. Gunakan `STATUS.md` ini.

---

## Riwayat Task/PR — Sekarang Disimpan Lokal (`~/.junie/tasks/`)

Mulai 2026-07-21, narasi lengkap tiap task/PR (root cause, perubahan kode, ronde review bot, verifikasi) **tidak lagi ditulis di sini** — pindah ke `~/.junie/tasks/` (di luar repo project, tidak pernah ter-commit/ter-push/ter-review PR). Lihat `~/.junie/tasks/README.md` untuk konvensinya. `docs/history/STATUS-ARCHIVE.md` **dibekukan** per PR #40 (tidak ada entri baru).

| PR | Judul | Status | File lokal |
|----|-------|--------|-----------|
| #37 | Gallery mobile-first adapt | MERGED | `~/.junie/tasks/PR-37-gallery-mobile-adapt.md` |
| #38 | UI/UX audit P1/P2 (landing/login/dashboard/upload) | MERGED | `~/.junie/tasks/PR-38-ui-audit-p1-p2.md` |
| #40 | Mode reorder foto eksplisit + fallback touch | MERGED | `~/.junie/tasks/PR-40-photo-reorder-touch-mode.md` |
| #41 | CSP connect-src fix (*.ably.net) | MERGED | `~/.junie/tasks/PR-41-csp-ably.md` |
| #43 | Resize foto client-side sebelum upload | MERGED | `~/.junie/tasks/PR-43-upload-resize.md` |
| #44 | Cross-agent memory bank guardrail | MERGED | `~/.junie/tasks/PR-44-memory-bank.md` |
| #45 | Tooling config (code-review-graph/Letta/opencode) | MERGED | `~/.junie/tasks/PR-45-tooling-config.md` |
| #46 | Pindahkan narasi task/PR ke `~/.junie/tasks/` | MERGED | `~/.junie/tasks/PR-46-task-memory-reorg.md` |
| #47 | Sync STATUS.md (doc-only, tandai #43 merged) | MERGED | `~/.junie/tasks/PR-47-status-sync.md` |
| #48 | REVIEW.md accuracy pass + z-index token rule | MERGED | `~/.junie/tasks/PR-48-review-md-accuracy.md` |
| #49 | Sync STATUS.md (doc-only, tandai #48 merged) | MERGED | `~/.junie/tasks/PR-49-status-sync.md` |
| #50 | Audit #3: 7 temuan valid diperbaiki (Ably leak, CSRF, cache health, upload race/backoff/creds/mountedRef) | MERGED | `~/.junie/tasks/PR-50-audit3-valid-findings.md` |
| #51 | Sync STATUS.md (doc-only, tandai #50 merged) | MERGED | `~/.junie/tasks/PR-51-status-sync.md` |
| #52 | Fix lightbox backdrop fade-in (teks halaman tembus sesaat) | MERGED | `~/.junie/tasks/PR-52-lightbox-backdrop-fade.md` |
| #53 | Skrip E2E `browser-act` untuk alur inti galeri (dibatalkan, tidak jadi dipakai) | CLOSED (tidak di-merge) | `~/.junie/tasks/PR-53-e2e-browseract.md` |
| #54 | Fix toast text contrast fails WCAG AA | MERGED | `~/.junie/tasks/PR-54-toast-contrast.md` |
| #55 | Fix mobile UX: safe-area, hover guards, font-size, toast overflow | MERGED | `~/.junie/tasks/PR-55-mobile-ux.md` |
| #56 | Perf: React.memo on BlurImage and AlbumCard | MERGED | `~/.junie/tasks/PR-56-perf-memo.md` |
| #57 | Perf: misc improvements (preconnect, decoding, content-visibility, client:idle) | MERGED | `~/.junie/tasks/PR-57-perf-misc.md` |
| #58 | Fix STATUS.md pointer row PR #53 (salah tercatat sebagai merged doc-sync) + koreksi klaim "semua audit fixed" | MERGED | — (doc-only, tanpa file narasi terpisah) |
| #59 | Audit Tier 1: validasi panjang minimum password (min 8 char, Unicode-safe) | MERGED | `~/.junie/tasks/PR-59-64-audit-tier123.md` |
| #60 | Audit Tier 1: lazy-load `PhotoLightbox` + error boundary | MERGED | `~/.junie/tasks/PR-59-64-audit-tier123.md` |
| #61 | Audit Tier 1: `BlurImage`/LQIP di grid foto admin | MERGED | `~/.junie/tasks/PR-59-64-audit-tier123.md` |
| #62 | Audit Tier 2: dynamic import Ably SDK | MERGED | `~/.junie/tasks/PR-59-64-audit-tier123.md` |
| #63 | Audit Tier 2: cache `verify.ts` album fetch (TTL 30s + invalidasi `customSlug`) | MERGED | `~/.junie/tasks/PR-59-64-audit-tier123.md` |
| #64 | Audit Tier 3: `UploadPage` pakai `filesRef` (hindari re-buka bug album-race PR #50) | MERGED | `~/.junie/tasks/PR-59-64-audit-tier123.md` |
| #65 | Config: exclude `docs/`/`.junie/`/`.bob/`/`.mimocode/` dari bot review (root cause: PR #63 sempat bawa file noise) | MERGED | `~/.junie/tasks/PR-65-bot-review-ignore-paths.md` |
| #67 | Fix 4 lint pre-existing `consistent-type-imports` di `gallery.spec.ts`/`upload.spec.ts` | MERGED | `~/.junie/tasks/PR-67-lint-type-imports.md` |
| #68 | Chore: hapus `new-audit-2.md` obsolete + sync referensi STATUS.md | CLOSED (superseded oleh #69, commit ikut ter-merge di sana) | `~/.junie/tasks/PR-68-71-sprint1.md` |
| #69 | CI: job `e2e` Playwright (13 tes, dataset Sanity `test` + seed `playwright-admin`, token scoped per-step, permissions least-privilege, guard fork/Dependabot) | MERGED | `~/.junie/tasks/PR-68-71-sprint1.md` |
| #70 | Realtime: `publish()` Ably di-await + Rest singleton + error log; invalidate cache sebelum publish (race stale-refetch); `Promise.all` multi-publish | MERGED | `~/.junie/tasks/PR-68-71-sprint1.md` |
| #71 | Ekspor fleksibel: `selectionExport.ts` (comma/per-line/CSV `filename,notes` RFC 4180 + guard formula injection) + format select di `CopyFilenamesButton` | MERGED | `~/.junie/tasks/PR-68-71-sprint1.md` |
| #73 | Galeri: autosave draft pilihan (localStorage, sanitasi + expiry 24 jam) + resume session tanpa PIN (`GET /api/gallery/[slug]/session`, timeout AbortController) | MERGED | `~/.junie/tasks/PR-73-74-sprint2.md` |
| #74 | Dashboard: progres pilihan live (`PUT/POST /api/gallery/[slug]/draft` count-only → Redis 24h + event `draft:progress`; progress bar + badge di `AlbumCard`; revisi `lastUnlockedAt`; refetch coalesced) | CLOSED (tidak di-merge, digantikan #77) | `~/.junie/tasks/PR-73-74-sprint2.md` |
| #75 | Ponytail shrink: inline format helpers, dict dispatch, `??=` singleton | MERGED | `~/.junie/tasks/PR-75-ponytail-shrink-sprint1.md` |
| #76 | Chore: `cubic.yaml` custom instructions/rules | MERGED | — (doc/config-only) |
| #77 | Admin: live client selection progress on dashboard (Redis draft sync) | MERGED | `~/.junie/tasks/PR-77-audit-reorder-notes.md` |
| #78 | Fix: restore cherry-pick losses — draft progress in albums list | CLOSED (tidak di-merge) | — |
| #79 | Mobile: touch reorder (⠿ handle + tombol naik/turun, no reload per move), notes keyboard-safe (visualViewport inset), admin notes clamp 2-baris + Show more/less | MERGED — diverifikasi langsung di produksi (album baru + upload 3 foto + full lifecycle test) | `~/.junie/tasks/PR-79-mobile-reorder-notes-polish.md` |
| #80 | Sync STATUS.md (doc-only, pointer table PR #73-#79 + PR #79 merged/verified in prod) | MERGED | — (doc-only, tanpa file narasi terpisah) |
| #81 | Audit fix: `scripts/upload.py` — critical `NameError`, watchdog import crash, thread-safety, HTTP client langsung (ganti package Python palsu), MIME asli, retry 409/429 + GROQ param JSON-encoded + `ifRevisionID` guard (race-condition upload paralel, termasuk lintas-proses) | MERGED | `~/.junie/tasks/AUDIT-2026-08-02-fixes-PR81-87.md` |
| #82 | Audit fix: lib session/cache hardening — `auth.ts` fail-closed, Upstash fetch timeout, cache stampede hard-miss dedup, EXIF selalu di-strip, worker idle-terminate, realtime hook `.catch()` | MERGED | `~/.junie/tasks/AUDIT-2026-08-02-fixes-PR81-87.md` |
| #83 | Audit fix: Sanity PIN/session security — token read/write terpisah, Studio env vars, `pin` keluar dari query yang di-cache, `gallerySession` diikat PIN hash (`hasValidPinSession`) | MERGED | `~/.junie/tasks/AUDIT-2026-08-02-fixes-PR81-87.md` |
| #84 | Audit fix: `GalleryPage` — pesan error server asli (429/403/404), updater `setSelectedPhotos` impure diperbaiki, guard submit ganda, URL galeri di-paste tidak di-slugify karakter demi karakter (termasuk skema URI custom) | MERGED | `~/.junie/tasks/AUDIT-2026-08-02-fixes-PR81-87.md` |
| #85 | Audit fix: CI/config hardening — timeout+concurrency workflow (key per-PR), pin action ke SHA, dependency hygiene, `check-hydration-leak.mjs` escape-aware, `vercel.json` region+header | MERGED | `~/.junie/tasks/AUDIT-2026-08-02-fixes-PR81-87.md` |
| #86 | Audit fix: API validation — body type/format checks (albums), `isValidCalendarDate`, urutan cache-invalidate sebelum publish event (finalize), `submit.ts` gate sesi sebelum status (digabung manual dgn fix PIN #83 saat merge conflict) | MERGED | `~/.junie/tasks/AUDIT-2026-08-02-fixes-PR81-87.md` |
| #87 | Audit fix: admin UI bugs — `AlbumFormModal` reset effect, `formatDate` timezone + rollover-date guard, `AdminPage` remount berlebihan (+ refetch fallback), `UploadPage` upload-safety, a11y tablist→button | MERGED | `~/.junie/tasks/AUDIT-2026-08-02-fixes-PR81-87.md` |
| #88 | Feat: kalender date-picker kustom untuk Event Date di AlbumFormModal (ganti `<input type="date">` native, larangan tanggal lampau tetap dipertahankan + kini terlihat visual di grid) | OPEN | `~/.junie/tasks/PR-88-calendar-date-picker.md` |

> Catatan: file-file di atas cuma ada di mesin/sandbox ini — kalau environment berpindah, salinan lokal ini tidak ikut. Baris header `STATUS.md` (ringkasan 1-baris per PR) + riwayat PR di GitHub jadi jaring pengaman kalau itu terjadi.
