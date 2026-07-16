# Full Codebase Audit #2 — Temuan Belum Di-Fix

**Tanggal:** 2026-07-13
**Sumber:** Full codebase audit (3 sub-audit paralel via subagent: memory/resource leak, backend bug/inconsistency, frontend/React) atas permintaan user "full audit codebase, cari bugs, potensi issue, inconsistency, leak memory, root cause"
**Status:** Semua 12 temuan `new-audit.md` (audit #1) sudah ✅ FIXED sebelum audit ini dijalankan. Audit ini mencari temuan **baru** yang belum tercakup di `new-audit.md`. Belum ada satu pun yang di-fix.

---

## 🟡 MEDIUM

### 1. `submit.ts`/`verify.ts` — `request.json()` tanpa try/catch di endpoint publik

**Area:** Backend / Input validation
**Komponen:** `apps/web/src/pages/api/gallery/[slug]/submit.ts:28`, `apps/web/src/pages/api/gallery/[slug]/verify.ts:93`

**Problem:** Kedua endpoint ini publik (tanpa auth, hanya rate-limit) dan memanggil `await request.json()` tanpa try/catch, tidak seperti `admin/selections/[id].ts` dan `admin/upload/finalize.ts` yang sudah benar menangkap JSON rusak dan return 400 rapi. Body JSON malformed dari klien manapun akan melempar `SyntaxError` tak tertangani, jatuh ke default error handling Astro (bukan kontrak `{ error: "..." }` konsisten), dan tidak ter-log dengan prefix `[Submit]`/`[Verify]` seperti error path lain di file yang sama.

**Solusi:** Bungkus `request.json()` dengan try/catch di kedua file, return 400 JSON konsisten kalau parse gagal — pola yang sama seperti yang sudah diterapkan di `selections/[id].ts`.

---

### 2. `lock.ts`/`unlock.ts` — `catch {}` kosong total, tidak ada logging

**Area:** Backend / Error handling
**Komponen:** `apps/web/src/pages/api/admin/albums/[id]/lock.ts:47`, `apps/web/src/pages/api/admin/albums/[id]/unlock.ts:51`

**Problem:** Catch block tanpa binding error dan tanpa `console.error` sama sekali. Kalau Sanity write gagal (write conflict, network blip) saat lock/unlock album, kegagalan ini sepenuhnya tidak terlihat di server log — menyulitkan debug produksi.

**Solusi:** Tambahkan `console.error("[Lock]"/"[Unlock]", error)` sebelum return 500, konsisten dengan pola logging di `albums.ts`/`photos/[id].ts`.

---

### 3. `albums/[id]/index.ts` — catch block GET/PUT/DELETE tidak log error

**Area:** Backend / Error handling
**Komponen:** `apps/web/src/pages/api/admin/albums/[id]/index.ts` GET (baris 144), PUT (baris 311), DELETE (baris 347)

**Problem:** Ketiga handler catch `(error)` tapi tidak pernah memanggil `console.error` — inkonsisten dengan file lain (`albums.ts`, `photos/[id].ts`, `photos/bulk-delete.ts`) yang selalu log sebelum return 500. Ini regresi logging yang terlewat di ronde-ronde fix sebelumnya (fix untuk `selections/[id].ts` tidak digeneralisasi ke sini).

**Solusi:** Tambahkan `console.error` di ketiga catch block, sertakan konteks (album id + operasi) supaya kegagalan update/delete album mudah ditelusuri di produksi.

---

### 4. `finalize.ts` — tidak ada validasi tipe/ukuran file di server

**Area:** Backend + Frontend / Upload flow
**Komponen:** `apps/web/src/pages/api/admin/upload/finalize.ts:71-95`

**Problem:** Upload binary langsung dari browser ke Sanity asset API (bypass server, untuk hindari limit body Vercel 4.5MB). Validasi tipe (`VALID_EXTS`) dan ukuran (`MAX_FILE_SIZE` 50MB) **hanya** ada di client (`UploadPage.tsx`). `finalize.ts` — satu-satunya kode server yang menyentuh proses upload — hanya cek `assetId` berawalan `"image-"`, tidak memverifikasi tipe/ukuran asli file yang sudah terupload. Karena `credentials.ts` memberi token Bearer write-scoped penuh ke admin manapun, request yang dibuat di luar UI (atau client yang buggy/dikompromikan) bisa upload file dengan tipe/ukuran sembarang ke Sanity tanpa gate server.

**Solusi:** Tambahkan validasi tipe MIME/ukuran di `finalize.ts` setelah asset terupload (query metadata asset dari Sanity, reject + hapus asset kalau tidak sesuai kebijakan), jangan hanya percaya prefix `"image-"`.

---

### 5. `CopyFilenamesButton.tsx` — bypass `useCopyToClipboard`, `setTimeout` tanpa cleanup

**Area:** Frontend / Resource lifecycle
**Komponen:** `apps/web/src/components/admin/CopyFilenamesButton.tsx:15-22`

**Problem:** Memanggil `navigator.clipboard.writeText` langsung dengan state `copied`/`copyError` manual, dan dua `setTimeout` (baris 18, 21) tanpa disimpan ref/tanpa cleanup saat unmount — melanggar aturan wajib `AGENTS.md` ("`useCopyToClipboard` hook untuk semua interaksi clipboard"). Semua tombol copy lain (`AlbumDetail.tsx` — copy gallery link & copy PIN) sudah benar memakai hook ini. Kalau admin navigasi keluar/unmount view dalam ~2 detik setelah copy, timer tetap `setState` ke komponen yang sudah unmount.

**Solusi:** Refactor `CopyFilenamesButton` untuk memakai `useCopyToClipboard()` seperti komponen lain, hapus state/timer manual.

---

### 6. `PhotoLightbox.tsx` — modal galeri klien tidak punya focus trap

**Area:** Frontend / Accessibility
**Komponen:** `apps/web/src/components/gallery/PhotoLightbox.tsx:52-63`

**Problem:** Modal ini (`role="dialog" aria-modal="true"`, dipakai klien end-user, bukan cuma admin) tidak menerapkan `useFocusTrap` — hook yang sudah ada dan dipakai di `AlbumFormModal.tsx` (admin). Pengguna keyboard bisa Tab keluar dari lightbox yang terbuka ke halaman di belakangnya. Karena ini modal yang dihadapi klien (bukan admin-only), dampak inkonsistensinya lebih terlihat.

**Solusi:** Terapkan `useFocusTrap` ke `PhotoLightbox` sama seperti `AlbumFormModal`, plus initial-focus management saat modal terbuka.

---

### 7. `slugLock` tidak dirilis kalau write album gagal setelah reservasi

**Area:** Backend / Data consistency
**Komponen:** `apps/web/src/pages/api/admin/albums.ts` POST (baris ~117-144), `apps/web/src/pages/api/admin/albums/[id]/index.ts` PUT

**Problem:** `generateUniqueSlug`/`resolveCustomSlug` mereservasi dokumen `slugLock` (via `sanityWriteClient.create()`, id deterministik anti-race) **sebelum** `sanityWriteClient.create()` untuk dokumen album itu sendiri dieksekusi. Kalau create/commit album gagal (network blip, Sanity 5xx, edge-case validasi), catch block return 500 tapi lock yang baru direservasi tidak pernah dilepas. Karena `slugLockId()` deterministik dan tidak ada expiry, string slug/customSlug tersebut jadi **tidak bisa dipakai album manapun lagi selamanya** — padahal tidak ada album yang benar-benar memakainya.

**Solusi:** Tambahkan rollback (`sanityWriteClient.delete(lockId)`) di catch block kalau write album/patch gagal setelah lock berhasil direservasi.

---

## 🟢 LOW

### 8. `ratelimit.ts` — in-memory `Map` fallback tanpa eviction/TTL sweep

**Area:** Backend / Memory leak (fallback path)
**Komponen:** `apps/web/src/lib/ratelimit.ts:18`

**Problem:** `Map` module-level (dipakai saat Upstash down, per desain M-4 di `new-audit.md`) menyimpan entry per key unik (`login-ip:<ip>`, `<email>`, `<ip>:<slug>`, `<albumId>`) — entry hanya di-overwrite saat window expired, tidak pernah dihapus. Tidak ada TTL sweep atau cap ukuran maksimum. Serangan terdistribusi (banyak IP unik / banyak slug album diprobe) bisa mengakumulasi puluhan ribu entry di container warm sebelum recycle. Dampak rendah karena ini cuma fallback sekunder (Upstash primary di produksi).

**Solusi:** Tambahkan periodic sweep sederhana (hapus entry yang window-nya sudah lewat) atau cap ukuran maksimum `Map` dengan eviction LRU.

---

### 9. `UploadPage.tsx` — tidak ada `AbortController`/unmount-guard untuk fetch & XHR upload

**Area:** Frontend / Resource lifecycle
**Komponen:** `apps/web/src/components/admin/UploadPage.tsx` (`uploadWithRetry`, `putAssetToSanity` XHR progress handler, `startUpload`, `retryFile`)

**Problem:** Tidak ada guard `isMounted`/`AbortController` di sekitar `setFiles(...)`/`setAlbums(...)` dalam callback async. Kalau admin navigasi keluar dari `/admin/upload` mid-batch, upload XHR/fetch tetap berjalan dan memanggil `setState` ke komponen yang sudah unmount. Dampak kecil karena app tidak pakai client-side router (navigasi = full page unload yang membunuh semua JS/XHR), dan React 18 tidak crash/warning untuk `setState` post-unmount.

**Solusi:** Tambahkan `AbortController`/ignore-flag kalau app ke depannya adopsi SPA router (`astro:transitions`); saat ini prioritas rendah.

---

### 10. `middleware.ts` — prefix CSRF `/api/admin` tanpa trailing slash

**Area:** Backend / Konsistensi kode
**Komponen:** `apps/web/src/middleware.ts:59`

**Problem:** Prefix CSRF check untuk admin adalah `"/api/admin"` (tanpa `/`), sedangkan `"/api/gallery/"` dan `"/api/auth/"` punya trailing slash. Tidak ada jalur eksploitasi ditemukan (tidak ada path sibling seperti `/api/administrator`), tapi gayanya tidak konsisten dan berisiko drift di masa depan.

**Solusi:** Samakan jadi `"/api/admin/"` untuk konsistensi gaya dengan dua prefix lainnya.

---

### 11. `cache.ts` — fail-open contract bisa bocor kalau `fetcher` throw sinkron

**Area:** Backend / Cache layer (teoretis)
**Komponen:** `apps/web/src/lib/cache.ts` (`getCached`, sekitar baris 122)

**Problem:** Kalau `fetcher` yang dipassing ke `getCached` adalah fungsi non-async yang throw secara **sinkron** (bukan `Promise` yang reject), exception tersebut menembus langsung keluar dari `getCached()` tanpa tertangkap try/catch — melanggar dokumentasi "fail-open" di kepala file `cache.ts`. Saat ini murni teoretis: semua call site yang ada memakai `async () => sanityClient.fetch(...)`, yang tidak pernah throw sinkron.

**Solusi:** Bungkus panggilan `fetcher()` dengan try/catch (atau `Promise.resolve().then(fetcher)`) di `getCached` supaya kontrak fail-open benar-benar terjamin untuk semua kemungkinan bentuk `fetcher`, bukan hanya yang dipakai saat ini.

---

## Referensi

- Lihat `STATUS.md` untuk state project terkini.
- `new-audit.md` (audit #1, 12 temuan M-1..M-4/L-1..L-6) sudah dihapus karena semua ✅ FIXED — audit ini (#2) adalah putaran audit lanjutan yang independen.
- Ditemukan via 3 subagent paralel (memory/resource leak, backend bug/inconsistency, frontend/React) atas full codebase, 2026-07-13.
