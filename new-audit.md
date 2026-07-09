# Security Audit — Temuan Belum Di-Fix

**Tanggal:** 2026-07-10
**Sumber:** Threat Modeling & Security Audit komprehensif
**Status:** PR #28 (H-1 admin login rate-limit) ✅ MERGED. Sisa temuan di bawah.

---

## 🟡 MEDIUM

### M-1. Session Invalidation mustahil — stateless HMAC tanpa revocation list

**Area:** Auth (custom auth & cookie security)
**Komponen:** `apps/web/src/lib/auth.ts`, `apps/web/src/pages/api/auth/logout.ts`

**Problem:** HMAC-signed stateless cookie tanpa DB session tracking. Logout cuma `cookies.delete()` di browser — cookie yang dicuri tetap valid hingga `expiresAt` (24 jam). Ganti password (jika endpoint ditambah nanti) juga tidak revoke session lama. Replay attack window = 24h.

**Solusi:** Session version counter di Sanity admin doc (`sessionVersion` field, inc tiap logout / password change). `getSession()` verifikasi version cocok dengan doc terkini sebelum trust cookie. Trade-off: +1 Sanity read per request authenticated (bisa di-cache pendek di `cache.ts`).

---

### M-2. Ably token endpoint grant `album:*` wildcard — info disclosure lintas album

**Area:** Realtime (Ably token & privilege escalation)
**Komponen:** `apps/web/src/pages/api/ably/token.ts`

**Problem:** Endpoint mints token dengan capability `album:*: ["subscribe"]` untuk siapapun tanpa PIN verification. Client bisa subscribe channel album manapun (`album:<albumId>`) tanpa pernah verify PIN — dengar event metadata (`photo:uploaded`, `album:unlocked`) lintas album.

**Solusi:** Scope capability ke album spesifik yang sudah diverifikasi via PIN session cookie per-album (issue saat `verify.ts` sukses). Atau alternatif ringan: beri rate-limit pada endpoint token + dokumentasi accepted info-disclosure trade-off.

---

### M-3. CSRF — hanya andalkan `sameSite=lax`, tanpa defense-in-depth

**Area:** Auth (custom auth & cookie security)
**Komponen:** Semua endpoint admin mutating (POST/PUT/DELETE di `api/admin/*`)

**Problem:** Tidak ada CSRF token di endpoint admin mana pun. Hanya `sameSite: "lax"` yang melindungi. `lax` memblokir cross-site POST (cookie tidak dikirim), tapi tidak defense-in-depth. Rawan jika future dev nambah endpoint GET yang mutate, atau browser non-compliant.

**Solusi:** Origin/Referer check di `middleware.ts` untuk semua `api/admin/*` POST/PUT/DELETE.

---

### M-4. Rate-limit fail-closed → DoS saat Upstash outage/kuota habis

**Area:** Rate limiting (Upstash Redis & Vercel rate limiting)
**Komponen:** `apps/web/src/lib/ratelimit.ts` (fail-closed branch), `apps/web/src/pages/api/gallery/[slug]/verify.ts`

**Problem:** `ratelimit.ts` fail-closed di prod: jika Upstash error → `return true` (429). Attacker bisa flood PIN verify → Upstash quota free-tier habis / latency spike → semua PIN verify 429 → seluruh galeri inaccessible.

**Solusi (defense-in-depth, tanpa melemahkan security):**
- A: Vercel Firewall / edge rate-limit sebagai lapis pertama (tolak traffic banjir sebelum hit serverless)
- B: Upgrade Upstash dari free ke paid + alerting quota
- C (trade-off): tiered degradation — saat Upstash error, alih-alih pure fail-closed, izinkan per-instance in-memory dengan cap sangat ketat (2x normal)

---

## 🟢 LOW

### L-1. Submit galeri tidak binding ke sesi PIN — IDOR terbatas

**Area:** Auth / Hydration leak
**Komponen:** `apps/web/src/pages/api/gallery/[slug]/submit.ts`

