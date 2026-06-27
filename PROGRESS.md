# YLx — Progress & Status Report
> Last updated: 2026-06-27  
> Branch: `feat/album-crud` (PR #5 open)

---

## Platform Status

| Item | Status |
|------|--------|
| Production URL | https://ylx-msph.vercel.app |
| Sanity Studio | https://ylx-admin.sanity.studio |
| Admin login | `admin@ylex.my.id` / `klp123` |
| Vercel deployment | ✅ Live |
| TypeScript strict | ✅ 0 errors |
| ESLint | ✅ 0 warnings |

---

## Completed Fix Branches (merged to master)

### `fix/gallery-core` — P0 Blocking Bugs
- **BUG-01** `selectionIds → photoIds` field mismatch — submit selalu gagal HTTP 400
- **BUG-02** Field `slug` ditambah ke Sanity album schema — gallery route `/gallery/[slug]` selalu 404
- **BUG-03** `thumbnailUrl` di-generate via `urlFor()` di `verify.ts` — foto tidak muncul

### `fix/security` — Security Critical
- **SEC-01** `requireAdmin()` ditambah ke `unlock.ts` — endpoint unlock tanpa auth
- **SEC-02** `requireAdmin()` ditambah ke `create-admin.ts` + `albums.ts` — public endpoints
- **SEC-03** Cookie `secure: import.meta.env.PROD` — hardcoded `false` di production
- **SEC-04** Single generic error message di `login.ts` — mencegah username enumeration
- **SEC-05** Rate limiter 5 req/15 min per IP+slug di `verify.ts` — PIN brute-force

### `fix/bugs-p1` — P1 Major Bugs
- **BUG-04** `useCallback` di `AlbumList.fetchAlbums` — infinite Ably resubscription loop
- **BUG-05** `album.eventDate` menggantikan `album.createdAt` di AlbumDetail — selalu `undefined`
- **BUG-08** `publishAdminEvent('submission:received')` setelah `transaction.commit()` — real-time tidak fired

### `fix/p2-polish` — P2 Inconsistencies
- **INC-01** GROQ `^.` → `^._id` di `albumWithSelectionsQuery`
- **INC-02** Field `pin` ditambah ke `allAlbumsQuery` — PIN tidak tampil di AlbumCard
- **INC-05** `getAblyClient()` SSR-safe via `Ably.Rest` di server-side
- `isLocked` mapping diperbaiki di albums API response

---

## Branch Aktif: `feat/album-crud` (PR #5)

### Yang Diimplementasikan
- **`POST /api/admin/albums`** — create album baru: validasi PIN 4 digit, `maxSelections` positif, event date tidak lampau, slug auto-generate dengan collision check
- **`PUT /api/admin/albums/[id]`** — update album: verify exists (404 jika tidak ada), validasi sama, slug collision check exclude current ID
- **`DELETE /api/admin/albums/[id]`** — hapus album + semua selections dalam 1 Sanity transaction
- **`AlbumFormModal.tsx`** — modal shared create/edit: framer-motion, prefers-reduced-motion, validasi client-side
- **`AdminPage.tsx`** — tombol "New Album" + `refreshKey` pattern
- **`AlbumDetail.tsx`** — tombol "Edit" dan "Delete" dengan confirm dialog

### Date Picker Enhancement
- Native `<input type="date">` dengan `min={todayString}` — tidak bisa pilih tanggal lampau
- `getLocalTodayString()` menggunakan `en-CA` locale — timezone-aware (bukan UTC)
- Validasi server-side di POST dan PUT: return HTTP 400 jika tanggal lampau

### Bot Review Fixes (commit `478d840`)
| Klaim Bot | Verdict | Tindakan |
|-----------|---------|----------|
| `pattern="\d{4}"` → `[0-9]{4}` | ❌ False positive | Tolak — `\d` valid di semua browser modern |
| `maxSelections` snap ke 1 saat clear | ✅ Bug nyata | Fix: state `number \| ''`, validasi hanya saat submit |
| Backdrop close saat submitting | ✅ Risk nyata | Fix: `!isSubmitting` guard di backdrop + Esc key |
| Modal Esc handler + focus trap | ⚠️ Sebagian benar | Fix: Esc handler ditambah; initial focus sudah ada via `autoFocus` |
| Slug collision create | ✅ Bug nyata | Fix: query collision sebelum create, append base36 timestamp |
| PUT tanpa verify album exists | ✅ Bug nyata | Fix: fetch album dulu, return 404 jika tidak ada |
| `title`/`status` optional di types | ✅ Valid | Fix: dijadikan required di semua interfaces |

### Status PR #5
- CI: ✅ CodeQL passed, ✅ Vercel preview passed
- Bot reviews: 16 thread dibalas (fixes diakui, false positive ditolak dengan reasoning)
- Siap merge setelah review

---

## Additional Fixes (post-merge, direct to master)

- `packages/sanity/lib/queries.ts`: `order(createdAt desc)` → `order(_createdAt desc)` — Sanity system fields pakai underscore prefix
- `packages/sanity/client.ts`: `useCdn: false` — CDN cache menyebabkan data baru tidak muncul
- `apps/web/src/components/gallery/GalleryPage.tsx`: `setAlbum(data.album)` — mismatch API response shape; `isAlbumLocked()` helper

---

## Infrastructure & Tooling

### MCP Servers Aktif (9 server)
| Server | Package |
|--------|---------|
| playwright | MCP Playwright |
| filesystem | MCP Filesystem |
| sequential-thinking | MCP Sequential Thinking |
| memory | MCP Memory |
| context7 | Context7 docs |
| github | GitHub MCP |
| kernel | Kernel cloud browser |
| linear | `@mseep/linear-mcp` via npx |
| sanity | `https://mcp.sanity.io/mcp` (hosted) |

> Vercel MCP dihapus — butuh OAuth browser, tidak bisa di VPS headless.  
> Untuk operasi Vercel: gunakan token di `~/.local/share/com.vercel.cli/auth.json`

### Linear Integration
- Team: **Ylx** | ID: `bc11a289-8943-48bc-9679-87557d86ea0e`
- API: GraphQL di `https://api.linear.app/graphql`
- Issues terkait PR: YLX-5 (gallery-core), YLX-6 (security), YLX-7 (bugs-p1), YLX-8 (p2-polish), YLX-9 (album-crud)

### Sanity
- Project: `741sif2l` | Dataset: `production`
- Token role: `write` (dapat create + update/patch)
- Token tersimpan di `apps/web/.env.local` dan Vercel env vars (preview + production)

### Scripts
- `scripts/seed-admin.mjs` — reset admin password via CLI: `node scripts/seed-admin.mjs <email> <password>`  
  ⚠️ File di-gitignore — jalankan lokal saja, jangan commit

---

## Security Status

| Item | Status |
|------|--------|
| Admin password | ✅ bcrypt 12 rounds |
| Session cookie | ✅ `secure: PROD` |
| Auth guards | ✅ Semua admin endpoints |
| Username enumeration | ✅ Generic error message |
| PIN brute-force | ✅ Rate limiter 5×/15min |
| `.git` web exposure | ✅ Blocked via vercel.json rewrite |
| Env files web exposure | ✅ Blocked via vercel.json rewrite |
| Error detail exposure | ✅ `details: String(err)` dihapus |
| Hardcoded credentials | ✅ Tidak ada di repo |

---

## Accessibility Status

| Item | Status |
|------|--------|
| Keyboard navigation gallery | ✅ `role="button"`, `tabIndex`, `onKeyDown` |
| `prefers-reduced-motion` | ✅ `useReducedMotion()` di semua komponen |
| Accent color contrast | ✅ 4.8:1 (melebihi WCAG AA 4.5:1) |
| Mobile nav | ✅ Bottom nav bar di `AdminLayout.astro` |
| SVG decorative | ✅ `aria-hidden="true"` |
| CSS transition easing | ✅ Ganti bounce `cubic-bezier(0.34, 1.56...)` → ease-out-quint |
| Progress bar animation | ✅ `transform: scaleX()` (GPU-accelerated, bukan layout-thrashing) |

---

## Known Stubs / Incomplete

| Item | File | Catatan |
|------|------|---------|
| Mastra workflow | `api/admin/workflow.ts` | Selalu return `{ success: true }` tanpa jalankan Mastra sesungguhnya |
| Python batch upload | `scripts/batch-upload.py` | Sudah ada, belum ditest dengan foto nyata di production |

---

## Next Steps (Backlog)

1. **Merge PR #5** (`feat/album-crud`) — semua CI pass, bot review sudah dibalas
2. **Upload foto test** — gunakan Python batch script atau admin upload untuk test gallery end-to-end dengan foto nyata
3. **Implement Mastra workflow** — ganti stub di `api/admin/workflow.ts` dengan integrasi Mastra sesungguhnya
4. **End-to-end test** — flow lengkap: create album → share gallery link → client pilih foto → admin lihat seleksi → copy filenames untuk Lightroom

---

## File Referensi

| File | Isi |
|------|-----|
| `AGENTS.md` | Panduan arsitektur, tech stack, dan guidelines untuk AI agent |
| `CONTEXT.md` | Konteks project lengkap |
| `DESIGN.md` | Design system, tokens, komponen guidelines |
| `PRODUCT.md` | Product requirements, user stories |
| `REVIEW.md` | Code review checklist — semua lessons learned dari 2 siklus audit |
| `PROGRESS.md` | File ini — last progress snapshot |
