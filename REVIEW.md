# REVIEW.md — YLx Code Review Reference

> **For AI agents**: Read this before reviewing any PR in the `msph1973/ylx` repository.
> This document encodes lessons from 2 full audit cycles (June 2026) and all production bug fixes.

---

## Project Snapshot

| Field | Value |
|-------|-------|
| **Repo** | `msph1973/ylx` (Turborepo monorepo) |
| **Live** | https://ylx-msph.vercel.app |
| **Admin** | `/admin/login` — `admin@ylex.my.id` |
| **Sanity Studio** | https://ylx-admin.sanity.studio |
| **Tech stack** | Astro + React (islands), Sanity CMS, Ably real-time, Vercel Serverless |
| **Package manager** | `pnpm` (workspaces) |

---

## Pre-Review Checklist (Required Before Approving Any PR)

```
[ ] pnpm exec tsc --noEmit       → 0 errors (strict mode, no any)
[ ] pnpm lint --max-warnings 0   → 0 errors, 0 warnings
[ ] pnpm build                   → Completes without error
```

If any gate above fails, **do not approve**. Request fixes first.

---

## 1. TypeScript — Strict Mode

**Rule**: Project runs `strict: true`. No exceptions.

### ❌ Never Allow
```typescript
// Explicit any
const data: any = response.json();
function handler(req: any) { ... }
as any                            // type assertion to any

// Implicit any
function process(items) { ... }   // missing parameter types
```

### ✅ Required Pattern
```typescript
// Typed everything
interface AlbumResponse { _id: string; title: string; pin: string }
const data = await response.json() as AlbumResponse;

// Consistent type imports
import type { APIRoute } from 'astro';
import type { Album } from '@ylx/shared';
```

**Common escape hatches to reject**:
- `@ts-ignore` — always reject unless there is a documented third-party incompatibility
- `@ts-expect-error` — same as above
- `eslint-disable-next-line @typescript-eslint/no-explicit-any` — reject

---

## 2. Security — Non-Negotiable Rules

Every admin API endpoint **must** start with an auth guard. This was the root cause of 4 critical security bugs (SEC-01 through SEC-04) found in the June 2026 audit.

### 2.1 Admin Auth Guard

```typescript
// ✅ Required pattern — every file under /api/admin/**
import { requireAdmin } from '@ylx/sanity/lib/admin';

export const POST: APIRoute = async ({ cookies, request }) => {
  const admin = await requireAdmin(cookies);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // ... handler logic
};
```

**Files that MUST have this guard** (verify on every PR touching these):
- `/api/admin/albums.ts`
- `/api/admin/albums/[id]/index.ts`
- `/api/admin/albums/[id]/unlock.ts`
- `/api/admin/upload.ts`
- `/api/admin/workflow.ts`
- `/api/auth/create-admin.ts`

### 2.2 Session Cookie Security

```typescript
// ✅ Correct
cookies.set('admin_session', token, {
  httpOnly: true,
  secure: import.meta.env.PROD,   // true on Vercel, false on localhost
  sameSite: 'lax',
  maxAge: 60 * 60 * 24,
});

// ❌ Wrong
secure: false                      // never hardcode false
secure: true                       // fine on Vercel, but breaks local dev
```

### 2.3 Error Messages — No Information Disclosure

```typescript
// ✅ Generic error for auth endpoints (prevent username enumeration)
return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 });

// ❌ Never reveal which field is wrong
return new Response(JSON.stringify({ error: 'Admin not found' }), { status: 401 });
return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401 });

// ✅ 500 errors — hide internal details
return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });

// ❌ Never expose internal details
return new Response(JSON.stringify({ error: 'DB error', details: String(err) }), { status: 500 });
```

### 2.4 Rate Limiting

Gallery PIN verify endpoint has brute-force protection. Any new sensitive endpoint should add similar protection.

```typescript
// Template: in-memory rate limiter (acceptable for Vercel — resets on cold start)
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}
```

### 2.5 Passwords — bcrypt Only

```typescript
import bcrypt from 'bcryptjs';

// Create: 12 rounds minimum
const hash = await bcrypt.hash(password, 12);

// Verify
const valid = await bcrypt.compare(inputPassword, storedHash);

// ❌ Never store or compare plaintext passwords
```

---

## 3. Sanity GROQ Queries

Several P0 bugs traced to incorrect GROQ syntax. Verify these patterns on every PR touching `packages/sanity/`.

### 3.1 System Fields Use Underscore Prefix

```groq
// ✅ Correct — Sanity system fields always have _ prefix
*[_type == "album"] | order(_createdAt desc)

// ❌ Wrong
*[_type == "album"] | order(createdAt desc)
```

### 3.2 Parent Reference in Sub-queries

```groq
// ✅ Correct — reference parent's _id with ^._id
"selections": *[_type == "selection" && album._ref == ^._id]._id

// ❌ Wrong — ^. is the parent scope object, not the field
"selections": *[_type == "selection" && album._ref == ^.]._id
```

