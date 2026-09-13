# S2 Multitenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satu instance YLx melayani banyak bisnis fotografi independen: tiap vendor login via Google (hanya email yang di-invite superadmin), hanya melihat album miliknya, galeri kliennya memakai brand akunnya.

**Architecture:** Peran `admin`/`photographer` dimigrasi ke `superadmin`/`vendor`; `album.owner` (reference→admin) diisi server-side saat create dan dipakai sebagai filter otorisasi di semua endpoint admin; sesi tetap satu cookie `admin_session` HMAC (tambah `role` ketat + `ownerId`); brand (`logoUrl`, `accentColor`) tinggal di dokumen vendor dan di-resolve galeri via `album.owner`.

**Tech Stack:** Astro API routes, Sanity v4 (schemas + GROQ), `google-auth-library` (verifikasi IdToken server-side), vitest + TDD untuk semua path auth/otorisasi.

---

## User decisions (locked 2026-09-12, do not re-litigate)

- S1 tidak di-merge dulu — S2 di-stack di atas branch `polish/frontend-quick-wins` via branch baru `s2/multitenant-invite-brand`.
- Multi-tenant penuh (bukan multi-user 1 bisnis).
- Google invite-only: superadmin daftarkan email → login Google hanya untuk email terdaftar.
- Brand per akun saja (tanpa override per album).

## Cross-slice contracts (do not change without updating all slices)

```typescript
// apps/web/src/lib/auth.ts — satu-satunya bentuk sesi yang valid
export type AdminRole = "superadmin" | "vendor";
export interface AdminSession {
  id: string;        // admin doc _id (== ownerId)
  email: string;
  name: string;
  role: AdminRole;
  ownerId: string;   // selalu == id; filter tenant memakai ini
  expiresAt: number;
  sessionVersion: number;
}
```

- Cookie tetap `admin_session`, format `<base64url(json)>.<hmac>` tidak berubah.
- `requireAdmin()` menerima `superadmin` | `vendor`; helper baru `requireSuperAdmin()` return 403 untuk non-superadmin.
- Role lama di Sanity (`admin` → `superadmin`, `photographer` → `vendor`) dimigrasi data satu kali (Task 1); kode tidak mengenal nilai lama.
- `album.owner`: `reference` → `admin`, WAJIB diisi server-side dari `session.ownerId` saat POST (client tidak boleh mengirim/menimpa). Album legacy tanpa `owner` hanya terlihat oleh superadmin.
- Invite = dokumen `admin` dengan `role: "vendor"`, TANPA `password`, plus `invitedBy: string` (superadmin id), `disabled?: boolean`. Google login mencocokkan `email` lowercase + `!disabled`; role SELALU dari dokumen, tidak pernah dari client.
- Brand: `admin.brand: { logoUrl?: string; accentColor?: string }`. `accentColor` harus hex `#rrggbb` dan kontras vs `#0a0a0a` ≥ 4.5 (cek server-side). Galeri resolve: `album.owner` → `admin.brand`, fallback token YLx.

---

### Task 1: Schema + sesi + migrasi role

**Covers:** fondasi peran (kontrak `AdminRole`/`AdminSession` di atas).

**Files:**
- Modify: `packages/sanity/schemas/admin.ts` (role list + brand + invitedBy/disabled)
- Modify: `packages/sanity/schemas/album.ts` (tambah field `owner`)
- Modify: `apps/web/src/lib/auth.ts` (union ketat + `requireSuperAdmin`)
- Create: `apps/web/scripts/migrate-s2-roles.ts` (one-shot: `admin`→`superadmin`, `photographer`→`vendor`)
- Test: `apps/web/src/lib/auth.test.ts` (atau lokasi test sesi yang ada)

- [ ] **Step 1: Failing test — sesi role lama ditolak, helper superadmin**

```typescript
// apps/web/src/lib/auth.test.ts
import { describe, expect, it } from "vitest";

describe("requireAdmin role gate", () => {
  it("rejects legacy role values", async () => {
    // buat cookie signed dengan role: "photographer" (nilai lama)
    // expect(await requireAdmin(cookies)) .toBeNull()
  });
  it("requireSuperAdmin allows superadmin, 403s vendor", async () => {
    // superadmin → session kembali; vendor → null (caller menerjemahkan ke 403)
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm vitest run src/lib/auth.test.ts`. Expected: FAIL (`requireSuperAdmin` belum ada, role lama masih lolos).
- [ ] **Step 3: Schema admin** — ganti options role, tambah brand/invite fields:

