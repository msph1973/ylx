---
sessionId: session-260626-182451-1ayo
---

# Gap Analysis

## Gap Analysis: Original Spec vs Current Implementation

Berdasarkan audit mendalam terhadap codebase, spec awal di `docs/compose/specs/`, dan `PRODUCT.md`, berikut analisis komprehensif apa yang sudah ada, apa yang belum, dan apa yang menyimpang dari plan.

---

### ✅ Sudah Diimplementasikan dengan Baik

 Fitur | Spec | Status |
-------|------|--------|
 Monorepo Turborepo + Astro + React | S3 | ✅ Lengkap |
 Sanity schemas (album, photo, selection, submission) | S4 | ✅ Lengkap |
 Gallery PIN entry + rate limiting | S5 | ✅ Lengkap |
 Photo grid + selection toggle | S5 | ✅ Lengkap |
 Submit + lock album (Sanity transaction) | S5 | ✅ Lengkap |
 Admin login / logout + auth cookie | S5 | ✅ Lengkap |
 Album CRUD (create, edit, delete) | S5 | ✅ Selesai di PR #5 |
 CopyFilenamesButton (Lightroom export) | S5 | ✅ Lengkap |
 Upload foto per-file via admin UI | S4 | ✅ Lengkap |
 Ably real-time event publishing (server side) | S5 | ✅ Lengkap |
 Mastra workflow definitions (upload, submit, export) | S6 | ✅ Kode ada |
 bcrypt password hashing | Security | ✅ 12 rounds |
 TypeScript strict + ESLint no-any | S8 | ✅ Clean |
 Vercel deployment | S3 | ✅ Live |
 Security headers + rate limiting | Security | ✅ Lengkap |
 Accessibility WCAG AA | PRODUCT | ✅ Lengkap |
 prefers-reduced-motion | PRODUCT | ✅ Lengkap |

---

### 🔴 Belum Diimplementasikan (Missing Features)

#### 1. **Share Gallery Link ke Klien** — Tidak Ada
- Spec S5: "Photographer shares gallery URL + PIN with client"
- **Realita:** `AlbumDetail` hanya menampilkan PIN teks saja. Tidak ada tombol "Copy Gallery Link", tidak ada tombol "Share via WhatsApp/Email", tidak ada QR code.
- Admin harus **manual** menyusun URL sendiri: `https://ylx-msph.vercel.app/gallery/{slug}`
- **Impact:** Fitur inti sharing tidak ada di UI — photographer tidak bisa share dengan mudah.

#### 2. **Lightbox / Full Photo Preview** — Tidak Ada
- Spec S5: "Clients browse photos"
- **Realita:** Gallery hanya punya grid thumbnail 400px. Tidak ada cara untuk melihat foto full-size.
- Klik foto = toggle select (bukan open lightbox)
- **Impact:** UX klien sangat terbatas — tidak bisa inspect foto sebelum memilih.

#### 3. **Realtime di Client Gallery (GalleryPage)** — Tidak Terhubung
- `useRealtime.ts` sudah ada tapi **tidak pernah dipakai di `GalleryPage.tsx`**
- Jika admin unlock gallery setelah locked, klien tidak akan tahu tanpa refresh manual
- `onAlbumUnlocked` callback tersedia di hook tapi tidak disubscribe

#### 4. **Mastra Workflows Tidak Terkoneksi ke App** — Stub
- `packages/mastra/` memiliki 3 workflow definitions yang lengkap
- `apps/web/src/pages/api/admin/workflow.ts` **hanya return stub** tanpa benar-benar memanggil Mastra
- `mastra` package tidak di-import di `apps/web` sama sekali
- **Impact:** Mastra adalah bagian dari arsitektur inti (spec S6) tapi tidak berfungsi

#### 5. **Homepage Terlalu Minimal** — UX Sangat Buruk
- `index.astro` hanya ada brand name + 1 link ke admin + 1 baris teks untuk klien
- Tidak ada cara klien memasukkan gallery URL/slug dari homepage
- Klien yang mengunjungi homepage akan bingung — tidak ada input slug/PIN
- **Impact:** Jika klien kehilangan link gallery, tidak bisa find back dari homepage

