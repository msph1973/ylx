# 🚀 Cara Melanjutkan Project YLx

## Ringkasan Project

YLx adalah platform Photo Proofing Gallery untuk wedding photographer. Klien memilih foto dari gallery yang dilindungi PIN; fotografer export nama file yang dipilih untuk Lightroom.

**Status: 95% selesai** — Sisa: fix Vercel deployment (404 error) + security improvements

---

## 1. Clone Repository

```bash
git clone https://github.com/msph1973/ylx.git
cd ylx
pnpm install
```

## 2. Setup Environment Variables

Buat file `.env` di root project:

```env
# Sanity
SANITY_PROJECT_ID=741sif2l
SANITY_API_TOKEN=skEYnSH0MmnzEfKMPxheBTm2Crw7OdHSRWEPq5ef8dmbLYZ1kBIFPSFvSn3lkC0Rj9HprdyRaVYEbLU7ovwBOqZyNHGKkZP3kp0CTxIcxznwE9yxdKKX1CAJLrReQxbFzNyJnPnxzRIWkxVnuwmPvoBA4jerVsWOWMUGvXgEd8BH3oEyd22n
SANITY_DATASET=production

# Ably
ABLY_API_KEY=d9EwSQ.hIkV0Q:BLylbYYbFy6ByH7BvyTjkOFfIZq97k4GNJ0g9SdY5Tg

# Mastra
MASTRA_API_KEY=sk_QaHLl3zSKaibQCL7mxNvw3rk0s6pE97DFyXiBzw7tI90yI
```

Buat file `apps/web/.env.local`:

```env
# Sanity (public)
PUBLIC_SANITY_PROJECT_ID=741sif2l
PUBLIC_SANITY_DATASET=production

# Sanity (private - server-side)
SANITY_API_TOKEN=skEYnSH0MmnzEfKMPxheBTm2Crw7OdHSRWEPq5ef8dmbLYZ1kBIFPSFvSn3lkC0Rj9HprdyRaVYEbLU7ovwBOqZyNHGKkZP3kp0CTxIcxznwE9yxdKKX1CAJLrReQxbFzNyJnPnxzRIWkxVnuwmPvoBA4jerVsWOWMUGvXgEd8BH3oEyd22n

# Ably (subscribe-only)
PUBLIC_ABLY_KEY=d9EwSQ.VMt86Q:cmp2RgBCnxU6XC7VmFak15z6pG7Hg5XTLpwFDTFYdxE
```

## 3. Jalankan Development Server

```bash
cd apps/web
pnpm dev
```

Akses:
- Homepage: http://localhost:4321
- Admin: http://localhost:4321/admin/login
- Login: `admin@ylex.my.id` / `klp123`

## 4. Sanity Studio

Sudah deployed di: https://ylx-admin.sanity.studio/

Login pakai Google/GitHub yang sama dengan Sanity dashboard.

---

## File Penting

| File | Fungsi |
|------|--------|
| `AGENTS.md` | Arahan untuk AI agent |
| `PRODUCT.md` | Spesifikasi product |
| `DESIGN.md` | Design system |
| `AUDIT-2026-06-24.md` | Laporan audit (20/20) |
| `docs/compose/specs/` | Design spec |
| `docs/compose/plans/` | Implementation plan |
| `scripts/` | Python batch upload |

---

## Yang Sudah Selesai

| Komponen | Status |
|----------|--------|
| Monorepo + Turborepo | ✅ |
| Sanity schemas (5 types) | ✅ |
| Sanity Studio | ✅ Deployed |
| Admin auth (login/logout) | ✅ |
| Gallery (PIN, photo grid, selection) | ✅ |
| Admin dashboard (album list, detail, unlock) | ✅ |
| Upload page (drag-drop, batch) | ✅ |
| API endpoints (gallery + admin) | ✅ |
| Ably real-time | ✅ |
| Mastra workflows | ✅ |
| Python batch upload | ✅ |
| Audit score | ✅ 20/20 |
| E2E tests | ✅ |

---

## Yang Perlu Dilanjutkan

### 1. Fix Vercel Deployment (Prioritas Utama)

**Masalah:** Build berhasil tapi live URL return 404.

**Status:** Project `ylx-web` sudah dihapus. Hanya ada 1 project: `ylx`.

**Solusi:**
1. Login Vercel Dashboard: https://vercel.com
2. Pastikan project `ylx` terhubung ke repo `msph1973/ylx`
3. Disable Deployment Protection di Settings → Deployment Protection
4. Set environment variables (lihat bawah)
5. Push ke GitHub atau deploy via CLI

**Set environment variables di Vercel:**
```
SANITY_PROJECT_ID=741sif2l
SANITY_DATASET=production
SANITY_API_TOKEN=skEYnSH0MmnzEfKMPxhe...
PUBLIC_SANITY_PROJECT_ID=741sif2l
PUBLIC_SANITY_DATASET=production
PUBLIC_ABLY_KEY=d9EwSQ.VMt86Q:cmp2Rg...
ABLY_API_KEY=d9EwSQ.hIkV0Q:BLylb...
MASTRA_API_KEY=sk_QaHLl3zSKaibQCL7...
```

**Atau deploy via CLI:**
```bash
vercel deploy --prod --yes
```

### 2. Password Hashing (Security)

Saat ini password admin disimpan plain text. Untuk production:

```bash
# Install bcrypt
pnpm add bcryptjs
pnpm add -D @types/bcryptjs
```

Update `packages/sanity/lib/admin.ts` untuk hash password.