```typescript
defineField({
  name: "role",
  title: "Role",
  type: "string",
  options: {
    list: [
      { title: "Superadmin", value: "superadmin" },
      { title: "Vendor", value: "vendor" },
    ],
  },
  initialValue: "vendor",
  validation: (Rule) => Rule.required(),
}),
defineField({
  name: "brand",
  title: "Brand",
  type: "object",
  fields: [
    { name: "logoUrl", title: "Logo URL", type: "url" },
    { name: "accentColor", title: "Accent color", type: "string" },
  ],
}),
defineField({ name: "invitedBy", title: "Invited by", type: "string", hidden: true }),
defineField({ name: "disabled", title: "Disabled", type: "boolean", initialValue: false }),
```

`password` tetap optional-absent untuk vendor (jangan `Rule.required()` — invite tanpa password harus valid).

- [ ] **Step 4: Schema album** — tambah setelah field identitas:

```typescript
defineField({
  name: "owner",
  title: "Owner",
  type: "reference",
  to: [{ type: "admin" }],
  description: "Vendor pemilik album. Diisi otomatis server-side saat create.",
}),
```

- [ ] **Step 5: `auth.ts`** — ketatkan union + helper:

```typescript
export type AdminRole = "superadmin" | "vendor";
export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  ownerId: string;
  expiresAt: number;
  sessionVersion: number;
}
```

Di `getSession`, tambah validasi: `session.role === "superadmin" || session.role === "vendor"`, dan `typeof session.ownerId === "string"`. Di `requireAdmin`, ganti cek lama menjadi cek union baru. Tambah:

```typescript
export async function requireSuperAdmin(
  cookies: AstroCookies
): Promise<AdminSession | null> {
  const session = await requireAdmin(cookies);
  if (!session || session.role !== "superadmin") return null;
  return session;
}
```

Semua `signSession` call-site (login.ts, google.ts Task 2) wajib isi `ownerId: validated._id`.

- [ ] **Step 6: Skrip migrasi** `apps/web/scripts/migrate-s2-roles.ts`: query semua `admin` di mana `role == "admin"` → patch `superadmin`; `role == "photographer"` → patch `vendor`. Jalankan SEKALI manual sebelum deploy S2 (catat di output PR, jangan auto-run saat build).
- [ ] **Step 7: Run tests** — `pnpm vitest run src/lib/auth.test.ts` PASS; `pnpm exec tsc --noEmit` 0 error.
- [ ] **Step 8: Commit** — `git add <files> && git commit -m "feat(s2): roles superadmin/vendor, album owner, strict session"`.

---

### Task 2: Invite vendor + login Google (invite-only)

**Covers:** S2 invite-only Google auth.

**Files:**
- Create: `apps/web/src/pages/api/admin/vendors.ts` (GET list + POST invite, superadmin-only)
- Create: `apps/web/src/pages/api/auth/google.ts` (POST IdToken → sesi, rate-limit IP+email)
- Modify: `packages/sanity/lib/admin.ts` (tambah `getAdminByEmail` reuse + `createInvitedVendor`)
- Modify: `apps/web/package.json` (tambah `google-auth-library`)
- Test: `apps/web/src/pages/api/auth/google.test.ts`, `apps/web/src/pages/api/admin/vendors.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
// google.test.ts
it("rejects uninvited Google email with 403 (no enumeration detail)", async () => {
  // mock verifyIdToken → { email: "stranger@x.com" }; POST /api/auth/google
  // expect status 403 + body { error: "Access denied" } (generik, sama untuk semua gagal)
});
it("issues vendor session with role forced from doc", async () => {
  // mock verifyIdToken → invited vendor email; expect cookie admin_session
  // decode payload: role === "vendor", ownerId === doc _id (bukan dari client)
});
```

```typescript
// vendors.test.ts
it("vendor cannot invite (403), superadmin can (201)", async () => { /* ... */ });
it("duplicate invite email returns 409", async () => { /* ... */ });
```