#### 6. **Tidak Ada Notifikasi Email** — Spec Implisit
- Spec S5: "Photographer shares gallery URL + PIN with client"
- Tidak ada integrasi email (Resend, SendGrid, dsb.) untuk kirim link+PIN ke klien
- Semua sharing manual via copy-paste

#### 7. **Admin Upload Page Tidak Fetch Albums saat Mount**
- `UploadPage.tsx` mendefinisikan `fetchAlbums` dengan `useCallback` tapi tidak ada `useEffect` yang memanggilnya saat komponen mount
- User harus ada trigger manual untuk lihat daftar album — form upload akan kosong saat pertama buka

#### 8. **OAuth Authentication Tidak Diimplementasikan**
- Spec S3: **"Auth: OAuth (Google/GitHub) — Passwordless admin authentication"**
- **Realita:** Email/password manual dengan bcrypt — bukan OAuth sama sekali
- Ini penyimpangan signifikan dari desain awal

#### 9. **Blurhash / LQIP Progressive Loading Tidak Ada**
- Spec S4: "Blurhash LQIP: Low-quality image placeholders for progressive loading"
- **Realita:** `<img src={photo.thumbnailUrl}>` langsung tanpa blur placeholder
- Tidak ada `@sanity/image-url` blurHash support di gallery

#### 10. **E2E Tests / Playwright Tests Tidak Ada**
- Spec S8 + CONTEXT.md: "E2E tests ✅"
- **Realita:** Hanya `PinEntry.test.tsx` (unit test Vitest). Tidak ada Playwright test files.
- Direktori `apps/web/src/test/setup.ts` ada tapi tidak ada `.spec.ts` Playwright

---

### ⚠️ Yang Menyimpang dari Plan Awal

 Item | Spec Awal | Implementasi Nyata | Dampak |
------|-----------|-------------------|--------|
 Auth | OAuth Google/GitHub | Email + bcrypt password | Medium — lebih simpel tapi kurang seamless |
 Mastra | Terintegrasi penuh | Stub endpoint saja | Tinggi — workflow tidak jalan |
 Homepage | Client-facing (PIN entry) | Admin-only link | Tinggi — klien kebingungan |
 LQIP | Blurhash progressive | Langsung thumbnail | Rendah — visual quality |
 E2E | Playwright test suite | Tidak ada | Medium — tidak ada automated QA |
 Python batch upload | `batch-upload.py` | `upload.py` | Rendah — nama berbeda, ada di scripts/ |

# Recommendations

## Rekomendasi Langkah Selanjutnya

Dikelompokkan berdasarkan **business impact** vs **effort**:

---

### 🔴 Must-Have (Core UX Broken)

#### P0-A: Share Gallery Link di AlbumDetail
**Why:** Fitur inti platform — tanpa ini photographer tidak bisa share ke klien
- Tambah tombol **"Copy Gallery Link"** di `AlbumDetail.tsx` yang copy `https://ylx-msph.vercel.app/gallery/{album.slug}`
- Tambah tombol **"Copy PIN"** terpisah (atau combine: "Copy Link + PIN")
- Optional: QR code untuk link gallery
- **Effort:** 2–3 jam | **Files:** `AlbumDetail.tsx` only

#### P0-B: Homepage dengan Gallery PIN Entry
**Why:** Klien yang mengunjungi homepage tidak tahu harus ke mana
- Ubah `index.astro` agar memiliki form input slug/PIN langsung
- Atau tambah link "Access Your Gallery" yang arahkan ke gallery URL form
- **Effort:** 2–3 jam | **Files:** `index.astro`, possible new component

#### P0-C: Fix UploadPage Album Fetch on Mount
**Why:** Upload form kosong saat pertama dibuka — tidak ada `useEffect` yang call `fetchAlbums`
- Tambah `useEffect(() => { fetchAlbums(); }, [fetchAlbums])` ke `UploadPage.tsx`
- **Effort:** 30 menit | **Files:** `UploadPage.tsx` line ~40

---

### 🟠 High Value (Major UX Improvements)

