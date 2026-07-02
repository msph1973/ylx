# YLx — Status & AI Agent Onboarding
> Last updated: 2026-07-02 | Branch: `master`

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
| Frontend | Astro 5 + React 18 | Island architecture, `client:load` |
| CMS + DB | Sanity v4 | Semua data di Sanity, **tidak ada Prisma** |
| Auth | Email + bcrypt (12 rounds) | Bukan OAuth — admin tunggal |
| Realtime | Ably | `publishAdminEvent` di server, `useRealtime` / `useAdminRealtime` di client |
| Deploy | Vercel Serverless | `@astrojs/vercel` v8, Node 22, `rootDirectory: apps/web` |
| Monorepo | Turborepo + pnpm workspaces | `--force` flag di build command |
| Mastra | **Dihapus** | Package & endpoint `api/admin/workflow.ts` sudah dihapus (tidak dipakai) |

---

## Core User Flow — Status Lengkap

```
Photographer creates album      ✅  AlbumFormModal.tsx (CRUD: create/edit/delete)
Photographer uploads photos     ✅  UploadPage.tsx — album list auto-populate on mount
Photographer copies share link  ✅  AlbumDetail — "Copy Gallery Link" + "Copy PIN"
Client opens homepage           ✅  index.astro — form "Access Your Gallery" + redirect
Client enters PIN               ✅  PinEntry.tsx + rate limiter 5x/15min per IP
Client browses photos           ✅  Grid + lightbox fullscreen (PhotoLightbox.tsx)
Client selects photos           ✅  Toggle dari grid atau dari dalam lightbox
Client submits selection        ✅  API + Sanity transaction + Ably event
Admin sees real-time notif      ✅  useAdminRealtime + AlbumList
Admin views selections          ✅  SelectionTable + AlbumDetail
Admin copies filenames          ✅  CopyFilenamesButton → clipboard → Lightroom
Admin unlocks gallery           ✅  unlock.ts — hapus selections lama + set active
Client sees unlock real-time    ✅  useRealtime + animated toast + state reset
```

---

## File Map

| Path | Deskripsi |
|------|-----------|
| `apps/web/src/pages/index.astro` | Homepage dengan gallery entry form |
| `apps/web/src/pages/admin/` | Admin pages (login, index, upload) |
| `apps/web/src/pages/gallery/[slug].astro` | Gallery route per album |
| `apps/web/src/pages/api/admin/albums.ts` | CRUD album (GET list, POST create) |
| `apps/web/src/pages/api/admin/albums/[id]/` | Album detail (GET, PUT, DELETE, POST unlock) |
| `apps/web/src/pages/api/admin/upload.ts` | Upload foto per-file |
| `apps/web/src/pages/api/gallery/[slug]/verify.ts` | PIN auth + album+photo data |
| `apps/web/src/pages/api/gallery/[slug]/submit.ts` | Submit selections + lock album |
| `apps/web/src/pages/api/auth/` | Login, logout, create-admin |
| `apps/web/src/components/admin/` | AdminPage, AlbumList, AlbumCard, AlbumDetail, AlbumFormModal, UploadPage, SelectionTable, CopyFilenamesButton |
| `apps/web/src/components/gallery/` | GalleryPage, PinEntry, PhotoLightbox |
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

---

## Security Status

| Item | Status |
|------|--------|
| bcrypt 12 rounds | ✅ |
| Session cookie `secure: PROD` | ✅ |
| `requireAdmin()` di semua admin endpoints | ✅ |
| Single error message login (no enumeration) | ✅ |
| PIN rate limiter 5x/15min/IP (persist Upstash bila di-set, else in-memory) | ✅ |
| `.git` / `.env` diblok di Vercel | ✅ |
| Hardcoded credentials di repo | ✅ Tidak ada |
| `create-admin`: bootstrap admin pertama, lalu wajib auth | ✅ |
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
| E2E / Playwright tests | `apps/web/tests/*.spec.ts` | Ada tapi selektor pre-lightbox (perlu refresh); dijalankan via `pnpm test:e2e`, tidak di CI |
| Email notifikasi | — | Tidak ada |
| OAuth admin auth | — | Bukan OAuth, pakai email+bcrypt |
| LQIP / Blurhash | — | Tidak ada blur placeholder |

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
- `rootDirectory: apps/web`, `framework: astro`, `nodeVersion: 22.x` (cocok dengan `@astrojs/vercel` v8 runtime `nodejs22.x`)
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