### 3. CORS Configuration

Untuk production, CORS perlu dikonfigurasi di Sanity dashboard:
- Buka https://www.sanity.io/manage
- Pilih project `741sif2l`
- Settings → CORS Origins
- Tambahkan domain production

---

## Credentials

| Service | Value |
|---------|-------|
| Sanity Project ID | `741sif2l` |
| Sanity Dataset | `production` |
| Admin Email | `admin@ylex.my.id` |
| Admin Password | `klp123` |
| Sanity Studio | https://ylx-admin.sanity.studio/ |

---

## Tech Stack

- **Frontend:** Astro 4.x + React 18 + Framer Motion
- **Backend:** Sanity (headless CMS)
- **Real-time:** Ably
- **Workflows:** Mastra
- **Monorepo:** Turborepo
- **Deployment:** Vercel
- **Testing:** Vitest + Playwright

---

## Untuk AI Agent Baru

Copy prompt ini:

```
Project: YLx Photo Proofing Platform
Status: 95% complete, Vercel deployment needs final fix
Repo: https://github.com/msph1973/ylx.git

Read these files first:
1. AGENTS.md
2. PRODUCT.md
3. DESIGN.md
4. AUDIT-2026-06-24.md

Remaining work:
- Fix Vercel 404 deployment (project ylx-web already deleted)
- Add bcrypt for admin passwords
- Configure CORS

Credentials in .env files.
```

---

## 5. Install Skills untuk AI Agent

### Link GitHub Skills

| Skill | GitHub Link | Install |
|-------|-------------|---------|
| **Impeccable** | https://github.com/pbakaus/impeccable | `npx impeccable install` |
| **Sanity** | https://github.com/sanity-io/agent-toolkit | `npx sanity@latest mcp configure` |
| **Mastra** | https://github.com/mastra-ai/skills | `git clone https://github.com/mastra-ai/skills ~/.mimocode/skills/mastra` |

### Compose Skills (Custom/MiMoCode Built-in)

Compose skills di `~/.local/share/mimocode/compose/0.1.1/skills/` adalah custom skills yang dibuat oleh MiMoCode team. **Tidak tersedia sebagai GitHub repo publik.**

**Skills yang ada:**
- `ask` — User interaction
- `brainstorm` — Design planning
- `debug` — Debugging
- `execute` — Task execution
- `feedback` — Feedback handling
- `merge` — Git merge
- `new-skill` — Create new skills
- `parallel` — Parallel execution
- `plan` — Implementation planning
- `report` — Reporting
- `review` — Code review
- `subagent` — Subagent dispatch
- `tdd` — Test-driven development
- `verify` — Verification
- `worktree` — Git worktree

**Cara dapatkan:**
1. Copy dari environment lain yang sudah terinstall
2. Atau buat sendiri sesuai kebutuhan

**Alternatif:** Gunakan skills serupa dari GitHub:
- https://github.com/shinpr/claude-code-workflows
- https://github.com/travisvn/awesome-claude-skills

### Install via GitHub

**1. Impeccable (UI/UX Standards)**
```bash
npx impeccable install
```

**2. Sanity Best Practices**
```bash
npx sanity@latest mcp configure
```

**3. Mastra Framework**
```bash
git clone https://github.com/mastra-ai/skills ~/.mimocode/skills/mastra
```

**4. GitHub CLI**
```bash
# Install gh CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install gh
gh auth login
```

### Skills yang Diperlukan

| Skill | Fungsi | Wajib? |
|-------|--------|--------|
| `impeccable` | UI/UX audit & polish | Ya |
| `sanity-best-practices` | Sanity development | Ya |
| `mastra` | Mastra workflows | Opsional |
| `github` | Git operations | Ya |
| `compose:*` | Planning, execution | Ya (built-in) |

### Verifikasi

```bash
# Test impeccable
/impeccable audit apps/web

# Test sanity
sanity --help

# Test gh
gh auth status
```
   ~/.local/share/mimocode/compose/0.1.1/skills/
   ```

2. **Domain skills** — install manual:
   ```bash
   # Membuat direktori skills
   mkdir -p ~/.mimocode/skills/

   # Contoh: copy skills dari VPS ini ke environment baru
   scp -r vps:~/.mimocode/skills/sanity-best-practices ~/.mimocode/skills/
   scp -r vps:~/.mimocode/skills/impeccable ~/.mimocode/skills/
   scp -r vps:~/.mimocode/skills/mastra ~/.mimocode/skills/
   ```

3. **Atau download dari source:**
   ```bash
   # Sanity best practices
   git clone https://github.com/sanity-io/sanity-best-practices ~/.mimocode/skills/sanity-best-practices

   # Impeccable (UI/UX)
   # Download dari repository atau buat manual
   ```

### Skills yang Diperlukan untuk Project Ini

| Skill | Fungsi | Wajib? |
|-------|--------|--------|
| `compose:*` | Planning, execution, review | Ya |
| `impeccable` | UI/UX audit & polish | Ya |
| `sanity-best-practices` | Sanity schema & queries | Ya |
| `mastra` | Mastra workflows | Opsional |
| `github-*` | Git operations | Ya |

### Verifikasi Skills

Cek apakah skills sudah terinstall:

```bash
# Compose skills
ls ~/.local/share/mimocode/compose/0.1.1/skills/

# Domain skills
ls ~/.mimocode/skills/
```

---

*Dibuat: 26 Juni 2026*
*Project: YLx Photo Proofing Platform*
