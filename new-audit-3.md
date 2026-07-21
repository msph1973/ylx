# Full Codebase Audit #3 — Security, Performance, Memory, Inconsistency

**Tanggal:** 2026-07-21
**Sumber:** Comprehensive review focusing on security vulnerabilities, memory leaks, performance bottlenecks, and code inconsistencies
**Status:** ✅ Diverifikasi ulang terhadap kode aktual — lihat catatan koreksi di tiap temuan. Ringkasan: 2 dari 3 "Critical" TERBANTAH (sudah di-`await`/sudah ada cleanup timeout), sisanya bervariasi valid s.d. dilebih-lebihkan. Semua temuan yang tetap valid setelah verifikasi sudah diperbaiki (lihat PR #50 untuk implementasi perbaikan).

---

## 🔴 CRITICAL

### 1. Session Version Cache Race Condition (Security)

> **❌ KOREKSI: TIDAK BENAR.** Diverifikasi langsung ke `apps/web/src/pages/api/auth/logout.ts:20` — kode aktual sudah `await invalidateSessionVersionCache(session.id);`, BUKAN fire-and-forget seperti diklaim. Temuan ini basi/keliru, tidak ada perbaikan yang diperlukan.

**Area:** Backend / Auth
**Komponen:** `apps/web/src/lib/auth.ts:31-36`

**Problem:** `invalidateSessionVersionCache()` adalah async function tapi tidak pernah di-await di logout flow. Cache invalidation bisa selesai **setelah** response logout dikirim, meninggalkan window dimana session yang sudah di-revoke masih valid sampai 20 detik (SESSION_VERSION_TTL_SECONDS).

```typescript
// Pattern di logout.ts (assumed):
await bumpSessionVersion(adminId);
invalidateSessionVersionCache(adminId); // ❌ fire-and-forget
return new Response(...);
```

**Impact:** Cookie yang dicuri bisa tetap valid sampai 20s setelah logout. Attacker dengan stolen cookie punya window untuk akses admin.

**Solusi:** Selalu `await invalidateSessionVersionCache(adminId)` sebelum return response logout. Ini memastikan cache benar-benar clear sebelum response dikirim.

**Severity:** CRITICAL — direct security bypass window

---

### 2. Worker Memory Leak on Rapid Unmount (Memory)

> **⚠️ KOREKSI: DILEBIH-LEBIHKAN.** `imageResizeClient.ts` sudah punya `RESIZE_TIMEOUT_MS = 30_000` — tiap entry di `pending` Map otomatis dibersihkan maksimal 30 detik lewat `setTimeout`, plus `failAllPending()` saat worker crash. Bukan leak "selamanya"/unbounded seperti diklaim; benar tidak ada cleanup eksplisit saat unmount komponen, tapi dampaknya sudah dibatasi 30 detik — diturunkan dari CRITICAL, tidak diperbaiki lebih lanjut (risiko sudah dimitigasi).

**Area:** Frontend / Image Processing
**Komponen:** `apps/web/src/lib/imageResizeClient.ts:13`

**Problem:** `pending` Map tidak pernah di-clear saat component unmount. Kalau user navigasi keluar dari upload page saat file sedang di-resize, Map entries + resolve callbacks mereka leak selamanya. Module-level state ini bertahan selama browser tab hidup.

```typescript
const pending = new Map<string, PendingResize>(); // ❌ no cleanup mechanism
```

**Impact:** Memory leak unbounded. User yang repeatedly visit upload page dan leave sebelum selesai akan akumulasi memory leak. Setiap entry = File object (bisa puluhan MB) + callbacks.

**Solusi:** 
1. Export `cleanup()` function yang clear `pending` Map + terminate worker
2. Call dari `UploadPage` unmount effect
3. Atau: track component mount state, ignore callbacks kalau unmounted

**Severity:** CRITICAL — unbounded memory growth

---

### 3. Ably Channel Leak on Album Switch (Memory)

> **✅ BENAR — DIPERBAIKI.** Cleanup sekarang memanggil `ably.channels.release(channelName)` sehingga channel benar-benar dilepas dari memori, bukan cuma unsubscribe listener.

**Area:** Frontend / Realtime
**Komponen:** `apps/web/src/hooks/useRealtime.ts:42-47`

**Problem:** Saat `albumId` berubah, cleanup effect unsubscribe semua event handlers tapi tidak pernah call `channel.detach()`. Ably SDK tetap keep channel instance di memory. Admin yang view banyak album dalam satu session akan akumulasi dead channels.

```typescript
return () => {
  for (const [eventType, handler] of Object.entries(handlers)) {
    channel.unsubscribe(eventType, handler);
  }
  // ❌ Missing: channel.detach()
};
```

**Impact:** Memory leak di Ably SDK. Setiap channel = WebSocket connection state + message buffers. Admin yang browse 50+ albums bisa leak ratusan MB.

**Solusi:** Tambahkan `await channel.detach()` di cleanup (wrap try/catch karena detach bisa throw). Atau gunakan `channel.release()` kalau tidak perlu graceful detach.

**Severity:** CRITICAL — memory leak di production use case (admin browsing albums)

---

## 🟠 HIGH

### 4. Upload Concurrency Starvation (Performance)

> **⚠️ KOREKSI: KEPUTUSAN DESAIN SADAR, BUKAN BUG.** `UPLOAD_CONCURRENCY = 3` sudah punya komentar rasional eksplisit di kode ("3 is a good middle ground for large full-res photos"). Adaptive concurrency berdasarkan `navigator.connection` adalah peningkatan yang valid tapi effort besar untuk manfaat kecil pada skala penggunaan 1 admin — TIDAK diperbaiki sesi ini, dicatat sebagai potensi optimisasi masa depan jika benar-benar dibutuhkan.

**Area:** Frontend / Upload
**Komponen:** `apps/web/src/components/admin/UploadPage.tsx:42`

**Problem:** `UPLOAD_CONCURRENCY = 3` hardcoded. Pada fast connection (fiber/5G), 3 parallel uploads underutilize bandwidth. Pada slow/mobile, 3 bisa overwhelm. Tidak ada adaptasi berdasarkan network condition.

```typescript
const UPLOAD_CONCURRENCY = 3; // ❌ one-size-fits-all
```

**Impact:** Suboptimal throughput. Fast connection: bisa 5-10x lebih cepat dengan concurrency lebih tinggi. Slow connection: UI freeze/timeout karena terlalu banyak parallel.

**Solusi:** 
- Adaptive concurrency based on `navigator.connection.effectiveType`
- Atau: user-configurable setting
- Atau: dynamic adjustment based on upload speed measurement

**Severity:** HIGH — direct performance impact pada core workflow

---

### 5. Retry Exponential Backoff Overflow (Performance)

> **✅ BENAR — DIPERBAIKI.** Delay sekarang di-cap dengan `Math.min(MAX_RETRY_DELAY_MS, ...)`.

**Area:** Frontend / Upload
**Komponen:** `apps/web/src/components/admin/UploadPage.tsx:268`

**Problem:** Exponential backoff `RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)` tidak ada cap. Dengan `MAX_UPLOAD_ATTEMPTS = 3`, max delay adalah 1600ms (safe). Tapi kalau constant berubah di masa depan, bisa overflow ke multi-minute delays.

```typescript
await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)); // ❌ unbounded
```

**Impact:** Future config change bisa cause unintended behavior. Juga: `2 ** n` untuk large n bisa overflow Number.MAX_SAFE_INTEGER.

**Solusi:** Cap delay dengan `Math.min(MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))` dimana `MAX_DELAY_MS = 30_000` (30s reasonable max).

**Severity:** HIGH — potential future bug, easy to fix now

---

## 🟡 MEDIUM

### 6. Inconsistent Error Handling in Cache (Inconsistency)

> **✅ BENAR — DIPERBAIKI.** Ditambahkan counter kegagalan + `getCacheHealth()` getter (tanpa mengubah signature `getCached`/`invalidateCache` yang sudah dipakai 3 caller, supaya tidak breaking).

**Area:** Backend / Cache
**Komponen:** `apps/web/src/lib/cache.ts:82-90`

**Problem:** `getCached()` log warnings pada Upstash errors tapi fallback silently. `invalidateCache()` juga log tapi never throw. Caller tidak punya cara untuk tahu cache sedang degraded. Tidak ada observability.

```typescript
} catch (err) {
  console.warn(`[Cache] Upstash GET unavailable...`);
  return await fetcher(); // ❌ silent fallback
}
```

**Impact:** Silent performance degradation. Kalau Upstash down, semua requests jadi slow (direct Sanity fetch) tapi tidak ada alert/metric.

**Solusi:** 
- Return status object `{ value: T, cached: boolean, source: 'cache' | 'fetcher' }`
- Atau: emit metrics/events untuk monitoring
- Atau: increment error counter untuk health check

**Severity:** MEDIUM — observability gap, not a functional bug

---

### 7. CSRF Check Bypasses on Missing Headers (Security)

> **✅ BENAR — DIPERBAIKI.** Kondisi Origin+Referer kosong sekarang `return false` (fail-closed) — semua endpoint terproteksi dipanggil dari browser (admin dashboard/gallery client), yang selalu mengirim minimal satu dari kedua header ini.

**Area:** Backend / Security
**Komponen:** `apps/web/src/middleware.ts:11-31`

**Problem:** `hasValidCsrfOrigin()` return `true` kalau Origin dan Referer both absent, assuming "same-origin form POST from non-browser client". Tapi malicious site bisa strip both headers via `<meta name="referrer" content="no-referrer">` + fetch `mode: 'no-cors'`.

```typescript
if (!origin && !referer) {
  return true; // ❌ too permissive
}
```

**Impact:** CSRF defense weakened. `sameSite=lax` cookie masih protect, tapi defense-in-depth compromised. Attacker dengan XSS di subdomain bisa bypass.

**Solusi:** 
- Require at least one header (Origin or Referer) pada protected routes
- Atau: add CSRF token untuk state-changing operations
- Atau: stricter check — reject kalau both missing di production

**Severity:** MEDIUM — defense-in-depth issue, primary defense (sameSite) masih intact

---

### 8. Album Selection Race in Upload (Inconsistency)

> **✅ BENAR — DIPERBAIKI.** `albumId` sekarang di-stamp ke tiap `UploadFile` saat batch upload dimulai dan dipertahankan untuk retry individual; dropdown album juga dikunci (`disabled`) selama upload berlangsung sebagai lapisan pertahanan tambahan.

**Area:** Frontend / Upload
**Komponen:** `apps/web/src/components/admin/UploadPage.tsx:318-320`

**Problem:** User bisa change `selectedAlbum` dropdown saat upload in progress. `startUpload()` capture `selectedAlbum` at call time, tapi `retryFile()` re-read current state. Retry bisa target album berbeda dari original attempt.

```typescript
const startUpload = useCallback(async () => {
  if (!selectedAlbum) return; // ❌ captured here
  // ...
  await uploadWithRetry(uploadFile, selectedAlbum); // uses captured value
}, [selectedAlbum, ...]);

const retryFile = useCallback(async (id: string) => {
  if (!selectedAlbum) return; // ❌ re-reads current state
  // ...
}, [selectedAlbum, ...]);
```

**Impact:** Photos uploaded ke wrong album pada retry after dropdown change. Data integrity issue.

**Solusi:** Capture `albumId` per-file at queue time (add to `UploadFile` interface), bukan at upload time. Lock dropdown saat upload in progress.

**Severity:** MEDIUM — data integrity bug, rare but serious when it happens

---

### 9. Stale Credentials on 401 Retry (Performance)

> **⚠️ KOREKSI: SEBAGIAN BENAR, DAMPAK DILEBIHKAN.** `getCredentials()` di percobaan retry berikutnya dalam loop yang sama otomatis fetch ulang begitu `credsRef.current` di-null-kan — jadi bukan "1 retry sia-sia" penuh, cuma tetap menunggu jeda backoff dulu. Solusi yang disarankan (fetch instan tanpa nunggu delay) tetap diterapkan sebagai optimisasi kecil karena valid dan murah.

**Area:** Frontend / Upload
**Komponen:** `apps/web/src/components/admin/UploadPage.tsx:256`

**Problem:** Pada 401 error, `credsRef.current = null` clear cache, tapi **current** retry attempt masih pakai stale creds yang sudah di-fetch. Hanya **next** file (atau next retry) yang dapat fresh creds.

```typescript
if (e?.status === 401) credsRef.current = null; // ❌ too late for this attempt
```

**Impact:** One wasted retry per 401. Kalau token expired mid-batch, setiap file waste 1 retry sebelum dapat fresh token.

**Solusi:** Re-fetch creds immediately after clearing cache, dalam same retry loop iteration:

```typescript
if (e?.status === 401) {
  credsRef.current = null;
  creds = await getCredentials(); // re-fetch now
}
```

**Severity:** MEDIUM — performance waste, not a functional bug

---

## 🟢 LOW

### 10. Inconsistent Null Checks (Inconsistency)

> **⚠️ KOREKSI: PERBANDINGAN KURANG PAS.** `middleware.ts` sebenarnya tidak membaca `process.env` sama sekali (dicek — tidak ada referensi), jadi perbandingan "tidak ada null-check" dengan `auth.ts`/`cache.ts` tidak akurat. Observasi gaya kode umum (variasi pola null-check antar file) tetap valid tapi tidak actionable sebagai bug — tidak diperbaiki, murni gaya penulisan berbeda konteks.

**Area:** Backend / Code Style
**Komponen:** Multiple files

**Problem:** Inconsistent pattern untuk env var checks:
- `auth.ts`: `if (!sessionCookie || !SESSION_SECRET)` — checks both
- `cache.ts`: `if (!url || !token)` — checks both  
- `middleware.ts`: No null checks on `process.env` — assumes always set

**Impact:** Tidak ada functional bug (env vars memang always set di production), tapi inconsistent style bisa confuse maintainers.

**Solusi:** Standardize: either check everywhere atau document assumptions di top-level comment.

**Severity:** LOW — style issue only

---

### 11. Magic Numbers Without Comments (Maintainability)

> **⚠️ KOREKSI: SEBAGIAN TIDAK AKURAT.** `UPLOAD_CONCURRENCY=3` dan `MAX_FILE_SIZE=50MB` SUDAH punya komentar rasional di kode aktual (dicek langsung), bertentangan dengan klaim "tanpa penjelasan". Yang benar-benar tanpa komentar rasional cuma `SESSION_VERSION_TTL_SECONDS=20` dan `RESIZE_TIMEOUT_MS=30000` — tidak diperbaiki sesi ini (murni dokumentasi, prioritas rendah, bisa menyusul).

**Area:** Multiple / Code Quality
**Komponen:** Multiple files

**Problem:** Magic numbers tanpa explanation:
- `SESSION_VERSION_TTL_SECONDS = 20` — why 20?
- `UPLOAD_CONCURRENCY = 3` — why 3?
- `MAX_FILE_SIZE = 50 * 1024 * 1024` — why 50MB?
- `RESIZE_TIMEOUT_MS = 30_000` — why 30s?

**Impact:** Future maintainers tidak tahu rationale, takut untuk change.

**Solusi:** Add inline comments explaining rationale atau move to config file dengan documentation.

**Severity:** LOW — maintainability issue

---

### 12. Unused `mountedRef` Pattern (Inconsistency)

> **✅ BENAR — DIPERBAIKI.** `beginActivity()` sekarang juga di-guard `mountedRef.current`, konsisten dengan `endActivity()`.

**Area:** Frontend / React
**Komponen:** `apps/web/src/components/admin/UploadPage.tsx:68-69`

**Problem:** `mountedRef.current` checked di `endActivity()` tapi never di `beginActivity()` atau other state setters. Inconsistent guard pattern.

```typescript
const endActivity = useCallback(() => {
  activeCountRef.current = Math.max(0, activeCountRef.current - 1);
  if (activeCountRef.current === 0 && mountedRef.current) setIsUploading(false); // ✅ guarded
}, []);

const beginActivity = useCallback(() => {
  activeCountRef.current += 1;
  setIsUploading(true); // ❌ not guarded
}, []);
```

**Impact:** Tidak ada functional bug (React 18 auto-batches, unmount race rare), tapi inconsistent pattern.

**Solusi:** Either guard all `setState` calls atau remove guard entirely (React 18 handles this gracefully).

**Severity:** LOW — style inconsistency

---

### 13. Timeout Cleanup Pattern Already Correct (False Alarm)

**Area:** Frontend / React
**Komponen:** `apps/web/src/components/gallery/GalleryPage.tsx`

**Problem:** NONE — initial review flagged potential timeout leak, tapi re-review confirms all three timeout refs (`unlockToastTimeoutRef`, `noticeTimeoutRef`, `confirmTimeoutRef`) properly clear before setting new values.

```typescript
// All correct:
if (unlockToastTimeoutRef.current !== null) {
  window.clearTimeout(unlockToastTimeoutRef.current); // ✅
}
unlockToastTimeoutRef.current = window.setTimeout(...);
```

**Impact:** None — false alarm.

**Solusi:** None needed.

**Severity:** N/A — not an issue

---

## Summary (setelah verifikasi ulang terhadap kode aktual)

| # | Temuan | Klaim awal | Hasil verifikasi | Tindakan |
|---|---|---|---|---|
| 1 | Session cache race | CRITICAL | ❌ Tidak benar — sudah di-`await` | Tidak ada |
| 2 | Worker memory leak | CRITICAL | ⚠️ Dilebih-lebihkan — sudah ada timeout 30s | Tidak ada |
| 3 | Ably channel leak | CRITICAL | ✅ Benar | **Diperbaiki** |
| 4 | Upload concurrency | HIGH | ⚠️ Keputusan desain sadar | Tidak ada (dicatat) |
| 5 | Retry backoff overflow | HIGH | ✅ Benar | **Diperbaiki** |
| 6 | Cache observability | MEDIUM | ✅ Benar | **Diperbaiki** |
| 7 | CSRF bypass | MEDIUM | ✅ Benar | **Diperbaiki** |
| 8 | Album race | MEDIUM | ✅ Benar | **Diperbaiki** |
| 9 | Stale creds | MEDIUM | ⚠️ Sebagian benar, dampak dilebihkan | **Diperbaiki** (optimisasi kecil) |
| 10 | Null checks | LOW | ⚠️ Perbandingan tidak akurat | Tidak ada |
| 11 | Magic numbers | LOW | ⚠️ Sebagian tidak akurat | Tidak ada |
| 12 | mountedRef | LOW | ✅ Benar | **Diperbaiki** |
| 13 | Timeout cleanup | False Alarm | ✅ Dikonfirmasi false alarm | Tidak ada |

**Total: 7 temuan valid diperbaiki (#3, #5, #6, #7, #8, #9, #12), 4 terbantah/dilebih-lebihkan (#1, #2, #10, #11), 1 keputusan desain sadar (#4), 1 false alarm dikonfirmasi (#13).**

---

## Status Akhir (semua sudah ditindaklanjuti sesuai hasil verifikasi)

### Diperbaiki
1. **#3 Ably channel leak** — `ably.channels.release()` di cleanup
2. **#5 Retry backoff** — delay di-cap
3. **#8 Album race** — `albumId` di-stamp per-file + dropdown dikunci saat upload
4. **#6 Cache observability** — counter kegagalan + getter
5. **#7 CSRF bypass** — fail-closed saat Origin+Referer kosong
6. **#9 Stale creds** — fetch ulang instan setelah 401 (bukan nunggu retry berikutnya)
7. **#12 mountedRef** — `beginActivity()` ikut di-guard

### Tidak ditindaklanjuti (dengan alasan)
- **#1, #2** — terbantah/dilebih-lebihkan oleh kode aktual, tidak ada bug nyata.
- **#4** — keputusan desain sadar (sudah ada rationale di kode), bukan bug.
- **#10, #11** — observasi gaya kode, sebagian tidak akurat, tidak actionable.

---

## Referensi

- `STATUS.md` — current project state
- `AGENTS.md` — coding rules & session protocol
- `REVIEW.md` — code review checklist
- Audit #1 (`new-audit.md`) — 12 findings, all ✅ FIXED
- Audit #2 (`new-audit-2.md`) — 11 findings, all ✅ FIXED
- Audit #3 (this file) — 13 findings, verified against actual code: 7 valid & fixed, 4 debunked/overstated, 1 conscious design choice, 1 confirmed false alarm