#### P1-A: Lightbox / Full Photo Preview di Gallery
**Why:** Klien tidak bisa lihat foto dengan jelas — grid thumbnail 400px tidak cukup untuk wedding photos
- Tambah lightbox overlay saat foto di-click (bukan toggle select)
- Mode: double-click = open lightbox, single click = select; atau dedicated "zoom" icon per foto
- Bisa gunakan `framer-motion` AnimatePresence untuk animasi smooth
- **Effort:** 4–6 jam | **Files:** `GalleryPage.tsx` + new `PhotoLightbox.tsx`

#### P1-B: Realtime Album Unlock di Gallery Client
**Why:** Jika admin unlock gallery, klien perlu tahu tanpa manual refresh
- Subscribe ke `useRealtime` di `GalleryPage.tsx` dengan `onAlbumUnlocked` callback
- Tampilkan notifikasi/toast bahwa gallery sudah di-unlock
- **Effort:** 1–2 jam | **Files:** `GalleryPage.tsx`, `useRealtime.ts` (sudah siap)

#### P1-C: LQIP / Blurhash Progressive Image Loading
**Why:** Gallery terasa lambat tanpa placeholder — spec menyebut LQIP sebagai fitur
- Sanity `urlFor()` mendukung `blurHash` field di asset
- Implement `<img>` dengan blur-up pattern: show blurred thumbnail → fade to full
- **Effort:** 3–4 jam | **Files:** `GalleryPage.tsx`, `verify.ts` (add blurHash to response)

---

### 🟡 Nice-to-Have (Polish & Completeness)

#### P2-A: Mastra Workflow Integration (Real)
**Why:** Stub saat ini tidak berguna — Mastra sudah didefinisikan tapi tidak jalan
- Integrasikan `@ylx/mastra` ke `apps/web`
- Ganti stub di `workflow.ts` dengan pemanggilan nyata `mastra.getWorkflow(name).createRun().start()`
- **Effort:** 4–8 jam (perlu test Mastra SDK compatibility dengan Vercel serverless)
- **Files:** `apps/web/src/pages/api/admin/workflow.ts`, `apps/web/package.json`

#### P2-B: Email Notifikasi (Resend)
**Why:** Share link+PIN via copy-paste masih manual — email otomatis lebih professional
- Integrasikan Resend (atau Mailgun) untuk kirim email ke klien saat album dibuat
- Template: "Your wedding photos are ready — access with PIN XXXX"
- **Effort:** 4–6 jam | **Files:** New `src/lib/email.ts`, update `albums.ts` POST

#### P2-C: E2E Playwright Tests
**Why:** Spec menyebut Playwright E2E — saat ini tidak ada, setiap deploy manual testing
- Flow utama: login → create album → verify gallery PIN → select photos → submit → check admin dashboard
- **Effort:** 6–8 jam | **Files:** New `apps/web/tests/*.spec.ts`

#### P2-D: OAuth Admin Auth
**Why:** Spec awal menyebut OAuth — email/password lebih sederhana tapi kurang aman untuk shared hosts
- Optional: tambah Google OAuth via `astro-auth` atau NextAuth adapter
- Tidak urgent karena bcrypt sudah aman untuk single-admin use case
- **Effort:** 8–12 jam | **Impact:** Low (single admin)

---

### Prioritas Matrix

```
HIGH IMPACT ┌─────────────────────────────────────────────┐
            │  P0-A Share Link   P0-B Homepage         │
            │  P0-C Upload Fix   P1-A Lightbox         │
            │  P1-B Realtime     P1-C LQIP             │
            ├─────────────────────────────────────────┤
LOW IMPACT  │  P2-A Mastra       P2-B Email            │
            │  P2-C E2E Tests    P2-D OAuth            │
            └─────────────────────────────────────────┘
            LOW EFFORT ←————————————→ HIGH EFFORT
```

**Recommended next sprint order:**
1. P0-C Upload Fix (30 menit, quick win)
2. P0-A Share Gallery Link (2–3 jam, core missing)
3. P0-B Homepage Gallery Entry (2–3 jam, client UX)
4. P1-A Lightbox (4–6 jam, major UX upgrade)
5. P1-B Realtime unlock (1–2 jam, easy with existing hook)

# Current State

## Current Implementation State (Per 2026-06-27)

