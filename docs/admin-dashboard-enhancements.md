# Admin Dashboard Enhancements

Peningkatan dasbor admin YLx berdasarkan hasil audit: manajemen album/foto yang lebih lengkap,
pencarian & filter, aksi massal, **pagination**, **bulk photo delete**, **reorder foto**, status
`submitted` yang jelas, aksesibilitas modal, dan **mobile-first pass**. Dibangun mengikuti sistem
desain (dark theme + amber accent) dan skill `impeccable`.

> Status: dikerjakan di branch `feat/admin-dashboard-impeccable` (PR #19, **OPEN — belum merge**).
> Admin E2E (`tests/admin.spec.ts`) kini **4/4 pass lokal** (pagination, bulk photo delete, reorder, lock/unlock).

## Ringkasan fitur

| Kategori | Yang ditambahkan |
|---|---|
| Search & Filter | Kotak pencarian album (client / judul / PIN) + filter status ber-hitung (All / Active / Submitted / Locked), 100% client-side |
| Bulk operations (album) | Mode pilih di daftar album, select all / deselect all, dan **hapus massal** lewat satu endpoint transaksi atomik |
| Pagination album | Daftar album ter-paginate client-side (`PAGE_SIZE=12`) dengan kontrol Prev/Next, tetap hormati search + filter |
| Photo management | Grid "All Photos" dengan thumbnail di detail album + **hapus per-foto**, plus thumbnail di tabel pilihan |
| Bulk photo delete | Mode select foto di grid (select-all/clear) + tombol "Delete N photos" dengan `ConfirmDialog`, satu endpoint transaksi |
| Reorder foto | Drag-and-drop native HTML5 + fallback tombol naik/turun (keyboard), urutan dipersist ke `album.photos` |
| Album lock | Tombol **Lock Gallery** manual (melengkapi Unlock yang sudah ada) |
| Status `submitted` | Submit klien kini menandai album `submitted` (berbeda dari `locked` manual) — di-surface via badge + filter |
| Accessibility | Focus trap pada semua modal + zona unggah yang bisa dioperasikan keyboard + reorder keyboard-accessible + `prefers-reduced-motion` |
| Mobile-first (≤480px) | Toolbar wrap, modal full-height (`100dvh`), grid 1 kolom, tabel selection scrollable, target sentuh ≥44px |

## Perubahan data & alur

- **Status album** kini punya 3 nilai: `active` → `submitted` (klien submit) → `locked` (dikunci admin).
  Galeri memperlakukan `submitted` & `locked` sebagai terkunci; submit hanya diterima saat `active`.
- **Upload** kini menautkan foto ke `album.photos` (single source of truth) — sebelumnya foto hanya
  menyimpan referensi `album`, sehingga galeri/validasi submit/grid admin bisa tidak sinkron.
- **Hapus album** (tunggal & massal) memakai helper cascade atomik: menghapus selections, submissions,
  dan photos dalam satu transaksi agar integritas referensi Sanity terjaga.
- **Hapus foto** (tunggal & massal) melepaskan foto dari `album.photos`, menghapus selections terkait,
  dan melepasnya dari submission sebelum menghapus dokumen foto (semua atomik dalam satu transaksi).
- **Reorder foto** mengirim urutan `photoIds` baru ke `PATCH /api/admin/albums/[id]/reorder`; server
  memvalidasi semua `_ref` milik album lalu `set` ulang array `album.photos` (menjaga `_key` tiap item).
  Klien memakai optimistic update + rollback bila gagal, lalu refetch untuk menghindari drift dengan upload konkuren.
- **Pagination** murni client-side atas hasil `filteredAlbums` (setelah search/filter) — API `/api/admin/albums`
  tetap mengembalikan list ringkas; halaman reset ke 1 saat search/filter berubah.
- **Realtime**: `useAdminRealtime` kini berlangganan semua event channel admin (termasuk `album:deleted`,
  `album:locked`, `photo:deleted`, `submission:received`) sehingga dasbor selalu refetch pada perubahan.

## File yang dibuat

| File | Tujuan |
|---|---|
| `apps/web/src/components/admin/ConfirmDialog.tsx` | Modal konfirmasi destruktif reusable dengan focus trap |
| `apps/web/src/hooks/useFocusTrap.ts` | Hook jebakan fokus + restore fokus untuk modal |
| `apps/web/src/lib/albumStatus.ts` | Metadata status album (label, variant badge, hint) |
| `apps/web/src/lib/albumDeletion.ts` | `cascadeDeleteAlbums()` — hapus album + dependensi atomik |
| `apps/web/src/pages/api/admin/albums/[id]/lock.ts` | Endpoint kunci galeri manual |
| `apps/web/src/pages/api/admin/albums/[id]/reorder.ts` | Endpoint reorder foto (PATCH; validasi ref + `set` ulang `album.photos`) |
| `apps/web/src/pages/api/admin/albums/bulk-delete.ts` | Endpoint hapus banyak album (transaksi tunggal) |
| `apps/web/src/pages/api/admin/photos/[id].ts` | Endpoint hapus satu foto (aman referensi) |
| `apps/web/src/pages/api/admin/photos/bulk-delete.ts` | Endpoint hapus banyak foto sekaligus (strong-ref cleanup, satu transaksi) |
| `apps/web/tests/helpers/adminSession.ts` | Seed cookie `admin_session` HMAC-signed untuk E2E admin |
| `apps/web/tests/admin.spec.ts` | E2E admin: pagination, bulk photo delete, reorder, lock/unlock |
| `docs/admin-dashboard-enhancements.md` | Dokumen ringkasan ini |

## File yang diedit

| File | Perubahan |
|---|---|
| `apps/web/src/components/admin/AlbumList.tsx` | Toolbar pencarian, filter status, mode pilih, bar seleksi, hapus massal, **pagination (Prev/Next)**, loading state saat refetch, mobile-first |
| `apps/web/src/components/admin/AlbumCard.tsx` | Badge 3-status, mode pilih (checkbox + state terpilih), fokus terlihat |
| `apps/web/src/components/admin/AlbumDetail.tsx` | Badge status, Lock/Unlock kondisional, grid foto + hapus per-foto, **bulk photo select + delete**, **reorder (drag + keyboard)**, loading state saat refetch, dialog ber-focus-trap, mobile-first |
| `apps/web/src/components/admin/AlbumFormModal.tsx` | Focus trap + role dialog; validasi future-date **hanya saat create** (album lampau bisa diedit); modal full-height + target sentuh ≥44px |
| `apps/web/src/components/admin/SelectionTable.tsx` | Kolom thumbnail (field `thumbnailUrl` bertipe, tanpa cast longgar) + tabel scrollable di mobile |
| `apps/web/src/components/admin/UploadPage.tsx` | Zona unggah keyboard-accessible (role/tabindex/Enter-Space + focus ring) |
| `apps/web/src/hooks/useAdminRealtime.ts` | Berlangganan semua event channel admin |
| `apps/web/src/pages/api/admin/albums.ts` | `isLocked` mencakup status non-`active` |
| `apps/web/src/pages/api/admin/albums/[id]/index.ts` | Thumbnail + LQIP di respons, cascade delete, event `album:deleted`; **PUT tidak lagi menolak tanggal lampau** (edit album event lampau kini konsisten dengan klien) |
| `apps/web/src/pages/api/admin/upload.ts` | Menambah foto ke `album.photos` |
| `apps/web/src/pages/api/gallery/[slug]/submit.ts` | Set status `submitted`; tolak submit jika album bukan `active` |
| `apps/web/src/components/gallery/GalleryPage.tsx` | Optimistic status pasca-submit `'submitted'` (selaras server; `isAlbumLocked()` tetap perlakukan `submitted`+`locked` sebagai tertutup) |
| `apps/web/src/styles/variables.css` | Menambah token `--space-1-5` & `--space-2-5` (sebelumnya tak terdefinisi) |
| `packages/sanity/schemas/album.ts` | Opsi status `Submitted` |
| `packages/sanity/lib/queries.ts` | Menyertakan LQIP untuk thumbnail admin |

## Verifikasi

- `pnpm exec tsc --noEmit` — lolos
- `pnpm exec eslint src --max-warnings 0` — lolos
- `pnpm exec vitest run` — 3/3 lolos
- `pnpm exec playwright test tests/admin.spec.ts` — **4/4 pass** (~14s): pagination, bulk photo delete, reorder (keyboard), lock/unlock. API di-mock via `page.route`; auth via signed-session helper.
- E2E `gallery.spec.ts` — selektor & asumsi status yang diuji tetap kompatibel

## Bot review (PR #19)

- **Sourcery / Devin** — pass. Temuan Devin yang **sudah diperbaiki**:
  1. PUT `albums/[id]/index.ts` masih menolak tanggal lampau meski klien sudah dilonggarkan → validasi past-date dihapus dari handler edit (create tetap enforce di `albums.ts`).
  2. `GalleryPage.tsx` optimistic status pasca-submit masih `'locked'` sedangkan server kini `'submitted'` → diselaraskan ke `'submitted'`.
  3. PUT edit tidak memancarkan event realtime → ditambah `publishAdminEvent('album:updated')` (guarded) setelah commit, konsisten dengan endpoint lain.
  4. Respons GET album detail tidak mengembalikan `url` foto (langgar kontrak `Photo`, REVIEW.md §4.2/§3.5) → ditambah `url: urlFor(image).url()` untuk photos + selections.
  5. `reorder.ts` bisa gagal untuk referensi tanpa `_key` (data lama) → selalu set `_key` (fallback ke `_ref`).
  Catatan 🚩 non-blocking: backfill `album.photos` untuk foto yang diunggah sebelum perubahan (follow-up terpisah).
- **CodeQL / Analyze / verify / Vercel** — pass.
- **Kilo Code Review** — status `fail`, tetapi bukan temuan kode: output check-run = "Review failed: Assistant request failed" (kegagalan layanan/kuota bot, bukan isu di repo).
- Verifikasi produksi (preview `0db00f3`): homepage `200`, `/admin` `302 → /admin/login`, endpoint `photos/bulk-delete` & `albums/[id]/reorder` tanpa auth → `401` (guard `requireAdmin` aktif).
