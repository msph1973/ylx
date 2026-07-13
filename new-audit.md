# Security Audit — Semua Temuan Sudah Di-Fix

**Tanggal:** 2026-07-10 (diverifikasi ulang & disinkronkan dengan kode: 2026-07-13)
**Sumber:** Threat Modeling & Security Audit komprehensif
**Status:** Semua temuan di bawah sudah ✅ FIXED. PR #28 (H-1) merged; M-1/M-2 merged via PR #29/#30; M-3/M-4/L-1/L-3/L-4 masuk `master` via commit `f255c5d`+`8838910`+`1995646`+`b1a0184` (di luar sesi Junie manapun, terverifikasi langsung di kode); L-2 & L-5 diselesaikan pada 2026-07-13.

---

## 🟡 MEDIUM

### M-1. ✅ FIXED — Session Invalidation mustahil — stateless HMAC tanpa revocation list

**Area:** Auth (custom auth & cookie security)
**Komponen:** `apps/web/src/lib/auth.ts`, `apps/web/src/pages/api/auth/logout.ts`

**Problem (historis):** HMAC-signed stateless cookie tanpa DB session tracking. Logout cuma `cookies.delete()` di browser — cookie yang dicuri tetap valid hingga `expiresAt` (24 jam). Replay attack window = 24h.