### Production
- **URL:** https://ylx-msph.vercel.app
- **Admin:** `admin@ylex.my.id` / `klp123`
- **Branch:** `master` (PR #5 `feat/album-crud` belum di-merge)
- **Open PRs:** PR #5 (album CRUD, all CI green), PR #6 (Qoder workflows, all CI green)

### Core User Flow — End-to-End Status

```
Photographer creates album  →  ✅ AlbumFormModal.tsx
Photographer uploads photos →  ✅ UploadPage.tsx (but useEffect missing!)
Photographer shares link    →  ❌ Manual copy-paste saja, tidak ada UI
Client opens gallery        →  ❌ Homepage tidak ada gallery input
Client enters PIN           →  ✅ PinEntry.tsx + rate limiter
Client browses photos       →  ✅ Grid, tapi tidak ada lightbox
Client selects photos       →  ✅ Toggle select + counter
Client submits              →  ✅ API + Sanity transaction + Ably
Admin sees real-time notif  →  ✅ useAdminRealtime + AlbumList
Admin views selections      →  ✅ SelectionTable + AlbumDetail
Admin copies filenames      →  ✅ CopyFilenamesButton → Lightroom
Admin unlocks if needed     →  ✅ unlock.ts + auth guard
```

### File Map

 Layer | Files | Status |
-------|-------|--------|
 Pages | `index.astro`, `admin/index.astro`, `admin/login.astro`, `admin/upload.astro`, `gallery/[slug].astro` | ✅ All exist |
 Components/Admin | `AdminPage`, `AlbumCard`, `AlbumDetail`, `AlbumFormModal`, `AlbumList`, `CopyFilenamesButton`, `SelectionTable`, `UploadPage` | ✅ All exist |
 Components/Gallery | `GalleryPage`, `PinEntry` | ✅ Exist, lightbox missing |
 API/Admin | `albums.ts`, `albums/[id]/index.ts`, `albums/[id]/unlock.ts`, `upload.ts`, `workflow.ts` (stub) | ✅ Mostly complete |
 API/Gallery | `verify.ts`, `submit.ts`, `selections.ts` | ✅ Complete |
 API/Auth | `login.ts`, `logout.ts`, `create-admin.ts` | ✅ Complete |
 Hooks | `useRealtime.ts`, `useAdminRealtime.ts` | ✅ Exist, gallery not using useRealtime |
 Packages/Mastra | `workflows/upload.ts`, `submit.ts`, `export.ts` | ✅ Defined, ❌ Not connected |
 Packages/Sanity | `schemas/`, `lib/queries.ts`, `lib/admin.ts` | ✅ Complete |
 Packages/Shared | `types/album.ts`, `types/photo.ts`, etc. | ✅ Complete |

# Delivery Steps

### ✓ Step 1: Quick fixes: Upload mount bug + Share Gallery Link
Upload form dan share link berfungsi penuh di AlbumDetail dan UploadPage.

- **Fix `UploadPage.tsx`**: Tambah `useEffect(() => { fetchAlbums(); }, [fetchAlbums])` agar daftar album langsung muncul saat halaman upload dibuka
- **`AlbumDetail.tsx`**: Tambah tombol "Copy Gallery Link" yang copy `${window.location.origin}/gallery/{album.slug}` ke clipboard — dengan feedback state ("Copied!" selama 2 detik)
- **`AlbumDetail.tsx`**: Tambah tombol "Copy PIN" terpisah (atau combined button "Copy Link & PIN")
- Kedua tombol menggunakan pattern yang sama dengan `CopyFilenamesButton` (sudah ada di codebase)
- TypeScript strict clean + build verify sebelum push ke branch `feat/ux-fixes`

### ✓ Step 2: Homepage Gallery Entry untuk klien
Klien bisa menemukan gallery mereka dari homepage tanpa perlu link langsung.

- Ubah `apps/web/src/pages/index.astro`: tambah section "Access Your Gallery" dengan input field untuk slug album
- Saat submit: redirect ke `/gallery/{slug}` (PIN entry akan handle sisanya)
- Tetap pertahankan link admin dashboard yang sudah ada
- Ikuti design tokens yang ada (`--color-surface`, `--color-accent`, dll.) sesuai DESIGN.md
- Responsive: mobile-first, input besar dan mudah diketik di layar kecil
- Build + TypeScript verify sebelum commit ke branch yang sama

### ✓ Step 3: Lightbox full-photo preview di Gallery
Klien bisa melihat foto full-size sebelum memutuskan untuk memilih.

- Buat komponen baru `apps/web/src/components/gallery/PhotoLightbox.tsx` — overlay fullscreen dengan Framer Motion AnimatePresence
- Mode interaksi: single click = open lightbox, checkbox overlay = toggle select (atau double click = select)
- Navigasi lightbox: prev/next arrow, keyboard (ArrowLeft/Right, Escape untuk close)
- Tampilkan filename + nomor foto ("3 of 42") di lightbox
- `prefers-reduced-motion` support: animasi fade/scale dikurangi jika diaktifkan
- Gunakan `photo.url` (1200px, sudah di-generate di `verify.ts`) untuk full preview
- `aria-modal="true"`, focus trap, Escape key handler — aksesibel
- Integrasi ke `GalleryPage.tsx`: state `lightboxPhoto`, open/close callbacks

### ✓ Step 4: Realtime album unlock notification di gallery klien
Klien otomatis mendapat notifikasi saat admin unlock gallery tanpa perlu refresh.

- Integrasikan `useRealtime` hook ke `GalleryPage.tsx` dengan callback `onAlbumUnlocked`
- Saat event `album:unlocked` diterima: update state `album.status` ke `'active'`, tampilkan toast/banner "Gallery has been unlocked — you can now update your selection"
- Toast menggunakan Framer Motion AnimatePresence (sudah ada pattern di codebase)
- `useRealtime` dipanggil hanya setelah `isAuthenticated === true` dan `album?.id` tersedia
- Tidak memerlukan perubahan server-side — `publishAdminEvent` di `unlock.ts` sudah ada
- TypeScript strict clean + verify build

### ✓ Step 5: Merge PR #5, update PROGRESS.md, dan final end-to-end verification
Semua perbaikan ter-merge ke master dan terverifikasi di production.

- Merge PR #5 (`feat/album-crud`) ke master — sudah semua CI green
- Merge branch `feat/ux-fixes` (dari stage 1–4 di atas) sebagai PR baru dengan review bot
- Update `PROGRESS.md` untuk mencerminkan semua fitur yang sudah selesai
- End-to-end testing via Kernel browser automation:
  - Create album → copy gallery link → open gallery → enter PIN → view photos → lightbox → select → submit → admin sees real-time update → copy filenames
  - Admin unlocks → gallery client receives realtime unlock notification
- Update `CONTEXT.md` status dari "95% selesai" ke status yang akurat

---

## Ponytail Audit Findings (disimpan untuk fix selanjutnya)

Verified 2026-06-27. Items yang **valid** dari audit ponytail, belum dieksekusi:

| # | Item | Action | Files |
|---|------|--------|-------|
| P-1 | `@ylx/mastra` package — zero imports di apps/web | delete | `packages/mastra/` |
| P-2 | `formatPin` — didefinisikan tapi tidak pernah dipanggil | delete | `packages/shared/utils/pin.ts` |
| P-3 | `truncateFilename` — didefinisikan tapi tidak dipanggil | delete | `packages/shared/utils/format.ts` |
| P-4 | `formatFilenames` — `CopyFilenamesButton` langsung `.join(', ')`, wrapper tidak dipakai | delete | `packages/shared/utils/format.ts` |
| P-5 | `packages/shared/types/index.ts` re-export layer tidak perlu | update importers to direct imports | `packages/shared/types/index.ts` |
| P-6 | `packages/sanity/lib/image.ts` 3 wrapper functions minimal value | inline at call sites (verify.ts) | `packages/sanity/lib/image.ts` |
| P-7 | Slug generation duplikat di POST & PUT albums.ts | extract shared helper | `apps/web/src/pages/api/admin/albums.ts`, `albums/[id]/index.ts` |
| P-8 | `handleCopyLink` / `handleCopyPin` hampir identik | extract `useCopyToClipboard` hook | `AlbumDetail.tsx` |

**Tolak (false positive):**
- `formatDate` — aktif dipakai di AlbumDetail.tsx + SelectionTable.tsx
- `packages/sanity/package.json` exports field — diperlukan untuk TypeScript monorepo resolution