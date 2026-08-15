# YLx — Roadmap Fitur Masa Depan (belum dikerjakan)

> Dibuat: 2026-08-10. Sumber: usulan fitur hasil audit menyeluruh (lihat `STATUS.md` — semua PR #19-94 sudah MERGED, aplikasi sudah live & stabil di produksi). User memutuskan menyimpan **semua** item ini dulu untuk dikerjakan bertahap (kemungkinan oleh agent/sesi lain), bukan langsung eksekusi satu tingkat.
>
> **Wajib dibaca sebelum mulai mengerjakan item manapun di sini**: `STATUS.md` (state aktual + file map), `REVIEW.md` (lessons/anti-pattern/aturan env var/proses PR), `PRODUCT.md` (brand & prinsip desain), `DESIGN.md` (token visual). Setiap fitur baru wajib lewat branch + PR (tidak langsung ke `master`), ikuti pola: `tsc --noEmit` 0 error → `eslint --max-warnings 0` 0 error → `vitest` semua hijau → buka PR → tunggu review bot → **jangan auto-merge**, tanya user dulu.

Status semua item di bawah: **BELUM DIKERJAKAN**. Update baris "Status" di tabel bawah begini fitur mulai dikerjakan/selesai, dan pindahkan detail lengkap prosesnya ke `~/.junie/tasks/` (pola yang sudah dipakai untuk semua PR sebelumnya) atau catatan riwayat PR sejenis.

## Ringkasan Prioritas

| # | Fitur | Tingkat | Status |
|---|-------|---------|--------|
| 1 | Notifikasi email (submit + konfirmasi klien) | 1 | **MERGED** — PR #95, live & terverifikasi di produksi (user menerima email) |
| 2 | Pengiriman hasil akhir (final delivery) | 1 | **MERGED** — PR #96 (merge commit `2178cc5`, 2026-08-15) |
| 3 | Backup/export otomatis data Sanity | 1 | Belum dikerjakan — dipilih user sebagai item berikutnya |
| 4 | Watermark preview + proteksi klik-kanan/drag-save | 2 | Belum dikerjakan |
| 5 | Tingkatan pilihan foto (mis. "wajib" vs "kandidat") | 2 | Belum dikerjakan |
| 6 | Load-testing skenario nyata (submit bersamaan) | 2 | Belum dikerjakan |
| 7 | Multi-admin dengan kepemilikan album (ownership scoping) | 3 | Belum dikerjakan |
| 8 | Branding kustom per album/fotografer | 3 | Belum dikerjakan |
| 9 | Dashboard analitik ringan untuk fotografer | 3 | Belum dikerjakan |
| 10 | Dukungan multi-bahasa (i18n) sisi klien | 3 | Belum dikerjakan |
| 11 | Download foto asli (per-foto + download-all ZIP) — klien & admin | 2 | **MERGED** (bagian dari PR #96, merge commit `2178cc5`, klien-side, digabung dengan #2 final delivery) — lihat catatan supersede di bawah |

> Catatan: "Catatan per foto dari klien" **sudah ada** (field `notes` + `photographerReply` di schema `selection`, lihat `packages/sanity/schemas/selection.ts`) — sengaja dicoret dari daftar usulan awal supaya tidak dikerjakan ulang.

---

## Tingkat 1 — Menutup celah alur bisnis inti

### 1. Notifikasi email

**Kenapa**: Sekarang admin hanya tahu ada submission baru lewat toast realtime (Ably) — kalau tab admin tidak terbuka, notifikasi hilang. Klien juga tidak dapat konfirmasi tertulis setelah submit.

**Yang perlu ditambahkan**:
- Pilih provider email transaksional (belum ada dependency email apa pun di codebase — cek `package.json` dulu). Kandidat umum: Resend (API sederhana, ada skill terpisah kalau environment ini) atau provider lain yang cocok dengan Vercel serverless (hindari SMTP lama yang butuh koneksi persisten).
- Env var baru: `RESEND_API_KEY` (atau setara) + `EMAIL_FROM` — dokumentasikan di `REVIEW.md` §env var, `.env.example`, dan set di Vercel (lihat kebijakan Production vs Preview yang sudah ada, contoh: Sentry vars di PR #94).
- Titik integrasi:
  - `apps/web/src/pages/api/gallery/[slug]/submit.ts` — setelah `transaction.commit()` sukses, kirim email ke admin (butuh field `email` fotografer — lihat `admin` schema, `packages/sanity/schemas/admin.ts`). Kalau nanti fitur #7 (multi-admin ownership) belum ada, kirim ke SEMUA admin dulu, atau ke admin pemilik album kalau ownership sudah diimplementasi lebih dulu.
  - Sama seperti realtime publish yang sudah ada, bungkus pengiriman email di `try/catch` terpisah — kegagalan email TIDAK BOLEH menggagalkan submit yang sudah commit (pola sudah ada untuk `publishAdminEvent`, ikuti pola yang sama + tambahkan `captureError` untuk Sentry).
  - Opsional: email konfirmasi ke klien juga — tapi app ini tidak pernah mengumpulkan email klien (cuma PIN), jadi ini butuh field baru di album (`clientEmail`?) kalau mau diimplementasikan — pertimbangkan apakah benar dibutuhkan atau cukup notifikasi ke admin saja.
- Test: mock provider email di vitest (pola sama seperti mock Ably/Sanity di test yang sudah ada), pastikan kegagalan kirim email tidak mengubah response submit.

**Kriteria selesai**: submit sukses → admin (minimal 1) menerima email berisi link album + ringkasan pilihan, dalam <30 detik; kegagalan provider email tidak pernah membuat submit gagal/500.

---

### 2. Pengiriman hasil akhir (final delivery)

**Kenapa**: Alur sekarang berhenti di "klien submit pilihan → admin export nama file ke Lightroom". Tidak ada tahap "fotografer upload hasil edit final → klien unduh/lihat hasil akhir" — padahal ini bagian penting dari janji produk (`PRODUCT.md`: "handoff ke editing seamless", implikasinya siklus harusnya tuntas sampai delivery).

**Yang perlu ditambahkan**:
- Field/status baru di `album` schema (`packages/sanity/schemas/album.ts`): status lifecycle sekarang `active → submitted → locked`; perlu status baru misal `delivered`, plus field array `finalPhotos` (mirip `photos`, referensi ke tipe baru atau reuse `photo` schema dengan flag `isFinal`).
- Endpoint admin baru untuk upload foto final (bisa reuse pola `admin/upload/credentials.ts` + `admin/upload/finalize.ts` yang sudah ada untuk foto preview, dengan parameter membedakan target `photos` vs `finalPhotos`).
- UI klien: tab/halaman baru di `GalleryPage.tsx` untuk melihat/unduh foto final ketika album berstatus `delivered` — pertimbangkan apakah watermark (fitur #4) dilepas di foto final vs foto preview.
- Pertimbangkan: apakah klien butuh unduh individual atau ZIP semua sekaligus (ZIP di serverless function butuh streaming, hati-hati batas waktu/memori Vercel — foto ukuran penuh bisa besar; pertimbangkan generate ZIP di background atau redirect ke link Sanity CDN langsung per file, bukan proxy lewat server).

**Kriteria selesai**: admin bisa upload set foto final ke album yang sudah `submitted`/`locked`, mengubah status ke `delivered`; klien dengan PIN yang sama bisa melihat/unduh foto final tersebut.

**Perlu klarifikasi ke user sebelum mulai** (tulis di PR description atau tanya langsung): apakah delivery lewat PIN yang sama atau perlu link/PIN terpisah? Apakah perlu watermark dilepas otomatis di foto final?

---

### 3. Backup/export otomatis data Sanity

**Kenapa**: Item lama yang berulang kali disebut di sesi-sesi audit sebelumnya tapi belum pernah dikerjakan. Tidak ada strategi backup untuk data album/foto/selection/submission — kalau ada insiden di Sanity (kesalahan operator, bug migrasi, dsb.), tidak ada cara pulihkan data.

**Yang perlu ditambahkan**:
- Sanity punya fitur `sanity dataset export` bawaan (CLI) — paling sederhana: cron job (GitHub Actions scheduled workflow, atau Vercel Cron) yang menjalankan export dataset secara berkala ke storage eksternal (S3/R2/Google Cloud Storage — pilih yang sudah ada kredensialnya atau paling murah).
- Alternatif lebih ringan: script Node/Python (ikuti pola `scripts/upload.py` yang sudah ada untuk konvensi CLI script di repo ini) yang query semua dokumen via GROQ dan simpan sebagai JSON snapshot bertanggal.
- Env var baru untuk kredensial storage tujuan backup — dokumentasikan di `REVIEW.md` seperti biasa.
- Retention policy: berapa lama backup disimpan (mis. 30 hari rolling) supaya storage tidak membengkak.

**Kriteria selesai**: ada job terjadwal yang berjalan otomatis (bukan manual) menghasilkan backup dataset penuh minimal 1x/hari, dan sudah diverifikasi sekali bahwa hasil backup bisa di-restore/dibaca kembali (bukan cuma "berhasil jalan tanpa error").

---

## Tingkat 2 — Kepercayaan & pengalaman klien

### 4. Watermark preview + proteksi klik-kanan/drag-save

**Kenapa**: Foto preview (sebelum tahap final delivery) saat ini full-resolution dan bisa langsung di-drag/save/screenshot dari browser tanpa proteksi apa pun — resiko bisnis nyata untuk fotografer (klien bisa pakai foto proofing gratis tanpa bayar/approval).

**Yang perlu ditambahkan**:
- Watermark: Sanity Image API punya query param transformasi gambar (lihat dokumentasi `urlFor()`/image pipeline yang sudah dipakai — `packages/sanity/lib` — cek apakah sudah ada helper `urlFor`). Opsi: overlay watermark lewat Sanity Image transformation (kalau didukung) atau proxy image lewat endpoint sendiri yang menambahkan watermark di server (lebih berat, tapi lebih portable).
- Proteksi UI ringan (bukan proteksi absolut — tidak ada cara 100% mencegah screenshot): disable klik-kanan/drag pada elemen `<img>` di `GalleryPage.tsx`/`PhotoLightbox.tsx`/`BlurImage.tsx`, CSS `pointer-events`/`user-select: none`, `draggable={false}`. Pastikan tidak mengganggu aksesibilitas (screen reader tetap harus bisa akses `alt` text, jangan sampai melanggar prinsip aksesibilitas di `PRODUCT.md`).
- Pertimbangkan: watermark HANYA di foto preview (sebelum submit/sebelum delivery), TIDAK di foto final delivery (fitur #2) — perlu flag yang membedakan.
- Test: pastikan LQIP blur-up (`BlurImage.tsx`) tetap berfungsi normal dengan watermark ditambahkan di layer image asli, bukan di placeholder.

**Kriteria selesai**: foto yang ditampilkan ke klien di tahap selection (bukan delivery) punya watermark visible tapi tidak mengganggu proses memilih foto; klik-kanan "Save Image As" dan drag-to-desktop di elemen foto tidak berfungsi normal di browser desktop utama (Chrome/Firefox/Safari).

---

### 5. Tingkatan pilihan foto (mis. "wajib" vs "kandidat")

**Kenapa**: Sekarang pilihan foto cuma biner (dipilih/tidak). Untuk album dengan `maxSelections` besar, klien mungkin ingin membedakan "pasti pakai" vs "mungkin/kandidat" — memberi sinyal prioritas ke fotografer saat editing.

**Yang perlu ditambahkan**:
- Field baru di schema `selection` (`packages/sanity/schemas/selection.ts`), misal `tier` (string enum: `must-have` | `maybe`, atau angka rating 1-3).
- UI galeri (`GalleryPage.tsx`, `PhotoLightbox.tsx`): kontrol tambahan per foto untuk set tier setelah dipilih (mis. long-press atau tombol kecil di tile yang sudah dipilih) — desain harus tetap "Progressive disclosure" sesuai `PRODUCT.md`, jangan sampai bikin flow pemilihan jadi lebih rumit dari yang perlu untuk klien yang tidak butuh fitur ini.
- `SelectionTable.tsx` (admin) perlu kolom/badge tier supaya fotografer bisa filter/sort berdasarkan tier saat lihat hasil.
- Update `submit.ts` untuk menyimpan tier per selection, dan `selectionExport.ts` (export CSV/filenames) untuk opsional menyertakan kolom tier.

**Kriteria selesai**: klien bisa menandai sebagian pilihannya sebagai prioritas lebih tinggi; admin bisa melihat/filter/export berdasarkan tier tersebut; fitur ini opsional (album lama tanpa data tier tetap berfungsi normal, treat sebagai default tier).

**Perlu klarifikasi ke user**: apakah field `maxSelections` perlu pecah per-tier (mis. maksimal 5 "wajib" + 20 "kandidat") atau tetap satu limit total? Ini menentukan kompleksitas validasi di `submit.ts`.

---

### 6. Load-testing skenario nyata (submit bersamaan)

**Kenapa**: Item lama dari audit performa sebelumnya (PR #89-92) yang sengaja tidak dikerjakan — belum ada verifikasi behavior sistem saat banyak tamu submit/browsing bersamaan di hari-H acara (beban nyata, bukan traffic normal harian).

**Yang perlu dilakukan** (ini tugas verifikasi, BUKAN fitur baru — tidak menghasilkan PR kode kecuali ditemukan bug):
- Pilih tool load-testing yang cocok untuk serverless (k6, Artillery, atau Playwright dengan banyak context paralel untuk skenario end-to-end yang lebih realistis daripada raw HTTP hit).
- Skenario yang perlu disimulasikan: N klien paralel memasukkan PIN yang sama (rate limiter per-IP+slug — cek apakah rate limiter yang ada di `ratelimit.ts` justru akan false-positive memblokir tamu asli kalau banyak yang akses dari jaringan WiFi venue yang sama/IP NAT sama — ini risiko nyata untuk skenario pernikahan), submit selection bersamaan pada album yang sama (cek race condition di `submit.ts` — sudah ada guard `submission-<albumId>` sebagai atomic lock, tapi belum pernah diverifikasi di beban nyata), admin melihat realtime update saat banyak submission masuk beruntun (Ably).
- Jalankan terhadap **preview deployment**, bukan production, untuk keamanan data.

**Kriteria selesai**: laporan tertulis (`~/.junie/tasks/` atau `docs/`) berisi hasil test (throughput, error rate, temuan bug jika ada) + rekomendasi konkret (mis. apakah rate limiter per-IP perlu dilonggarkan untuk skenario WiFi venue bersama).

---

## Tingkat 3 — Pertumbuhan/skala (kalau arah produk mau melayani banyak fotografer)

### 7. Multi-admin dengan kepemilikan album (ownership scoping)

**Kenapa**: Schema `admin` (`packages/sanity/schemas/admin.ts`) **sudah punya** field `role` (`admin`/`photographer`) dan sistem sudah bisa punya banyak dokumen admin sekaligus — tapi **tidak ada** konsep kepemilikan album. Semua admin yang login bisa lihat/edit/hapus SEMUA album, tidak peduli siapa yang membuatnya. `PRODUCT.md` menyebut "Photographers" (jamak) sebagai user primer, mengisyaratkan arah produk memang untuk melayani lebih dari satu fotografer/bisnis — tapi arsitektur sekarang efektif single-tenant.

**Yang perlu ditambahkan**:
- Field baru di `album` schema: `owner` (reference ke `admin`) — diisi otomatis dari session admin yang login saat create album (`api/admin/albums.ts` POST).
- SEMUA endpoint admin yang query/mutate album (`admin/albums.ts`, `admin/albums/[id]/*`, `admin/photos/*`, `admin/selections/*`) perlu filter tambahan `&& owner._ref == $currentAdminId` — KECUALI kalau role admin adalah super-admin (`role === "admin"`) yang boleh lihat semua (perlu tentukan aturan otorisasi ini dengan jelas, dan tulis di `REVIEW.md` sebagai security rule baru — ini perubahan security-sensitive, wajib audit ketat seperti pola security fixes sebelumnya, PR #9-12/PR #83).
- Migrasi data: album yang sudah ada (tanpa `owner`) — perlu strategi (assign ke admin pertama yang ada, atau treat "tanpa owner" sebagai visible untuk semua sampai di-assign manual).
- `AlbumList.tsx`/`AlbumCard.tsx` tidak perlu berubah banyak (tetap tampilkan list album, tapi hasil query API sudah terfilter di server).

**Kriteria selesai**: 2 akun admin berbeda masing-masing hanya bisa lihat/edit album miliknya sendiri; super-admin (kalau konsep ini dipertahankan) bisa lihat semua.

**Perlu klarifikasi ke user sebelum mulai**: apakah memang mau multi-tenant (banyak bisnis fotografi independen pakai 1 instance yang sama), atau cukup "multi-user dalam 1 bisnis" (mis. fotografer utama + asisten, semua lihat album yang sama, cuma beda hak akses tulis/hapus)? Ini menentukan apakah butuh ownership filtering ketat atau cukup role-based permission tanpa filtering per-album.

---

### 8. Branding kustom per album/fotografer

**Kenapa**: Brand YLx sekarang fixed (warna aksen `#d4a574`/amber, dark theme, lihat `DESIGN.md`). Kalau arah produk memang multi-tenant (lihat fitur #7), setiap fotografer/bisnis kemungkinan ingin galeri terlihat seperti brand mereka sendiri, bukan brand YLx.

**Yang perlu ditambahkan**:
- Field baru di `album` atau level `admin`/tenant baru: `logoUrl` (image asset), `accentColor` (opsional, dengan validasi kontras minimum tetap dijaga — jangan sampai melanggar prinsip aksesibilitas WCAG AA di `PRODUCT.md`).
- `GalleryPage.tsx`/`PinEntry.tsx` perlu baca branding ini dan override CSS variable (`variables.css` sudah pakai token `--color-accent` dkk — desain untuk override per-request via inline style/CSS var injection, bukan hardcode ulang semua warna).
- Pertimbangkan dulu apakah ini benar dibutuhkan sebelum fitur #7 (multi-tenant) matang — kalau app tetap single-tenant, ini prioritasnya rendah.

**Kriteria selesai**: admin bisa upload logo + pilih warna aksen per album (atau per akun), dan galeri klien menampilkannya menggantikan branding YLx default, tanpa merusak kontras/aksesibilitas.

---

### 9. Dashboard analitik ringan untuk fotografer

**Kenapa**: `shareCount`/`lastAccessedAt` di schema `album` sudah ada tapi tidak ditampilkan sebagai dashboard yang berguna — fotografer tidak punya visibilitas kapan galeri terakhir dibuka klien atau foto mana yang paling sering dilihat, untuk membantu follow-up klien yang belum submit.

**Yang perlu ditambahkan**:
- Data yang sudah ada bisa langsung dipakai: `shareCount`, `lastAccessedAt` (album), `count(*[_type=="selection"...])` (sudah dipakai di `allAlbumsQuery`). Tambahan yang mungkin perlu: view count per foto individual (butuh event baru saat lightbox dibuka, atau terlalu granular — pertimbangkan apakah worth it).
- UI baru di `AdminPage.tsx`/`AlbumDetail.tsx`: ringkasan/kartu statistik sederhana, bukan dashboard analitik penuh dengan grafik kompleks — sesuai prinsip "Ponytail-first: minimal code, YAGNI" yang sudah jadi aturan repo ini (`STATUS.md`).
- Pertimbangkan: apakah butuh event tracking terpisah (Vercel Analytics sudah terpasang untuk traffic umum, tapi tidak granular per-album) atau cukup dari data yang sudah ada di Sanity.

**Kriteria selesai**: admin bisa lihat di halaman album detail: kapan terakhir dibuka klien, berapa kali link dibagikan/diakses, berapa dari total foto yang sudah dipilih — tanpa menambah dependency analytics eksternal baru kalau data existing sudah cukup.

---

### 10. Dukungan multi-bahasa (i18n) sisi klien

**Kenapa**: Semua teks UI sisi klien (PIN entry, galeri, toast, error message) saat ini hardcoded Bahasa Inggris/Indonesia campuran di kode React — kalau target klien memang campuran bahasa (relevan untuk fotografer yang melayani klien internasional), ini jadi blocker pengalaman.

**Yang perlu ditambahkan**:
- Pilih pendekatan i18n minimal (hindari over-engineering — sesuai prinsip Ponytail-first repo ini): kemungkinan cukup object mapping string per-locale + hook `useTranslation()` sederhana, TIDAK perlu library i18n besar (react-i18next dkk) kalau cakupan cuma 2-3 bahasa dan jumlah string terbatas — evaluasi dulu skala kebutuhan riil sebelum pilih dependency baru.
- Field baru di `album`: `locale` (default `id` atau `en`), diisi admin saat create album (client albumnya orang mana).
- Semua string statis di `GalleryPage.tsx`, `PinEntry.tsx`, `PhotoLightbox.tsx` perlu diekstrak ke dictionary per-locale.
- Ini fitur besar cakupannya (banyak file tersentuh) — pertimbangkan mulai dari scope kecil (cuma PIN entry + pesan error utama) sebelum full i18n semua komponen.

**Kriteria selesai**: minimal PIN entry + pesan-pesan utama galeri bisa tampil dalam ≥2 bahasa berdasarkan field `locale` di album, tanpa regresi ke test/behavior yang sudah ada.

---

### 11. Download foto (per-foto + download-all, klien & admin)

**Kenapa**: Saat ini tidak ada tombol download eksplisit sama sekali di kode (`grep` untuk `download`/`.zip`/`archiver`/`jszip` di `apps/web/src` nihil). Foto memang bisa di-klik-kanan-save karena disajikan langsung dari `cdn.sanity.io` (publik, lihat `img-src` di `securityHeaders.ts`), tapi ini tidak eksplisit/nyaman — klien awam sering tidak tahu caranya, dan admin tidak punya cara cepat mengunduh semua foto sekaligus.

**Konteks teknis yang sudah dikonfirmasi**:
- Semua foto (preview) diserve via `urlFor(photo.image)...url()` (helper `@ylx/sanity/client`) yang menghasilkan URL publik `cdn.sanity.io` — TIDAK ada proxy/auth di depannya. Artinya link download per-foto individual **tidak butuh endpoint baru sama sekali** — cukup tombol `<a href={photo.url} download={photo.filename}>` (atribut `download` HTML memaksa save-as alih-alih buka tab baru, meski browser modern kadang tetap membuka dulu untuk gambar cross-origin — perlu diverifikasi perilaku aktualnya).
- Schema `photo.ts` tidak punya field ukuran file/dimensi asli — kalau UI ingin menampilkan ukuran file sebelum download, perlu tambah field atau ambil dari `image.asset->` metadata Sanity (`size`, `dimensions` sudah otomatis tersedia di asset Sanity, tinggal di-`->` project di GROQ, tidak perlu field manual baru).
- **Download-all (ZIP)** adalah bagian yang butuh keputusan desain — TIDAK ada dependency zip (`archiver`/`jszip`) di codebase sama sekali. Dua pendekatan:
  - **Client-side zip**: browser klien mem-fetch semua URL Sanity CDN lalu zip di browser (pakai lib seperti `jszip` sisi client) — TIDAK butuh endpoint server baru, tapi memori browser klien menanggung beban (bisa berat untuk album besar/foto resolusi tinggi), dan gagal diam-diam kalau salah satu fetch CORS-blocked (perlu cek header CORS `cdn.sanity.io` — biasanya publik dan open, tapi wajib diverifikasi).
  - **Server-side zip (streaming)**: endpoint API baru (mis. `admin/albums/[id]/download-all.ts` dan versi klien `gallery/[slug]/download-all.ts`) yang stream zip dari server — lebih konsisten lintas-browser, tapi berisiko kena batas waktu/memori function Vercel untuk album sangat besar (perlu streaming response, bukan buffer semua di memori — Vercel serverless functions punya batas durasi berbeda tergantung plan).
- Perlu tentukan **scope akses**: apakah klien boleh download foto ORIGINAL/full-res (sama seperti yang dipakai fotografer), atau hanya resolusi preview yang sudah ditampilkan di galeri (`width(1200)` seperti sekarang)? Ini berkaitan langsung dengan fitur #4 (watermark) — kalau watermark preview jadi diimplementasikan duluan, download klien sebaiknya TIDAK memberi akses ke file tanpa watermark sebelum status `delivered`.
- Perlu tentukan **kapan** tombol download klien muncul: selalu ada (dari awal galeri dibuka), atau baru muncul setelah status tertentu (mis. `submitted`/`delivered`)? Ini terkait juga dengan fitur #2 (final delivery) — download-all yang sebenarnya paling relevan secara bisnis mungkin untuk FOTO FINAL, bukan foto preview/proofing (yang justru ingin dibatasi, lihat fitur #4).

**Keputusan desain FINAL dari user (2026-08-10, sudah final, jangan tanya ulang)**:
1. **Resolusi: ASLI/original**, bukan preview `width(1200)` yang dipakai untuk tampilan galeri. Perlu query GROQ tambahan untuk ambil URL asset original tanpa transformasi — Sanity Image API sudah expose ini lewat `image.asset->url` (field bawaan asset, langsung ke file asli, TIDAK perlu `urlFor().width()...`), tinggal di-project di query yang relevan (mis. `albumWithSelectionsQuery`/query admin album detail di `packages/sanity/lib/queries.ts`).
2. **Sisi KLIEN: DITUNDA.** Jangan implementasikan tombol download apa pun di `GalleryPage.tsx`/`PhotoLightbox.tsx` sekarang — ini baru relevan nanti bersamaan dengan fitur #2 (final delivery), supaya tidak bentrok dengan rencana proteksi/watermark (#4). **Scope fitur #11 sekarang HANYA sisi ADMIN.**
3. **Download-all: client-side ZIP di browser** (mis. pakai `jszip` + `file-saver` atau setara — cek dulu apakah ada alternatif tanpa dependency baru, tapi `jszip` kemungkinan besar dibutuhkan karena tidak ada di codebase). Browser admin fetch semua URL foto original satu-satu, bungkus jadi 1 file `.zip`, lalu trigger save — TIDAK ada endpoint server baru untuk zip-nya. Perhatikan: `cdn.sanity.io` perlu bisa di-fetch dari client dengan CORS (verifikasi dulu, biasanya publik/open untuk asset Sanity) supaya `fetch()`+`blob()` per file berhasil sebelum di-zip.
4. **Urutan kerja**: dikerjakan SETELAH item #3 (backup Sanity) selesai & merged — bukan paralel.

**Yang perlu ditambahkan** (scope final, admin-only):
- Query admin (`admin/albums/[id]/index.ts` atau `packages/sanity/lib/queries.ts`) tambah projection `"originalUrl": image.asset->url` di samping `url`/`thumbnailUrl` yang sudah ada, supaya `AlbumDetail.tsx` punya akses ke URL asli tanpa transformasi.
- Tombol "Download" per-foto di `AlbumDetail.tsx` (link `<a href={originalUrl} download={filename}>` — cek dulu apakah atribut `download` HTML berfungsi untuk cross-origin URL Sanity CDN atau perlu `fetch()`+`blob()`+`URL.createObjectURL()` sebagai fallback yang lebih andal).
- Tombol "Download All (.zip)" di `AlbumDetail.tsx` — fetch semua `originalUrl` album aktif secara paralel/batch (hati-hati rate-limit/memori browser untuk album besar — pertimbangkan batasi concurrency, mis. 4-6 fetch paralel sekaligus, bukan semua sekaligus), bungkus pakai `jszip`, trigger download via `file-saver` atau `URL.createObjectURL`.
- Progress indicator wajib ada untuk download-all (bisa makan waktu lama untuk album besar) — ikuti pola progress/loading state yang sudah ada di komponen admin lain (mis. reorder/upload).
- Test: mock `fetch`/`jszip` di vitest, pastikan tombol disabled saat proses berjalan, error handling kalau salah satu fetch foto gagal (jangan gagal total diam-diam — beri tahu foto mana yang gagal).

**Kriteria selesai**: admin bisa download 1 foto resolusi asli langsung dari `AlbumDetail.tsx`; admin bisa download semua foto aktif dalam 1 album sebagai satu file `.zip` resolusi asli, dengan indikator progress dan penanganan error yang jelas kalau ada foto yang gagal di-fetch.

**⚠️ SUPERSEDE (2026-08-15, dikonfirmasi user)**: keputusan "final" 2026-08-10 di atas (poin 2: sisi klien DITUNDA, admin-only) **sudah tidak berlaku** — user mengonfirmasi secara eksplisit bahwa implementasi sisi **klien** (tab galeri "Cetak"/"Original" + tombol download di `GalleryPage.tsx`/`PhotoLightbox.tsx`, digabung ke branch `feature/final-delivery`/PR #96, commit `41b7478`) memang **disengaja/fokus yang diinginkan**, bukan penyimpangan. Poin 1 (resolusi asli/original), 3 (client-side ZIP via `jszip`), dan semangat 4 (terkait erat dengan #2 final delivery, bukan dikerjakan terpisah setelah #3) tetap sejalan dengan implementasi aktual. Field kontrol admin `showOriginalAfterDelivery` di schema `album` dipakai untuk tetap memberi admin kendali on/off. Detail teknis lengkap: `~/.junie/tasks/FEATURE-final-delivery.md`.

---

## Cara pakai dokumen ini untuk agent/sesi baru

1. Baca `STATUS.md` dulu (state aktual + file map + aturan wajib).
2. Baca bagian fitur yang relevan di sini secara lengkap sebelum mulai coding.
3. Kalau ada "Perlu klarifikasi ke user" di suatu fitur, **tanyakan dulu** sebelum implementasi — jangan asumsi sepihak.
4. Setelah fitur selesai (PR merged & terverifikasi live), update baris Status di tabel Ringkasan Prioritas di atas jadi "MERGED", dan tambahkan pointer ke narasi detail (`~/.junie/tasks/FEATURE-<nama>.md`) — ikuti pola yang sudah dipakai untuk semua PR sebelumnya di `STATUS.md`.
