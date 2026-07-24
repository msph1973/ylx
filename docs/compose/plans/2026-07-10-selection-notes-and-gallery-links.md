# Selection Notes + Gallery Link Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-way selection notes (client writes, photographer replies) and gallery link improvements (custom slug + share stats).

**Architecture:** Schema-first approach — add fields to Sanity schemas first, then build API endpoints, then UI components. Each feature is independent and can be shipped separately.

**Tech Stack:** Sanity v4 (schema + GROQ), Astro 6 API routes, React 18 (islands), Ably (realtime for reply notifications)

---

## File Structure

### Selection Notes
| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/sanity/schemas/selection.ts` | Add `notes` + `photographerReply` fields |
| Modify | `packages/shared/types/selection.ts` | Add `notes` + `photographerReply` to Selection type |
| Modify | `packages/sanity/lib/queries.ts` | Update `selectionsByAlbumQuery` to include notes |
| Modify | `apps/web/src/pages/api/gallery/[slug]/submit.ts` | Accept `{ selections: [{photoId, notes?}] }` |
| Modify | `apps/web/src/components/gallery/GalleryPage.tsx` | Add notes state + input per photo |
| Modify | `apps/web/src/components/gallery/PhotoLightbox.tsx` | Add notes input in lightbox |
| Create | `apps/web/src/pages/api/admin/selections/[id].ts` | PATCH photographer reply |
| Modify | `apps/web/src/components/admin/SelectionTable.tsx` | Display notes + reply UI |

### Gallery Link Improvements
| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/sanity/schemas/album.ts` | Add `customSlug` + `shareCount` + `lastAccessedAt` |
| Modify | `packages/shared/types/album.ts` | Add fields to types |
| Modify | `packages/sanity/lib/queries.ts` | Update queries for customSlug + shareCount |
| Modify | `apps/web/src/lib/slug.ts` | Support customSlug priority |
| Modify | `apps/web/src/pages/api/gallery/[slug]/verify.ts` | Increment shareCount |
| Modify | `apps/web/src/components/admin/AlbumFormModal.tsx` | Add customSlug input |
| Modify | `apps/web/src/components/admin/AlbumDetail.tsx` | Display share stats |

---

## Task 1: Schema — Selection Notes

**Covers:** Selection notes fields

**Files:**
- Modify: `packages/sanity/schemas/selection.ts`
- Modify: `packages/shared/types/selection.ts`

- [ ] **Step 1: Add fields to selection schema**

```typescript
// packages/sanity/schemas/selection.ts — add after selectedAt field:
defineField({
  name: "notes",
  title: "Client Notes",
  type: "text",
  description: "Optional note from the client about this photo",
}),
defineField({
  name: "photographerReply",
  title: "Photographer Reply",
  type: "text",
  description: "Photographer's response to the client's note",
}),
```

- [ ] **Step 2: Update Selection type**

```typescript
// packages/shared/types/selection.ts
export interface Selection {
  id: string;
  albumId: string;
  photoId: string;
  photo: Photo;
  selectedAt: Date;
  notes?: string;
  photographerReply?: string;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @ylx/shared exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/sanity/schemas/selection.ts packages/shared/types/selection.ts
git commit -m "feat(schema): add notes + photographerReply fields to selection"
```

---

## Task 2: Schema — Gallery Links

**Covers:** Custom slug + share stats fields

**Files:**
- Modify: `packages/sanity/schemas/album.ts`
- Modify: `packages/shared/types/album.ts`

- [ ] **Step 1: Add fields to album schema**

```typescript
// packages/sanity/schemas/album.ts — add after photos field:
defineField({
  name: "customSlug",
  title: "Custom Slug",
  type: "string",
  description: "Optional custom URL slug (leave empty for auto-generated)",
  validation: (Rule) =>
    Rule.custom((value) => {
      if (!value) return true;
      return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
        "Slug must contain only lowercase letters, numbers, and hyphens";
    }),
}),
defineField({
  name: "shareCount",
  title: "Share Count",
  type: "number",
  initialValue: 0,
  readOnly: true,
}),
defineField({
  name: "lastAccessedAt",
  title: "Last Accessed",
  type: "datetime",
  readOnly: true,
}),
```