**Problem:** Endpoint submit tidak verifikasi bahwa submitter sudah verify PIN. Siapapun yang tahu slug + photoIds valid bisa submit. PhotoIds agak predictable (berbasis Sanity doc id dari image asset). Tapi realistic barrier tinggi karena photoIds cuma didapat via verify (PIN-gated).

**Solusi (opsional):** Issue session cookie per-album pasca-PIN verify, verifikasi di submit.ts.

---

### L-2. Hydration leak saat ini TIDAK ada — tapi latent footgun

**Area:** Astro Islands & React Hydration Leak
**Komponen:** Semua `.astro` dengan `client:*` directives

**Problem:** Astro serialisasi semua props `client:*` ke HTML sebagai JSON inline. Saat ini sudah benar: `gallery/[slug].astro` cuma pass `slug` (bukan data album), `admin/index.astro` cuma pass `adminName`. Tapi ini footgun untuk PR masa depan.

**Solusi (guideline):** JANGAN pass data sensitif (PIN, token, field internal Sanity) sebagai props `client:*`. Data sensitif → client fetch via authenticated API route. Untuk audit otomatis: tambah grep guard di CI/`REVIEW.md`.

---

### L-3. `clientAddress ?? "unknown"` fallback kolusi bucket di beberapa endpoint

**Area:** Rate limiting
**Komponen:** `apps/web/src/pages/api/gallery/[slug]/verify.ts` (line 64), `apps/web/src/pages/api/auth/login.ts` (line 30)

**Problem:** Jika `clientAddress` kosong (edge case), semua request share bucket `"unknown:<slug>"`. Sudah di-fix di login.ts (reject di prod jika kosong) tapi verify.ts masih pakai fallback.

**Solusi:** Terapkan pattern yang sama di verify.ts: `if (!clientAddress && import.meta.env.PROD) return 400`.

---

### L-4. `getSession` tidak validasi struktur payload post-parse

**Area:** Auth
**Komponen:** `apps/web/src/lib/auth.ts`

**Problem:** Setelah HMAC OK, `JSON.parse(...) as AdminSession` tanpa validasi field. Jika payload (legitimately signed dengan secret berbeda, atau jika secret bocor) missing field → `session.role` undefined → `requireAdmin` return null (aman, silent). Tapi sebaiknya divalidasi eksplisit.

**Solusi (ringan):** Validasi minimum type field (id string, role string, expiresAt number) post-parse.

---

### L-5. Dependency Confusion — amat sangat rendah (workspace:* protocol)

**Area:** Turborepo & Vercel Deployment Security
**Komponen:** `pnpm-workspace.yaml`, `apps/web/package.json`

**Catatan:** `workspace:*` protocol membuat pnpm immune terhadap dependency confusion untuk package internal (`@ylx/sanity`, `@ylx/shared`). Tidak ada `.npmrc` yang enable fallback. Low risk.

**Solusi:** Tambah `.npmrc` `enable-pre-post-scripts=false` untuk batasi malicious install-time scripts di transitive deps.

---

### L-6. Env var cross-workspace leak — aman (runtime-only, Vercel-scoped)

**Area:** Turborepo & Vercel Deployment Security
**Komponen:** `turbo.json`, `packages/sanity/client.ts`

**Catatan:** `process.env.SANITY_API_TOKEN` dibaca di runtime apps/web (bundle ke function), bukan build-time package. Vite hanya expose `PUBLIC_*` ke client. Tidak ada Turbo Remote Cache yang terkonfigurasi. Verified clean.

**Solusi:** Jika enable Turbo Remote Cache di masa depan, pastikan private team + cache key tidak expose env-injected artifact.

---

## Referensi

- Lihat `STATUS.md` untuk state project terkini
- Lihat `REVIEW.md` untuk code review checklist
- Source audit lengkap: sesi ZCode 2026-07-10 dengan model 2426d147-f5b3-4f7f-a70d-6eb57a67c027/deepseek-v4-flash-free