### 3.3 Album Schema Has Slug Field

The `album` schema now has a `slug` field (added in `fix/gallery-core`). Any query for gallery routing must use `slug.current`.

```groq
// ✅ Correct — gallery route uses slug
*[_type == "album" && slug.current == $slug][0]

// Schema: packages/sanity/schemas/album.ts must have:
// { name: 'slug', type: 'slug', options: { source: 'title' } }
```

### 3.4 Always Fetch Required Fields

```groq
// ✅ Include pin when AlbumCard displays it
*[_type == "album"] | order(_createdAt desc) {
  _id, title, clientName, eventDate, status, maxSelections, pin
}

// ❌ Omitting pin causes AlbumCard to show nothing
*[_type == "album"] { _id, title, clientName }
```

### 3.5 Image URLs — Use urlFor()

```typescript
// ✅ Always generate URLs from Sanity image references
import { urlFor } from '@ylx/sanity/client';
const thumbnailUrl = urlFor(photo.image).width(400).url();
const url = urlFor(photo.image).url();

// ❌ Never return raw Sanity image reference objects to the client
// { _type: 'image', asset: { _ref: '...' } }  — client can't render this
```

### 3.6 CDN Setting

```typescript
// packages/sanity/client.ts
// ✅ useCdn: false — prevents stale cache on admin operations
useCdn: false,

// ❌ useCdn: true causes newly created content to be invisible
```

---

## 4. React Patterns

### 4.1 useCallback for Functions Passed to useEffect

The BUG-04 (infinite Ably resubscription) was caused by missing `useCallback`. This is a required pattern.

```typescript
// ✅ Required — memoize functions used in useEffect deps
const fetchAlbums = useCallback(async () => {
  const response = await fetch('/api/admin/albums');
  const data = await response.json();
  setAlbums(data.albums);
}, []); // stable reference — deps array must be explicit

useEffect(() => {
  fetchAlbums();
}, [fetchAlbums]); // safe because fetchAlbums is stable

// ❌ Wrong — new reference every render causes infinite loop
const fetchAlbums = async () => { ... };  // not wrapped in useCallback
useEffect(() => { fetchAlbums(); }, [fetchAlbums]); // re-runs every render
```

### 4.2 API Response Shape Must Match Client State

Always verify the shape of API responses against the React state type. BUG-03 and post-merge bugs were caused by shape mismatches.

```typescript
// Verify these match:
// 1. API response shape (what the server sends)
// 2. Client interface (what the component expects)
// 3. State setter call (what is extracted from response)

// ✅ Correct
const data = await response.json();
setAlbum(data.album);  // API returns { album: {...} }

// ❌ Wrong
setAlbum(data);        // if API wraps in { album: ... }
```

### 4.3 Status Fields — Use String Literals Not Boolean

```typescript
// ✅ Correct — Sanity album uses status string
interface AlbumData {
  status: string; // 'active' | 'submitted' | 'locked'
}

function isAlbumLocked(album: AlbumData | null): boolean {
  return album?.status === 'locked' || album?.status === 'submitted';
}

// ❌ Wrong — boolean isLocked is not what Sanity returns
interface AlbumData {
  isLocked: boolean;
}
```

---

## 5. Ably / Real-Time

### 5.1 Use Ably.Rest on Server-Side

```typescript
// ✅ Correct — publishAdminEvent uses Ably.Rest (safe for serverless)
import Ably from 'ably';
const client = new Ably.Rest({ key: process.env.ABLY_API_KEY });
await client.channels.get('admin-events').publish(event, data);

// ❌ Wrong — Ably.Realtime holds WebSocket connections, bad for serverless
const client = new Ably.Realtime({ key: ... });
```

### 5.2 Always Publish After Submit Transaction

```typescript
// ✅ After every successful gallery submission
await transaction.commit();
await publishAdminEvent('submission:received', {
  albumId: album._id,
  count: photoIds.length,
});

// ❌ Missing publishAdminEvent — admin dashboard won't receive real-time notification
```

### 5.3 Client-Side Ably Guard for SSR

```typescript
// ✅ getAblyClient() must check for browser environment
export function getAblyClient(): Ably.Realtime {
  if (typeof window === 'undefined') {
    throw new Error('getAblyClient() called in SSR context');
  }
  // ... create/return client
}
```

---

## 6. API Field Name Consistency

The gallery submit bug (BUG-01) was caused by a field name mismatch between client and server. Always verify.

```typescript
// Client (GalleryPage.tsx)
body: JSON.stringify({ photoIds: [...selectedPhotos] })

// Server (submit.ts)
const { photoIds } = await request.json() as { photoIds: string[] }

// ❌ Mismatch example that caused BUG-01:
// client sends:   { selectionIds: [...] }
// server reads:   const { photoIds } = body  → undefined → 400 error
```

---

## 7. Accessibility

All P0 accessibility issues from the June 2026 audit are fixed. New UI must maintain these standards.

