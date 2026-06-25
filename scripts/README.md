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