**Fix (PR #29, merged):** Session version counter di Sanity admin doc (`sessionVersion` field, inc tiap logout). `getSession()` verifikasi version cocok dengan doc terkini sebelum trust cookie (di-cache pendek di `cache.ts`). Diverifikasi live: cookie lama langsung 401 sesaat setelah logout, bukan tetap valid 24 jam.

---

### M-2. ✅ FIXED — Ably token endpoint grant `album:*` wildcard — info disclosure lintas album

**Area:** Realtime (Ably token & privilege escalation)
**Komponen:** `apps/web/src/pages/api/ably/token.ts`

**Problem (historis):** Endpoint mints token dengan capability `album:*: ["subscribe"]` untuk siapapun tanpa PIN verification. Client bisa subscribe channel album manapun tanpa pernah verify PIN.

**Fix (PR #30, merged):** Capability di-scope ke album spesifik yang sudah diverifikasi via PIN session cookie per-album (`gallerySession.ts`, di-issue saat `verify.ts` sukses); `ably/token.ts` cek `hasAlbumAccess` sebelum grant subscribe untuk album tersebut.

---

### M-3. ✅ FIXED — CSRF — hanya andalkan `sameSite=lax`, tanpa defense-in-depth

**Area:** Auth (custom auth & cookie security)
**Komponen:** Semua endpoint admin mutating (POST/PUT/DELETE di `api/admin/*`)

**Problem (historis):** Tidak ada CSRF token di endpoint admin mana pun. Hanya `sameSite: "lax"` yang melindungi — tidak defense-in-depth.

**Fix (commit `f255c5d` + `8838910` + `1995646`, di `master`):** `apps/web/src/middleware.ts` sekarang punya `hasValidCsrfOrigin()` — cek `Origin`/`Referer` untuk semua POST/PUT/DELETE/PATCH ke `/api/admin`, `/api/gallery/*`, dan `/api/auth/*`, return 403 kalau tidak cocok.

---

### M-4. ✅ FIXED — Rate-limit fail-closed → DoS saat Upstash outage/kuota habis

**Area:** Rate limiting (Upstash Redis & Vercel rate limiting)
**Komponen:** `apps/web/src/lib/ratelimit.ts` (fail-closed branch), `apps/web/src/pages/api/gallery/[slug]/verify.ts`

**Problem (historis):** `ratelimit.ts` fail-closed di prod: jika Upstash error → `return true` (429) → seluruh galeri inaccessible saat outage.

**Fix (commit `f255c5d`, di `master`, opsi C dari 3 opsi):** Tiered degradation — saat Upstash error, degradasi ke in-memory per-instance dengan cap lebih ketat (`IN_MEMORY_PROD_CAP_DIVISOR = 2`), bukan `return true` (fail-closed) murni lagi.

---

## 🟢 LOW

### L-1. ✅ FIXED — Submit galeri tidak binding ke sesi PIN — IDOR terbatas

**Area:** Auth / Hydration leak
**Komponen:** `apps/web/src/pages/api/gallery/[slug]/submit.ts`

**Problem (historis):** Endpoint submit tidak verifikasi bahwa submitter sudah verify PIN. Siapapun yang tahu slug + photoIds valid bisa submit.

**Fix (commit `f255c5d`, di `master`):** `submit.ts` sekarang cek `hasAlbumAccess(cookies, album._id)` (session cookie per-album pasca-PIN verify dari M-2), return 403 kalau belum verifikasi PIN.

---

### L-2. ✅ FIXED — Hydration leak saat ini TIDAK ada, guard CI sudah ditambah

**Area:** Astro Islands & React Hydration Leak
**Komponen:** Semua `.astro` dengan `client:*` directives

**Problem (historis):** Astro serialisasi semua props `client:*` ke HTML sebagai JSON inline. Sudah benar sejak awal: `gallery/[slug].astro` cuma pass `slug`, `admin/index.astro`/`admin/upload.astro` cuma pass `adminName`. Risikonya adalah footgun untuk PR masa depan, bukan bug aktif.

**Fix:** `apps/web/scripts/check-hydration-leak.mjs` — scan semua `.astro` untuk baris berisi `client:load/idle/visible/only/media` dan tolak jika ada prop dengan nama mencurigakan (`pin`, `token`, `secret`, `password`, `credential`, `apiKey`, dst). Dijalankan via `pnpm --filter @ylx/web check:hydration-leak`, diwire sebagai step baru di `.github/workflows/ci.yml` (gagal build kalau ada pelanggaran).

---

### L-3. ✅ FIXED — `clientAddress ?? "unknown"` fallback kolusi bucket di beberapa endpoint

**Area:** Rate limiting
**Komponen:** `apps/web/src/pages/api/gallery/[slug]/verify.ts` (line 64), `apps/web/src/pages/api/auth/login.ts` (line 30)

**Problem (historis):** Jika `clientAddress` kosong (edge case), semua request share bucket `"unknown:<slug>"`. Sudah di-fix di login.ts tapi verify.ts masih pakai fallback.

**Fix (commit `f255c5d`, di `master`):** `verify.ts` sekarang `if (!clientAddress && import.meta.env.PROD) return 400` sebelum fallback ke `"unknown"`, konsisten dengan `login.ts`.

---

### L-4. ✅ FIXED — `getSession` tidak validasi struktur payload post-parse

**Area:** Auth
**Komponen:** `apps/web/src/lib/auth.ts`

**Problem (historis):** Setelah HMAC OK, `JSON.parse(...) as AdminSession` tanpa validasi field eksplisit.

**Fix (commit `f255c5d`, di `master`):** Validasi eksplisit `typeof session.id/email/name/role === "string"`, `Number.isFinite(expiresAt)`, `typeof sessionVersion === "number"` sebelum session dianggap valid.

---

### L-5. ✅ FIXED — Dependency Confusion / malicious install scripts (amat sangat rendah risk awal)

**Area:** Turborepo & Vercel Deployment Security
**Komponen:** `pnpm-workspace.yaml`, `apps/web/package.json`

**Catatan:** `workspace:*` protocol sudah membuat pnpm immune terhadap dependency confusion untuk package internal (`@ylx/sanity`, `@ylx/shared`). Risiko sisa: transitive third-party deps yang punya `preinstall`/`install`/`postinstall` bisa menjalankan kode arbitrary saat `pnpm install`.

**Fix:** `pnpm-workspace.yaml` sekarang punya `onlyBuiltDependencies: [esbuild, sharp]` — hanya 2 paket ini (satu-satunya yang benar-benar menjalankan lifecycle script di install nyata, dikonfirmasi via clean-room reinstall) yang diizinkan menjalankan install script; paket lain otomatis diblokir. **Catatan koreksi:** solusi awal yang disarankan (`.npmrc` `enable-pre-post-scripts=false`) diverifikasi TIDAK efektif untuk tujuan ini — setting itu hanya mengontrol chaining `pre<script>`/`post<script>` custom di `pnpm run`, bukan lifecycle install scripts dependency — sehingga tidak dipakai.

---

### L-6. ✅ Tidak perlu aksi — Env var cross-workspace leak (aman, runtime-only, Vercel-scoped)

**Area:** Turborepo & Vercel Deployment Security
**Komponen:** `turbo.json`, `packages/sanity/client.ts`

**Catatan:** `process.env.SANITY_API_TOKEN` dibaca di runtime apps/web (bundle ke function), bukan build-time package. Vite hanya expose `PUBLIC_*` ke client. Tidak ada Turbo Remote Cache yang terkonfigurasi. Verified clean.

**Solusi:** Jika enable Turbo Remote Cache di masa depan, pastikan private team + cache key tidak expose env-injected artifact.

---

## Referensi

- Lihat `STATUS.md` untuk state project terkini (termasuk log sinkronisasi audit ini 2026-07-13)
- Lihat `REVIEW.md` untuk code review checklist
- Source audit lengkap: sesi ZCode 2026-07-10 dengan model 2426d147-f5b3-4f7f-a70d-6eb57a67c027/deepseek-v4-flash-free
- M-3/M-4/L-1/L-3/L-4 diperbaiki via commit langsung ke `master` (`f255c5d`, `8838910`, `1995646`, `b1a0184`) di luar sesi Junie manapun yang tercatat; L-2/L-5 diperbaiki 2026-07-13.