### Gallery Interactive Elements
```tsx
// ✅ Photo cards must be keyboard-navigable
<div
  role="button"
  tabIndex={0}
  aria-pressed={isSelected}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect() }}
  onClick={handleSelect}
/>

// ✅ Decorative SVGs must be hidden from screen readers
<svg aria-hidden="true" focusable="false">...</svg>
```

### Reduced Motion
```typescript
// ✅ All animations must respect prefers-reduced-motion
import { useReducedMotion } from 'framer-motion';
const shouldReduceMotion = useReducedMotion();

// In motion.div variants:
const variants = shouldReduceMotion
  ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
  : { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };
```

### Color Contrast
- Accent color `#d4a574` on white background → minimum contrast 4.5:1 required
- Current approved accent: `#c4935f` (4.8:1 on white)
- Reject any PR that introduces new colors below 4.5:1 for text

---

## 8. Animations — No Bounce/Spring Easing

Per DESIGN.md and the impeccable skill audit:

```css
/* ✅ Approved easing functions */
--transition-spring: cubic-bezier(0.22, 1, 0.36, 1);   /* ease-out-quint */
--transition-base: cubic-bezier(0.4, 0, 0.2, 1);        /* standard */

/* ❌ Banned — causes "bouncy/dated" UI feeling */
cubic-bezier(0.34, 1.56, 0.64, 1)  /* spring overshoot */
cubic-bezier(0.175, 0.885, 0.32, 1.275)  /* back-ease */
```

```typescript
// ✅ GPU-accelerated progress bars
style={{ transform: `scaleX(${progress / 100})`, transformOrigin: 'left' }}

// ❌ Layout-thrashing (triggers layout recalculation on every frame)
style={{ width: `${progress}%` }}
```

---

## 9. File & Module Boundaries

| Path | Purpose | Rules |
|------|---------|-------|
| `packages/sanity/lib/queries.ts` | GROQ query strings | Must export named const, no inline fetch |
| `packages/sanity/lib/admin.ts` | Admin CRUD + auth | `requireAdmin()` must be imported from here |
| `packages/sanity/client.ts` | Sanity clients | `sanityClient` (read), `sanityWriteClient` (mutations) |
| `packages/shared/index.ts` | Shared TS types | All cross-package types exported from here |
| `apps/web/src/pages/api/` | Astro API routes | `export const POST: APIRoute`, `export const GET: APIRoute` |
| `apps/web/src/components/` | React/Astro components | No direct Sanity client calls — use fetch to API routes |

---

## 10. Known Stubs / Incomplete Features

Do not approve PRs that silently fix or change these without full discussion:

| File | Status | Note |
|------|--------|------|
| `apps/web/src/pages/api/admin/workflow.ts` | ⚠️ Stub | Always returns `{ success: true }` — Mastra workflow not actually run |
| `scripts/seed-admin.mjs` | 🔒 Gitignored | Sensitive — not committed, run locally only |

---

## 11. Environment Variables

All required env vars must be present in **both** Vercel environments (preview + production):

| Variable | Used In | Required |
|----------|---------|---------|
| `PUBLIC_SANITY_PROJECT_ID` | Everywhere | ✅ |
| `PUBLIC_SANITY_DATASET` | Everywhere | ✅ |
| `SANITY_API_TOKEN` | Server-side write ops | ✅ |
| `ABLY_API_KEY` | Real-time pub/sub | ✅ |
| `ADMIN_SESSION_SECRET` | Cookie signing | ✅ |

Any PR adding a new `process.env.X` call must:
1. Document the variable above
2. Add it to `apps/web/.env.example`
3. Confirm it's added to Vercel env vars (both environments)

---

## 12. PR Merge Order (When Multiple Fix Branches Exist)

If several fix branches are open simultaneously, merge in this order to minimize conflicts:

```
1. Schema changes (packages/sanity/schemas/)  ← must be deployed to Sanity first
2. API / server-side fixes
3. Client-side component fixes
4. Polish / style changes
```

---

## Quick Red Flags (Auto-Reject)

Immediately flag for rejection if PR contains any of the following:

- `as any` or `: any` type annotations
- `@ts-ignore` or `@ts-expect-error` without documented justification
- New admin API endpoint without `requireAdmin()` guard
- `secure: false` in cookie options
- Two different error messages for wrong email vs wrong password (username enumeration)
- Hardcoded credentials, API keys, or tokens in source files
- `useCdn: true` in Sanity write client
- `order(createdAt desc)` without underscore prefix
- Missing `useCallback` wrapper on functions passed to `useEffect` deps
- `body: JSON.stringify({ selectionIds: ... })` sent to submit endpoint (should be `photoIds`)
- `setAlbum(data)` when API wraps response in `{ album: ... }`

---

*Last updated: 2026-06-27 | Based on audit cycles: AUDIT-2026-06-24.md, post-merge testing session*
*Maintained by: Junie AI Agent — update this file after each major bug fix cycle*
