# Vendor Name Branding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-album `vendorName` field; replace hardcoded "YLx" branding in client gallery pages with the album's `vendorName`.

**Architecture:** Add `vendorName: string` to Sanity album schema, flow it through the existing album API and `buildGalleryAlbumResponse`, then display in `GalleryLayout` (brand div) and `BaseLayout` (browser tab title). Existing albums without `vendorName` fall back to `"YLx"`.

**Tech Stack:** TypeScript (strict), Sanity GROQ, Astro pages/components.

---

## Files to Modify

| Layer | File | Change |
|---|---|---|
| Types | `apps/web/src/lib/galleryAlbumResponse.ts` | Add `vendorName` to `SanityAlbumRaw` interface; emit in `buildGalleryAlbumResponse` return |
| Types | `apps/web/src/components/admin/AlbumFormModal.tsx` | Add `vendorName` to `AlbumFormData` interface + `DEFAULT_FORM` |
| Form | `apps/web/src/components/admin/AlbumFormModal.tsx` | Add vendorName input field + validation |
| API create | `apps/web/src/pages/api/admin/albums/create.ts` | Accept and save `vendorName` to Sanity |
| API update | `apps/web/src/pages/api/admin/albums/[id]/index.ts` | Accept and save `vendorName` on edit |
| Gallery page | `apps/web/src/pages/gallery/[slug].astro` | Pass `vendorName` to layouts |
| Gallery layout | `apps/web/src/layouts/GalleryLayout.astro` | Replace `"YLx"` with `{vendorName ?? 'YLx'}` |
| Base layout | `apps/web/src/layouts/BaseLayout.astro` | Add optional `vendorName` prop; use in tab title |

---

## Task 1: Add `vendorName` to types and `buildGalleryAlbumResponse`

**Files:**
- Modify: `apps/web/src/lib/galleryAlbumResponse.ts`

**Steps:**

- [ ] **Step 1: Add `vendorName` to `SanityAlbumRaw` interface**

Edit `galleryAlbumResponse.ts`, add `vendorName?: string | null` to the `SanityAlbumRaw` interface (after `showOriginalAfterDelivery`).

```typescript
export interface SanityAlbumRaw {
  // ...existing fields...
  showOriginalAfterDelivery?: boolean;
  vendorName?: string | null; // NEW
  storageType?: StorageType;
  photos: SanityPhotoRaw[];
}
```

- [ ] **Step 2: Emit `vendorName` in `buildGalleryAlbumResponse` return**

In the `return { album: { ... } }` block of `buildGalleryAlbumResponse`, add:

```typescript
vendorName: album.vendorName ?? 'YLx', // fallback for albums created before this field
```

- [ ] **Step 3: Add `vendorName` to `GalleryAlbumResponse` type if exported**

If `GalleryAlbumResponse` (the return type of `buildGalleryAlbumResponse`) is exported and used elsewhere, add `vendorName: string` to it. Check: `grep -rn "GalleryAlbumResponse" apps/web/src --include="*.ts" --include="*.tsx"`.

- [ ] **Step 4: Run tsc to verify no type errors**

```bash
cd /home/ubuntu/ylx && pnpm exec tsc --noEmit 2>&1 | grep -i vendorName
```
Expected: no errors related to `vendorName`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/galleryAlbumResponse.ts
git commit -m "feat(gallery): add vendorName to SanityAlbumRaw and buildGalleryAlbumResponse"
```

---

## Task 2: Add `vendorName` to `AlbumFormModal` form + validation

**Files:**
- Modify: `apps/web/src/components/admin/AlbumFormModal.tsx`

**Steps:**

- [ ] **Step 1: Add `vendorName` to `AlbumFormData` interface**

```typescript
interface AlbumFormData {
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number | '';
  customSlug: string;
  vendorName: string; // NEW
}
```

- [ ] **Step 2: Add to `DEFAULT_FORM`**

```typescript
const DEFAULT_FORM: AlbumFormData = {
  // ...existing fields...
  customSlug: '',
  vendorName: '', // NEW
};
```

- [ ] **Step 3: Add validation in `validateAlbumForm`**

Add as the first content validation (after `title`):

```typescript
if (!form.vendorName.trim()) {
  return 'Vendor name is required';
}
if (form.vendorName.trim().length > 80) {
  return 'Vendor name cannot exceed 80 characters';
}
```

- [ ] **Step 4: Add form input field**

Add a text input for `vendorName` in the form JSX. Place it near the `title` field. Use `maxLength={80}` and a label "Vendor Name". Example structure:

```tsx
<div className="form-field">
  <label htmlFor="vendorName">Vendor Name</label>
  <input
    id="vendorName"
    type="text"
    value={form.vendorName}
    onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
    maxLength={80}
    placeholder="e.g. Elena Photography"
    required
  />
