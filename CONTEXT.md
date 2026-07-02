# YLx — Project Context

> ⚠️ **PENTING:** File ini sudah diperbarui pada 2026-07-02.
> Token Sanity di versi lama file ini sudah **di-revoke** dan tidak boleh digunakan.
> Untuk state aktual project, baca **`STATUS.md`** — bukan file ini.

---

## Setup Development

### 1. Clone & Install

```bash
git clone https://github.com/msph1973/ylx.git
cd ylx
pnpm install
```

### 2. Environment Variables

Buat `apps/web/.env.local` (tanya owner untuk nilai aktual):

```env
PUBLIC_SANITY_PROJECT_ID=741sif2l
PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=<write token dari Sanity dashboard>
PUBLIC_ABLY_KEY=<subscribe-only Ably key>
ABLY_API_KEY=<full Ably key>
```

> Generate token Sanity baru dari: https://www.sanity.io/manage/project/741sif2l/api
> Role: **write** (bukan viewer/read)

### 3. Dev Server

```bash
cd apps/web
pnpm dev
# → http://localhost:4321
# → Admin: http://localhost:4321/admin/login
```

### 4. Sanity Studio

Deployed di: https://ylx-admin.sanity.studio/

Deploy ulang schema (jika ada perubahan di `packages/sanity/schemas/`):
```bash
cd packages/sanity
npx sanity login   # butuh browser — lakukan dari laptop, bukan VPS
npx sanity deploy
```

---

## File Referensi

| File | Baca untuk |
|------|-----------|
| **`STATUS.md`** | **State aktual project — baca ini pertama** |
| `AGENTS.md` | Architecture + rules untuk AI agent |
| `REVIEW.md` | Code review checklist, anti-patterns |
| `DESIGN.md` | Design system tokens |
| `PRODUCT.md` | Product requirements |
| `PROGRESS.md` | History semua PR dan bug fixes |

---

## Ringkasan Project

YLx adalah platform Photo Proofing Gallery untuk wedding photographer:
- Fotografer upload foto ke album
- Klien buka gallery via slug + PIN
- Klien pilih foto yang diinginkan
- Fotografer export nama file terpilih ke Lightroom

### Stack Aktual

| Layer | Tech |
|-------|------|
| Frontend | Astro 5 + React 18 (islands) |
| Data | Sanity v4 |
| Realtime | Ably |
| Auth | Email + bcrypt (admin tunggal) |
| Deploy | Vercel Serverless |
| Monorepo | Turborepo + pnpm |

> Tidak ada Prisma, tidak ada OAuth, tidak ada Mastra terintegrasi (stub saja).

---

## Vercel Deployment

Project: `ylx` di https://vercel.com/msph1973
- `rootDirectory: apps/web`
- `framework: astro`
- `nodeVersion: 20.x`
- Build command (project settings): `cd ../.. && pnpm turbo build --filter=@ylx/web --force`

Deploy via CLI:
```bash
VERCEL_TOKEN=$(python3 -c "import json; d=json.load(open('$HOME/.local/share/com.vercel.cli/auth.json')); print(d['token'])" 2>/dev/null) vercel deploy --prod
# Atau gunakan: vercel --token <token> deploy --prod
```