- [ ] **Step 2: Update Album types**

```typescript
// packages/shared/types/album.ts
export interface Album {
  id: string;
  title: string;
  slug?: string;
  customSlug?: string;
  clientName: string;
  pin?: string;
  maxSelections: number;
  isLocked: boolean;
  status: string;
  eventDate?: string;
  createdAt?: Date;
  photos: Photo[];
  shareCount?: number;
  lastAccessedAt?: string;
}

export interface AlbumSummary {
  id: string;
  title: string;
  slug?: string;
  customSlug?: string;
  clientName: string;
  pin?: string;
  maxSelections: number;
  isLocked: boolean;
  status: string;
  eventDate?: string;
  createdAt?: Date;
  photoCount: number;
  shareCount?: number;
  lastAccessedAt?: string;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @ylx/shared exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/sanity/schemas/album.ts packages/shared/types/album.ts
git commit -m "feat(schema): add customSlug + shareCount + lastAccessedAt to album"
```

---

## Task 3: GROQ Queries Update

**Covers:** Query updates for both features

**Files:**
- Modify: `packages/sanity/lib/queries.ts`

- [ ] **Step 1: Update selectionsByAlbumQuery**

```typescript
// packages/sanity/lib/queries.ts — update existing query:
export const selectionsByAlbumQuery = `*[_type == "selection" && album._ref == $albumId] {
  _id,
  "albumId": album._ref,
  "photoId": photo._ref,
  photo-> {
    _id,
    filename,
    image,
    "lqip": image.asset->metadata.lqip
  },
  selectedAt,
  notes,
  photographerReply
}`;
```

- [ ] **Step 2: Update allAlbumsQuery**

```typescript
// packages/sanity/lib/queries.ts — update existing query:
export const allAlbumsQuery = `*[_type == "album"] | order(_createdAt desc) {
  _id,
  title,
  clientName,
  eventDate,
  pin,
  status,
  customSlug,
  "photoCount": count(photos),
  shareCount,
  lastAccessedAt
}`;
```

- [ ] **Step 3: Add slug lookup query**

```typescript
// packages/sanity/lib/queries.ts — add new query:
export const albumByCustomSlugQuery = `*[_type == "album" && customSlug == $customSlug][0] {
  _id,
  title,
  slug,
  customSlug
}`;
```

- [ ] **Step 4: Commit**

```bash
git add packages/sanity/lib/queries.ts
git commit -m "feat(queries): update GROQ for notes, customSlug, shareCount"
```

---

## Task 4: Custom Slug Logic

**Covers:** Custom slug priority in slug generation

**Files:**
- Modify: `apps/web/src/lib/slug.ts`

- [ ] **Step 1: Update generateUniqueSlug to accept customSlug**

```typescript
// apps/web/src/lib/slug.ts
import { sanityClient } from "@ylx/sanity/client";

export async function generateUniqueSlug(
  title: string,
  excludeId?: string,
  customSlug?: string
): Promise<string> {
  // If customSlug is provided, validate and use it
  if (customSlug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(customSlug)) {
    const query = excludeId
      ? `*[_type == "album" && (slug.current == $slug || customSlug == $slug) && _id != $id]{_id}`
      : `*[_type == "album" && (slug.current == $slug || customSlug == $slug)]{_id}`;
    const params = excludeId ? { slug: customSlug, id: excludeId } : { slug: customSlug };
    const existing = await sanityClient.fetch<{ _id: string }[]>(query, params);
    if (existing.length === 0) return customSlug;
    // Custom slug taken, fall through to auto-generate
  }

  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || `album-${Date.now().toString(36)}`;

  const query = excludeId
    ? `*[_type == "album" && (slug.current == $slug || customSlug == $slug) && _id != $id]{_id}`
    : `*[_type == "album" && (slug.current == $slug || customSlug == $slug)]{_id}`;
  const params = excludeId ? { slug: base, id: excludeId } : { slug: base };

  const existing = await sanityClient.fetch<{ _id: string }[]>(query, params);
  return existing.length > 0 ? `${base}-${Date.now().toString(36)}` : base;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @ylx/web exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/slug.ts
git commit -m "feat(slug): support customSlug priority in slug generation"
```

