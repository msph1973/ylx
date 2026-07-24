# YLx Photo Batch Upload

Script Python untuk upload foto massal ke Sanity dengan fitur watch folder.

## Instalasi

```bash
cd scripts
pip install -r requirements.txt
```

## Setup Environment

```bash
export SANITY_PROJECT_ID=741sif2l
export SANITY_API_TOKEN=your_token_here
```

## Usage

### Upload Sekali Jalan
```bash
# Upload semua foto di folder
python upload.py --folder /path/to/photos --album-id <album_id>

# Upload dengan batch size custom
python upload.py --folder /path/to/photos --album-id <album_id> --batch-size 50
```

### Watch Folder (Auto Upload)
```bash
# Pantau folder, auto upload saat foto baru terdeteksi
python upload.py --folder /path/to/photos --album-id <album_id> --watch
```

### Contoh Lengkap
```bash
# Upload 200 foto ke album tertentu
python upload.py \
  --folder ~/wedding-photos \
  --album-id abc123def \
  --batch-size 100 \
  --project-id 741sif2l \
  --token skEYnSH0Mm...
```

## Fitur

- **Batch Upload**: Max 100 foto per batch
- **File Size Limit**: Max 50MB per foto
- **Retry Mechanism**: Auto retry 3x jika gagal
- **Deduplication**: Skip foto yang sudah di-upload (berdasarkan MD5 hash)
- **Watch Folder**: Auto upload saat foto baru terdeteksi
- **Multi-threaded**: Upload paralel untuk performa lebih cepat

## Supported Formats

`.jpg`, `.jpeg`, `.png`, `.webp`, `.tiff`, `.tif`, `.raw`, `.cr2`, `.nef`, `.arw`

## Mendapatkan Album ID

1. Login ke admin dashboard: `http://localhost:4321/admin`
2. Buka album yang ingin di-upload
3. Copy ID dari URL atau inspect network request

Atau via Sanity CLI:
```bash
npx sanity@latest documents list --filter '_type == "album"'
```

# YLx E2E BrowserAct Test

Script bash `e2e-browseract.sh` yang menjalankan pengujian end-to-end alur inti YLx
(admin login → buat album → upload foto asli → client masuk pakai PIN → pilih &
submit foto → admin lihat & unlock → album test dihapus) lewat browser sungguhan,
digerakkan dengan CLI [`browser-act`](https://www.browseract.com).

## Prasyarat

- CLI `browser-act` sudah terinstall dan ter-autentikasi:
  ```bash
  uv tool install browser-act-cli
  browser-act --version
  browser-act browser list
  ```
- `jq` terinstall (dipakai untuk parsing response API yang direkam browser-act).
- File foto asli untuk diupload (default: `test-foto.JPG` di root repo).

## Usage

```bash
YLX_ADMIN_EMAIL=admin@example.com YLX_ADMIN_PASSWORD=secret \
  ./scripts/e2e-browseract.sh
```

### Env Vars

| Var | Wajib | Default | Keterangan |
|---|---|---|---|
| `BASE_URL` | tidak | `https://ylex.my.id` | Target deployment yang diuji |
| `YLX_ADMIN_EMAIL` | ya | — | Email login admin |
| `YLX_ADMIN_PASSWORD` | ya | — | Password login admin (jangan hardcode, isi lewat env var) |
| `PHOTO_PATH` | tidak | `test-foto.JPG` di root repo | Foto asli yang diupload |
| `BROWSERACT_BROWSER_ID` | tidak | browser pertama dari `browser-act browser list` | Browser `browser-act` yang dipakai |
| `TEST_MAX_SELECTIONS` | tidak | `15` | Max selection untuk album test |

Script ini non-interaktif dan aman dijalankan berulang kali: setiap run membuat
album test dengan judul unik bertimestamp, dan **selalu menghapusnya lagi di akhir**
lewat `trap` cleanup — jadi album test tetap terhapus walau salah satu tahap
di tengah gagal. Jalankan `bash -n scripts/e2e-browseract.sh` untuk cek sintaks
sebelum eksekusi.
