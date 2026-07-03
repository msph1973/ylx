# Admin Dashboard Enhancements

Peningkatan dasbor admin YLx berdasarkan hasil audit: manajemen album/foto yang lebih lengkap,
pencarian & filter, aksi massal, status `submitted` yang jelas, aksesibilitas modal, dan polish
mobile. Dibangun mengikuti sistem desain (dark theme + amber accent) dan skill `impeccable`.

## Ringkasan fitur

| Kategori | Yang ditambahkan |
|---|---|
| Search & Filter | Kotak pencarian album (client / judul / PIN) + filter status ber-hitung (All / Active / Submitted / Locked), 100% client-side |
| Bulk operations | Mode pilih di daftar album, select all / deselect all, dan **hapus massal** lewat satu endpoint transaksi atomik |
| Photo management | Grid "All Photos" dengan thumbnail di detail album + **hapus per-foto**, plus thumbnail di tabel pilihan |
| Album lock | Tombol **Lock Gallery** manual (melengkapi Unlock yang sudah ada) |
| Status `submitted` | Submit klien kini menandai album `submitted` (berbeda dari `locked` manual) — di-surface via badge + filter |
| Accessibility | Focus trap pada semua modal + zona unggah yang bisa dioperasikan keyboard |
| Mobile polish | Toolbar sticky, target sentuh ≥42px, kontrol hapus foto yang selalu tampil di layar sentuh |

## Perubahan data & alur

- **Status album** kini punya 3 nilai: `active` → `submitted` (klien submit) → `locked` (dikunci admin).
  Galeri memperlakukan `submitted` & `locked` sebagai terkunci; submit hanya diterima saat `active`.
- **Upload** kini menautkan foto ke `album.photos` (single source of truth) — sebelumnya foto hanya
  menyimpan referensi `album`, sehingga galeri/validasi submit/grid admin bisa tidak sinkron.
- **Hapus album** (tunggal & massal) memakai helper cascade atomik: menghapus selections, submissions,
  dan photos dalam satu transaksi agar integritas referensi Sanity terjaga.
- **Hapus foto** melepaskan foto dari `album.photos`, menghapus selections terkait, dan melepasnya dari
  submission sebelum menghapus dokumen foto (semua atomik).
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
| `apps/web/src/pages/api/admin/albums/bulk-delete.ts` | Endpoint hapus banyak album (transaksi tunggal) |
| `apps/web/src/pages/api/admin/photos/[id].ts` | Endpoint hapus satu foto (aman referensi) |
| `docs/admin-dashboard-enhancements.md` | Dokumen ringkasan ini |

## File yang diedit

| File | Perubahan |
|---|---|
| `apps/web/src/components/admin/AlbumList.tsx` | Toolbar pencarian, filter status, mode pilih, bar seleksi, hapus massal |
| `apps/web/src/components/admin/AlbumCard.tsx` | Badge 3-status, mode pilih (checkbox + state terpilih), fokus terlihat |
| `apps/web/src/components/admin/AlbumDetail.tsx` | Badge status, Lock/Unlock kondisional, grid foto + hapus per-foto, dialog ber-focus-trap |
| `apps/web/src/components/admin/AlbumFormModal.tsx` | Focus trap + role dialog pada modal |
| `apps/web/src/components/admin/SelectionTable.tsx` | Kolom thumbnail |
| `apps/web/src/components/admin/UploadPage.tsx` | Zona unggah keyboard-accessible (role/tabindex/Enter-Space + focus ring) |
| `apps/web/src/hooks/useAdminRealtime.ts` | Berlangganan semua event channel admin |
| `apps/web/src/pages/api/admin/albums.ts` | `isLocked` mencakup status non-`active` |
| `apps/web/src/pages/api/admin/albums/[id]/index.ts` | Thumbnail + LQIP di respons, cascade delete, event `album:deleted` |
| `apps/web/src/pages/api/admin/upload.ts` | Menambah foto ke `album.photos` |
| `apps/web/src/pages/api/gallery/[slug]/submit.ts` | Set status `submitted`; tolak submit jika album bukan `active` |
| `apps/web/src/styles/variables.css` | Menambah token `--space-1-5` & `--space-2-5` (sebelumnya tak terdefinisi) |
| `packages/sanity/schemas/album.ts` | Opsi status `Submitted` |
| `packages/sanity/lib/queries.ts` | Menyertakan LQIP untuk thumbnail admin |

## Verifikasi

- `pnpm exec tsc --noEmit` — lolos
- `pnpm exec eslint src --max-warnings 0` — lolos
- `pnpm exec vitest run` — 3/3 lolos
- E2E `admin.spec.ts` / `gallery.spec.ts` — selektor & asumsi status yang diuji tetap kompatibel