---

## Task 5: Submit API — Accept Notes

**Covers:** Client notes submission

**Files:**
- Modify: `apps/web/src/pages/api/gallery/[slug]/submit.ts`

- [ ] **Step 1: Update submit endpoint to accept notes**

```typescript
// apps/web/src/pages/api/gallery/[slug]/submit.ts — change type + transaction:
interface SelectionInput {
  photoId: string;
  notes?: string;
}

// In POST handler, change:
// OLD: const { photoIds } = body as { photoIds: string[] };
// NEW:
const { selections: selectionInputs, photoIds: legacyPhotoIds } = body as {
  selections?: SelectionInput[];
  photoIds?: string[];
};

// Support both new format (selections array) and legacy (photoIds array)
const effectiveSelections: SelectionInput[] = selectionInputs
  ?? (legacyPhotoIds ?? []).map((id) => ({ photoId: id }));

if (effectiveSelections.length === 0) {
  return new Response(
    JSON.stringify({ error: "Selections must be a non-empty array" }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
}

const uniquePhotoIds = [...new Set(effectiveSelections.map((s) => s.photoId))];
// ... existing validation stays the same using uniquePhotoIds ...

// In transaction loop, change:
// OLD: transaction.create({ _type: "selection", _id: selectionId, ... })
// NEW:
const notesMap = new Map(effectiveSelections.map((s) => [s.photoId, s.notes ?? ""]));
for (const photoId of uniquePhotoIds) {
  const selectionId = crypto.randomUUID();
  transaction.create({
    _type: "selection",
    _id: selectionId,
    album: { _type: "reference", _ref: album._id },
    photo: { _type: "reference", _ref: photoId },
    selectedAt: new Date().toISOString(),
    notes: notesMap.get(photoId) || undefined,
  });
  selectionIds.push(selectionId);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @ylx/web exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/api/gallery/[slug]/submit.ts
git commit -m "feat(submit): accept client notes per selection (backward-compatible)"
```

---

## Task 6: Gallery Page — Notes Input

**Covers:** Client-side notes UI

**Files:**
- Modify: `apps/web/src/components/gallery/GalleryPage.tsx`
- Modify: `apps/web/src/components/gallery/PhotoLightbox.tsx`

- [ ] **Step 1: Add notes state to GalleryPage**

```typescript
// GalleryPage.tsx — add state:
const [photoNotes, setPhotoNotes] = useState<Map<string, string>>(new Map());

// Add setter:
const setNote = useCallback((photoId: string, note: string) => {
  setPhotoNotes((prev) => {
    const next = new Map(prev);
    if (note) next.set(photoId, note);
    else next.delete(photoId);
    return next;
  });
}, []);
```

- [ ] **Step 2: Update handleSubmit to send notes**

```typescript
// GalleryPage.tsx — update handleSubmit body:
body: JSON.stringify({
  selections: Array.from(selectedPhotos).map((photoId) => ({
    photoId,
    notes: photoNotes.get(photoId) || undefined,
  })),
}),
```

- [ ] **Step 3: Pass notes to lightbox**

```typescript
// GalleryPage.tsx — pass to PhotoLightbox:
<PhotoLightbox
  // ... existing props
  note={photoNotes.get(album.photos[lightboxIndex]?.id ?? '') ?? ''}
  onNoteChange={(note) => {
    const photoId = album.photos[lightboxIndex]?.id;
    if (photoId) setNote(photoId, note);
  }}
/>
```

- [ ] **Step 4: Add notes input to PhotoLightbox**