</div>
```

- [ ] **Step 5: Populate `vendorName` from existing album on edit mode**

In the `useEffect` that populates form from existing album (when `album` prop is provided), add:
```typescript
vendorName: album.vendorName ?? '',
```

- [ ] **Step 6: Pass `vendorName` in form submission payload**

In `handleSubmit`, ensure `vendorName` is included in the payload passed to `onSubmit` (or directly to the API). The current implementation sends the full `form` object; verify `vendorName` is in `AlbumFormData` and therefore included.

- [ ] **Step 7: Run tsc + lint**

```bash
cd /home/ubuntu/ylx && pnpm exec tsc --noEmit 2>&1 | grep -i vendorName
git add apps/web/src/components/admin/AlbumFormModal.tsx
git commit -m "feat(admin): add vendorName field to AlbumFormModal"
```

---

## Task 3: Accept `vendorName` in album creation and update APIs

**Files:**
- Modify: `apps/web/src/pages/api/admin/albums/create.ts`
- Modify: `apps/web/src/pages/api/admin/albums/[id]/index.ts`

**Steps:**

- [ ] **Step 1: Read create.ts to find where Sanity patch is built**

```bash
grep -n "client.create\|client.patch\|sanityFetch" apps/web/src/pages/api/admin/albums/create.ts | head -20
```

- [ ] **Step 2: Add `vendorName` to the Sanity patch body in create.ts**

In the mutation/patch object that creates the album document, add:
```typescript
vendorName: body.vendorName.trim(),
```
Place it after `maxSelections`.

- [ ] **Step 3: Validate `vendorName` in create.ts**

Add at the top of the handler (after `requireAdmin`):
```typescript
if (!body.vendorName || typeof body.vendorName !== 'string' || !body.vendorName.trim()) {
  return json({ error: 'Vendor name is required' }, { status: 400 });
}
if (body.vendorName.trim().length > 80) {
  return json({ error: 'Vendor name cannot exceed 80 characters' }, { status: 400 });
}
```

- [ ] **Step 4: Do the same for [id]/index.ts (update endpoint)**

Read the file, find where the album is patched, add `vendorName` to the patch. Add the same validation.

- [ ] **Step 5: Run tsc + vitest**

```bash
cd /home/ubuntu/ylx && pnpm exec tsc --noEmit
pnpm exec vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|ERROR)" | tail -20
git add apps/web/src/pages/api/admin/albums/create.ts apps/web/src/pages/api/admin/albums/[id]/index.ts
git commit -m "feat(api): accept vendorName in album create and update"
```

---

## Task 4: Pass `vendorName` to layouts in gallery page

**Files:**
- Modify: `apps/web/src/pages/gallery/[slug].astro`

**Steps:**

- [ ] **Step 1: Find where the gallery page fetches album data**

Read the gallery `[slug].astro` page to see how it passes props to `GalleryLayout` and `BaseLayout`.

- [ ] **Step 2: Extract `vendorName` from the API response**

After fetching the album (via `sanityFetch` or the verify/session API), extract `album.vendorName`.

- [ ] **Step 3: Pass `vendorName` to `GalleryLayout`**

```astro
<GalleryLayout vendorName={album.vendorName ?? 'YLx'}>
```

- [ ] **Step 4: Pass `vendorName` to `BaseLayout` (for tab title)**

```astro
<BaseLayout title={album.title} vendorName={album.vendorName ?? 'YLx'}>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/gallery/[slug].astro
git commit -m "feat(gallery): pass vendorName to layouts"
```

---

## Task 5: Display `vendorName` in `GalleryLayout` and `BaseLayout`

**Files:**
- Modify: `apps/web/src/layouts/GalleryLayout.astro`
- Modify: `apps/web/src/layouts/BaseLayout.astro`

**Steps:**

- [ ] **Step 1: Add `vendorName` prop to `GalleryLayout.astro`**

In the frontmatter, add:
```astro
interface Props {
  vendorName?: string;
}
const { vendorName } = Astro.props;
```

Update the brand div:
```astro
<!-- Change: -->
<div class="gallery-brand">YLx</div>
<!-- To: -->
<div class="gallery-brand">{vendorName ?? 'YLx'}</div>
```

- [ ] **Step 2: Add `vendorName` prop to `BaseLayout.astro`**

In the frontmatter:
```astro
interface Props {
  title: string;
  vendorName?: string;
}
const { title, vendorName } = Astro.props;
```

Update the `<title>` tag:
```astro
<title>{title} | {vendorName ?? 'YLx'}</title>
```

- [ ] **Step 3: Verify index.astro and login.astro still work**

These pages use `BaseLayout` but won't pass `vendorName`. They should fall back to `"YLx"` automatically. No changes needed, but verify they compile.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/layouts/GalleryLayout.astro apps/web/src/layouts/BaseLayout.astro
git commit -m "feat(layouts): use vendorName prop for gallery branding"
```

---

## Task 6: End-to-end verification

**Steps:**

- [ ] **Step 1: Run full typecheck + lint + build**

```bash
cd /home/ubuntu/ylx && pnpm exec tsc --noEmit 2>&1 | grep -E "(error|warning)" | grep -v "node_modules" | head -20
pnpm exec eslint apps/web/src --max-warnings 0 2>&1 | head -20
pnpm exec astro build 2>&1 | tail -10
```

- [ ] **Step 2: Run vitest**

```bash
cd /home/ubuntu/ylx && pnpm exec vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|Tests:)" | tail -5
```

- [ ] **Step 3: Push to branch and open PR**

```bash
git checkout -b feat/vendor-name-branding
git add .
git push origin feat/vendor-name-branding
gh pr create --fill
```

- [ ] **Step 4: Verify in Vercel preview**

Open the preview deployment URL after CI passes. Check:
- Gallery page: header brand div shows `vendorName` (not "YLx")
- Browser tab title: `albumTitle | vendorName`
- Creating album without `vendorName`: form shows validation error
- Album without `vendorName` (existing): falls back to "YLx"