- [ ] **Step 2: Run, expect FAIL** — endpoint belum ada (404).
- [ ] **Step 3: Verifikasi IdToken** di `google.ts` (pola error generik seperti login.ts):

```typescript
import { OAuth2Client } from "google-auth-library";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ticket = await client.verifyIdToken({
  idToken,
  audience: process.env.GOOGLE_CLIENT_ID,
});
const payload = ticket.getPayload();
if (!payload?.email || payload.email_verified !== true) throw new Error("invalid");
```

Cek `aud` otomatis via `audience`; `iss` (`accounts.google.com`/`https://accounts.google.com`) dan `exp` dicek library — jangan verifikasi manual. Normalisasi email lowercase. Rate-limit sama seperti login.ts (`login:email` key + IP). Error selalu 403 generik (anti-enumerasi).
- [ ] **Step 4: Invite endpoint** `vendors.ts`: `requireSuperAdmin` dulu (401/403). POST body `{ email, name }` → validasi email + name non-empty (max 80, samakan pola vendorName PR #104) → `createInvitedVendor` (doc `_id` deterministik `admin.<sha256>` reuse pola `adminIdForEmail`, TANPA password, `invitedBy: session.id`). Duplikat → 409. GET list kembalikan vendor milik instance (superadmin lihat semua; vendor → 403).
- [ ] **Step 5: Sesi Google** — `signSession({ id, email, name, role: doc.role, ownerId: id, expiresAt: Date.now()+24h, sessionVersion: doc.sessionVersion })`, cookie `admin_session` dengan opsi SAMA PERSIS seperti login.ts (baca dan salin: httpOnly, secure, sameSite, path, maxAge).
- [ ] **Step 6: Run tests** — kedua file PASS; tsc 0.
- [ ] **Step 7: Commit** — `git commit -m "feat(s2): invite-only vendor + Google login"`.

Env baru (WAJIB didokumenkan di pesan PR + STATUS, nilai TIDAK masuk repo): `GOOGLE_CLIENT_ID`.

---

### Task 3: Tenant scoping semua endpoint admin

**Covers:** S2 multi-tenant penuh (filter owner).

**Files:**
- Modify: `apps/web/src/pages/api/admin/albums.ts` (GET filter + POST set owner)
- Modify: `apps/web/src/pages/api/admin/albums/[id]/index.ts` (GET/PUT/DELETE guard owner)
- Modify: `apps/web/src/pages/api/admin/albums/[id]/lock.ts`, `unlock.ts`, `reset.ts`, `reorder.ts` (guard owner)
- Modify: `apps/web/src/pages/api/admin/photos/[id].ts`, `photos/bulk-delete.ts`, `albums/bulk-delete.ts` (guard via album owner)
- Modify: `packages/sanity/lib/queries.ts` (`allAlbumsQuery` varian scoped + `albumBySlugQuery` sertakan `owner`)
- Test: tambah ke file test API yang ada (atau baru `tenant-scope.test.ts`)

- [ ] **Step 1: Failing test**

```typescript
it("vendor GET /api/admin/albums only returns own albums", async () => {
  // seed: album A owner=vendor1, album B owner=vendor2; sesi vendor1
  // expect GET → hanya [A]
});
it("vendor cannot read vendor2 album detail (404, bukan 403 — anti-enumerasi)", async () => {
  // expect GET /api/admin/albums/<id-B> → 404
});
it("superadmin sees all including ownerless legacy", async () => { /* ... */ });
it("POST ignores client-sent owner, forces session.ownerId", async () => {
  // body { ..., owner: "admin.palsu" } → created.owner._ref === session.ownerId
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Terapkan pola di tiap endpoint** — setelah `requireAdmin`, tambah:

```typescript
const isSuper = session.role === "superadmin";
// untuk query list:
const ownerFilter = isSuper ? "" : " && owner._ref == $ownerId";
// untuk akses dokumen tunggal: fetch dulu, lalu:
if (!isSuper && album.owner?._ref !== session.ownerId) {
  return new Response(JSON.stringify({ error: "Album not found" }), { status: 404 });
}
```

404 (bukan 403) untuk milik orang lain — konsisten anti-enumerasi. Album legacy tanpa `owner`: vendor tidak bisa akses (`undefined !== ownerId` → 404); superadmin lolos.
- [ ] **Step 4: POST create** — abaikan `body.owner` sepenuhnya; set `owner: { _type: "reference", _ref: session.ownerId }`.
- [ ] **Step 5: Run tests** — PASS; tsc 0; eslint 0.
- [ ] **Step 6: Commit** — `git commit -m "feat(s2): owner-scoped tenant isolation"`.

---

### Task 4: Brand per akun di galeri

**Covers:** S2 brand per-akun.

**Files:**
- Modify: `packages/sanity/lib/queries.ts` (`albumBySlugQuery`: proyeksikan `owner->{brand}`)
- Modify: `apps/web/src/pages/gallery/[slug].astro` (teruskan brand ke layout)
- Modify: `apps/web/src/layouts/GalleryLayout.astro` (atau BaseLayout — override CSS var)
- Modify: `apps/web/src/pages/api/admin/vendors.ts` (PUT brand, validasi kontras server-side)
- Test: `brand.test.ts` (validasi warna + kontras)

- [ ] **Step 1: Failing tests**

```typescript
it("rejects non-hex and low-contrast accent", () => {
  expect(validateBrand({ accentColor: "red" }).ok).toBe(false);
  expect(validateBrand({ accentColor: "#111111" }).ok).toBe(false); // vs bg #0a0a0a
  expect(validateBrand({ accentColor: "#e8a06a" }).ok).toBe(true);
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Validator** (`apps/web/src/lib/brand.ts` baru):

```typescript
export function validateBrand(brand: { logoUrl?: string; accentColor?: string }): {
  ok: boolean;
  error?: string;
} {
  if (brand.accentColor !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(brand.accentColor))
      return { ok: false, error: "accentColor must be #rrggbb" };
    if (contrastRatio(brand.accentColor, "#0a0a0a") < 4.5)
      return { ok: false, error: "accentColor contrast below WCAG AA (4.5)" };
  }
  if (brand.logoUrl !== undefined) {
    let u: URL;
    try { u = new URL(brand.logoUrl); } catch { return { ok: false, error: "logoUrl must be absolute URL" }; }
    if (u.protocol !== "https:") return { ok: false, error: "logoUrl must be https" };
  }
  return { ok: true };
}
```

(fungsi `contrastRatio` hitung luminance relatif WCAG — tulis murni, tanpa dep baru.)

- [ ] **Step 4: Galeri render** — `[slug].astro` baca `album.owner.brand`; teruskan sebagai prop; layout inject:

```astro
{brand?.accentColor && <style define:vars={{ accent: brand.accentColor }} />}
```

+ `<img src={brand.logoUrl}>` ganti wordmark bila ada (alt = vendor name). Fallback penuh ke token YLx bila brand kosong.
- [ ] **Step 5: Run tests** — PASS; tsc/eslint 0.
- [ ] **Step 6: Commit** — `git commit -m "feat(s2): per-account brand on gallery"`.

---

## Verification (integration owner, sekali di akhir)

- `pnpm exec tsc --noEmit` 0 error, `eslint --max-warnings 0`, `vitest` semua hijau, `astro build` OK.
- Jalankan skrip migrasi role SEKALI di dataset sebelum uji (atau catat sebagai langkah deploy).
- Buka PR (base `master` setelah S1 merge; jika S1 belum merge, base tetap `master` dan sebutkan dependensi S1 di badan PR) → pantau bot review sampai clean → uji Steel cloud 402×874 (home, invite flow superadmin, Google login vendor, isolasi album, brand).
- Update STATUS.md pointer + `~/.junie/tasks/PR-<n>-s2-multitenant.md` (API key/secret TIDAK PERNAH masuk file).

## Self-review (compose:plan)

- Spec coverage: peran+migrasi→Task 1; invite-only Google→Task 2; tenant penuh→Task 3; brand akun→Task 4. Semua keputusan user tercakup; tidak ada `Covers:` gantung.
- Placeholder scan: tidak ada TBD/TODO; tiap langkah ada kode/perintah/ekspektasi konkret.
- Type consistency: `AdminRole`, `AdminSession.ownerId`, `album.owner._ref`, `admin.brand` dipakai konsisten di semua task.