```typescript
// PhotoLightbox.tsx — add props:
interface PhotoLightboxProps {
  // ... existing
  note?: string;
  onNoteChange?: (note: string) => void;
}

// Add in lightbox footer, before select button:
{!isDisabled && onNoteChange && (
  <input
    className="lightbox-note-input"
    type="text"
    placeholder="Add a note…"
    value={note ?? ''}
    onChange={(e) => onNoteChange(e.target.value)}
    maxLength={200}
    aria-label="Add a note for this photo"
  />
)}
```

- [ ] **Step 5: Add CSS for note input**

```css
/* PhotoLightbox.tsx — add to style block: */
.lightbox-note-input {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: var(--radius-md);
  color: #fff;
  font-size: var(--text-sm);
  min-height: 44px;
}

.lightbox-note-input::placeholder {
  color: rgba(255,255,255,0.4);
}

.lightbox-note-input:focus {
  outline: none;
  border-color: var(--color-accent);
}
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `pnpm --filter @ylx/web exec tsc --noEmit && pnpm --filter @ylx/web exec eslint src --max-warnings 0`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/gallery/GalleryPage.tsx apps/web/src/components/gallery/PhotoLightbox.tsx
git commit -m "feat(gallery): add notes input in lightbox for selected photos"
```

---

## Task 7: Admin Selection Notes + Reply

**Covers:** Photographer view notes + reply

**Files:**
- Create: `apps/web/src/pages/api/admin/selections/[id].ts`
- Modify: `apps/web/src/components/admin/SelectionTable.tsx`
- Modify: `apps/web/src/components/admin/AlbumDetail.tsx`

- [ ] **Step 1: Create reply API endpoint**

```typescript
// apps/web/src/pages/api/admin/selections/[id].ts
import type { APIRoute } from "astro";
import { sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent } from "../../../../lib/ably";

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const admin = await requireAdmin(cookies);
  if (!admin) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing selection id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { photographerReply } = body as { photographerReply?: string };

  if (typeof photographerReply !== "string") {
    return new Response(JSON.stringify({ error: "photographerReply must be a string" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await sanityWriteClient
      .patch(id)
      .set({ photographerReply: photographerReply || undefined })
      .commit();

    // Get album ID for cache invalidation
    const selection = await sanityWriteClient.getDocument(id);
    const albumRef = selection?.album?._ref;
    if (albumRef) {
      await publishAdminEvent("selection:replied", {
        albumId: albumRef,
        selectionId: id,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Selections] reply failed:", err);
    return new Response(JSON.stringify({ error: "Failed to save reply" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

- [ ] **Step 2: Update SelectionTable to display notes + reply**

```typescript
// SelectionTable.tsx — update Selection interface usage:
// Add notes display after filename, reply button + textarea

// In the table row, after col-filename:
{selection.notes && (
  <span className="col-notes notes-cell" role="cell">
    <span className="notes-label">Client:</span> {selection.notes}
  </span>
)}

// Add notes column header:
<span className="col-notes" role="columnheader">Notes</span>

// Update grid template:
// OLD: grid-template-columns: 44px 1fr minmax(92px, 132px);
// NEW: grid-template-columns: 44px 1fr 1fr minmax(92px, 132px);
```

- [ ] **Step 3: Add reply UI to SelectionTable**

```typescript
// SelectionTable.tsx — add reply functionality:
const [replyingTo, setReplyingTo] = useState<string | null>(null);
const [replyText, setReplyText] = useState("");
const [isSaving, setIsSaving] = useState(false);

const saveReply = async (selectionId: string) => {
  setIsSaving(true);
  try {
    const res = await fetch(`/api/admin/selections/${selectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photographerReply: replyText }),
    });
    if (res.ok) {
      setReplyingTo(null);
      setReplyText("");
      // Trigger re-fetch from parent
      onReplySaved?.();
    }
  } finally {
    setIsSaving(false);
  }
};

// In each row, add reply button:
{!selection.photographerReply && (
  <button
    className="reply-btn"
    onClick={() => { setReplyingTo(selection.id); setReplyText(""); }}
    aria-label={`Reply to note on ${selection.photo.filename}`}
  >
    Reply
  </button>
)}
{selection.photographerReply && (
  <span className="reply-text">
    <span className="notes-label">You:</span> {selection.photographerReply}
  </span>
)}

// Reply textarea (shown when replyingTo === selection.id):
{replyingTo === selection.id && (
  <div className="reply-form">
    <input
      className="reply-input"
      value={replyText}
      onChange={(e) => setReplyText(e.target.value)}
      placeholder="Type your reply…"
      maxLength={200}
      autoFocus
    />
    <button className="reply-save" onClick={() => saveReply(replyingTo)} disabled={isSaving}>
      Save
    </button>
    <button className="reply-cancel" onClick={() => setReplyingTo(null)}>Cancel</button>
  </div>
)}
```

- [ ] **Step 4: Add CSS for notes + reply**

```css
/* SelectionTable.tsx — add styles: */
.col-notes { font-size: var(--text-sm); color: var(--color-text-muted); }
.notes-cell { display: flex; flex-direction: column; gap: 2px; }
.notes-label { font-size: var(--text-xs); color: var(--color-accent); font-weight: 500; }
.reply-btn {
  font-size: var(--text-xs);
  color: var(--color-accent);
  background: none;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  cursor: pointer;
  min-height: 28px;
}
.reply-btn:hover { background: var(--color-accent); color: var(--color-bg); }
.reply-text { font-size: var(--text-sm); color: var(--color-text-muted); font-style: italic; }
.reply-form { display: flex; gap: var(--space-2); align-items: center; grid-column: 1 / -1; }
.reply-input {
  flex: 1;
  padding: var(--space-2);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--text-sm);
  min-height: 36px;
}
.reply-save, .reply-cancel {
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  min-height: 36px;
}
.reply-save { background: var(--color-accent); color: var(--color-bg); border: none; }
.reply-cancel { background: none; color: var(--color-text-muted); border: 1px solid var(--color-border); }
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `pnpm --filter @ylx/web exec tsc --noEmit && pnpm --filter @ylx/web exec eslint src --max-warnings 0`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/api/admin/selections/\[id\].ts apps/web/src/components/admin/SelectionTable.tsx
git commit -m "feat(admin): selection notes display + photographer reply"
```

---

## Task 8: Share Stats — verify.ts Increment

**Covers:** Share count tracking

**Files:**
- Modify: `apps/web/src/pages/api/gallery/[slug]/verify.ts`

- [ ] **Step 1: Add share count increment after PIN success**

```typescript
// verify.ts — after grantAlbumAccess, before photo mapping:
// Increment share count (fire-and-forget, don't block response)
sanityWriteClient
  .patch(album._id)
  .set({ lastAccessedAt: new Date().toISOString() })
  .inc({ shareCount: 1 })
  .commit()
  .catch((err) => console.error("[Verify] shareCount increment failed:", err));
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @ylx/web exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/api/gallery/\[slug\]/verify.ts
git commit -m "feat(share): increment shareCount + lastAccessedOn gallery access"
```

---

## Task 9: Album Form — Custom Slug Input

**Covers:** Custom slug UI in admin

**Files:**
- Modify: `apps/web/src/components/admin/AlbumFormModal.tsx`
- Modify: `apps/web/src/pages/api/admin/albums.ts` (POST)
- Modify: `apps/web/src/pages/api/admin/albums/[id]/index.ts` (PUT)

- [ ] **Step 1: Add customSlug to AlbumFormModal**

```typescript
// AlbumFormModal.tsx — update interface:
interface AlbumFormData {
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number | '';
  customSlug: string;
}

// Add to DEFAULT_FORM:
customSlug: '',

// Add form field after title:
<div className="form-group">
  <label className="form-label" htmlFor="album-customSlug">
    Custom URL
    <span className="form-hint">optional</span>
  </label>
  <input
    id="album-customSlug"
    className="form-input"
    type="text"
    name="customSlug"
    value={form.customSlug}
    onChange={handleChange}
    placeholder="e.g. wedding-budi-sari"
    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
  />
</div>

// Update resetForm to include customSlug:
customSlug: album.customSlug ?? '',
```

- [ ] **Step 2: Update albums.ts POST to accept customSlug**

```typescript
// apps/web/src/pages/api/admin/albums.ts — in POST handler:
const { title, clientName, eventDate, pin, maxSelections, customSlug } = body;

const slug = await generateUniqueSlug(title, undefined, customSlug);

// In transaction.create, add:
customSlug: customSlug || undefined,
```

- [ ] **Step 3: Update albums/[id]/index.ts PUT to accept customSlug**

```typescript
// apps/web/src/pages/api/admin/albums/[id]/index.ts — in PUT handler:
const { title, clientName, eventDate, pin, maxSelections, customSlug } = body;

const slug = await generateUniqueSlug(title, albumId, customSlug);

// In patch, add:
customSlug: customSlug || undefined,
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `pnpm --filter @ylx/web exec tsc --noEmit && pnpm --filter @ylx/web exec eslint src --max-warnings 0`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/AlbumFormModal.tsx apps/web/src/pages/api/admin/albums.ts apps/web/src/pages/api/admin/albums/\[id\]/index.ts
git commit -m "feat(admin): custom slug input in album form + API support"
```

---

## Task 10: Album Detail — Share Stats Display

**Covers:** Share stats UI

**Files:**
- Modify: `apps/web/src/components/admin/AlbumDetail.tsx`

- [ ] **Step 1: Add share stats display**

```typescript
// AlbumDetail.tsx — in the album info section, add after status:
{album.shareCount !== undefined && (
  <div className="share-stats">
    <span className="stat-label">Shares:</span> {album.shareCount}
    {album.lastAccessedAt && (
      <> · <span className="stat-label">Last viewed:</span> {formatDate(new Date(album.lastAccessedAt))}</>
    )}
  </div>
)}
```

```css
/* AlbumDetail.tsx — add styles: */
.share-stats {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-top: var(--space-2);
}
.stat-label { font-weight: 500; }
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `pnpm --filter @ylx/web exec tsc --noEmit && pnpm --filter @ylx/web exec eslint src --max-warnings 0`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/AlbumDetail.tsx
git commit -m "feat(admin): display share count + last accessed in album detail"
```

---

## Task 11: Realtime Event for Reply

**Covers:** Realtime notification when photographer replies

**Files:**
- Modify: `packages/shared/types/realtime.ts`
- Modify: `apps/web/src/hooks/useAdminRealtime.ts` (if exists)

- [ ] **Step 1: Add reply event type**

```typescript
// packages/shared/types/realtime.ts
export type RealtimeEventType =
  | "photo:uploaded"
  | "selection:changed"
  | "submission:received"
  | "album:unlocked"
  | "selection:replied";

export interface SelectionRepliedData {
  selectionId: string;
  albumId: string;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @ylx/shared exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/types/realtime.ts
git commit -m "feat(realtime): add selection:replied event type"
```

---

## Task 12: Full Verification

**Covers:** All features

- [ ] **Step 1: Typecheck**

Run: `pnpm --filter @ylx/web exec tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Lint**

Run: `pnpm --filter @ylx/web exec eslint src --max-warnings 0`
Expected: 0 errors

- [ ] **Step 3: Tests**

Run: `pnpm --filter @ylx/web exec vitest run`
Expected: All tests pass (existing 17 + any new)

- [ ] **Step 4: Build**

Run: `pnpm --filter @ylx/web exec astro build`
Expected: Build completes successfully

---

## Execution Approach

This plan has 12 tasks. Tasks 1-4 are schema/query foundations. Tasks 5-7 are Selection Notes (API + UI). Tasks 8-10 are Gallery Links (API + UI). Task 11 is realtime. Task 12 is final verification.

**Recommendation:** Execute inline — the tasks are tightly coupled (schema changes affect all downstream work) and sequential by nature.
