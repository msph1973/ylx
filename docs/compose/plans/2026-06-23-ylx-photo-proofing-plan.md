# YLx Photo Proofing Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack photo proofing platform for wedding photographers with PIN-locked galleries, real-time updates, and Lightroom export.

**Architecture:** Astro frontend with React islands for interactive components, Sanity as single data source, Ably for real-time, Mastra for workflows, deployed on Vercel.

**Tech Stack:** Astro, React, TypeScript, Sanity, Ably, Mastra, Framer Motion, Turborepo, pnpm

---

## File Structure

```
ylx/
├── apps/
│   ├── web/                    # Astro frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── gallery/    # Client gallery React components
│   │   │   │   ├── admin/      # Admin dashboard React components
│   │   │   │   └── ui/         # Shared UI components
│   │   │   ├── layouts/
│   │   │   ├── pages/
│   │   │   └── styles/
│   │   └── astro.config.mjs
│   └── studio/                 # Sanity Studio (if customizing)
├── packages/
│   ├── sanity/                 # Sanity schema, plugins, config
│   │   ├── schemas/
│   │   ├── plugins/
│   │   └── sanity.config.ts
│   ├── mastra/                 # Mastra workflows and tools
│   │   ├── workflows/
│   │   └── tools/
│   ├── shared/                 # Shared types, utils
│   │   └── types/
│   └── ui/                     # Shared UI primitives (if needed)
├── turbo.json
├── package.json
└── pnpm-workspace.yaml
```

---

## Task 1: Project Scaffolding

**Covers:** [S1, S8]

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `apps/web/package.json`
- Create: `apps/web/astro.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `packages/sanity/package.json`
- Create: `packages/sanity/sanity.config.ts`
- Create: `packages/mastra/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/types/index.ts`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "ylx",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "prettier": "^3.2.0",
    "typescript": "^5.4.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.turbo/
.env
.env.local
.env.*.local
*.log
```

- [ ] **Step 5: Create apps/web/package.json**

```json
{
  "name": "@ylx/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "lint": "eslint src --ext .ts,.tsx",
    "test": "vitest run"
  },
  "dependencies": {
    "astro": "^4.0.0",
    "@astrojs/react": "^3.0.0",
    "@astrojs/node": "^8.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "framer-motion": "^11.0.0",
    "sanity": "^3.30.0",
    "@sanity/client": "^6.15.0",
    "@sanity/image-url": "^1.0.2",
    "@ably/sdk": "^1.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0",
    "eslint": "^8.57.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0"
  }
}
```

- [ ] **Step 6: Create apps/web/astro.config.mjs**

```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

export default defineConfig({
  integrations: [react()],
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  vite: {
    ssr: {
      noExternal: ['framer-motion']
    }
  }
});
```

- [ ] **Step 7: Create apps/web/tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@ylx/shared": ["../../packages/shared"]
    }
  }
}
```

- [ ] **Step 8: Create packages/sanity/package.json**

```json
{
  "name": "@ylx/sanity",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint . --ext .ts"
  },
  "dependencies": {
    "sanity": "^3.30.0",
    "@sanity/vision": "^3.30.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 9: Create packages/sanity/sanity.config.ts**

```typescript
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';

export default defineConfig({
  name: 'ylx-studio',
  title: 'YLx Studio',
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: 'production',
  plugins: [structureTool()],
  schema: {
    types: []
  }
});
```

- [ ] **Step 10: Create packages/mastra/package.json**

```json
{
  "name": "@ylx/mastra",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint . --ext .ts"
  },
  "dependencies": {
    "@mastra/core": "^0.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 11: Create packages/shared/package.json**

```json
{
  "name": "@ylx/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint . --ext .ts"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 12: Create packages/shared/types/index.ts**

```typescript
export interface Album {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number;
  status: 'active' | 'locked';
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  _id: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
  blurhash: string;
  width: number;
  height: number;
  albumId: string;
}

export interface Selection {
  _id: string;
  albumId: string;
  photoId: string;
  selectedAt: string;
}

export interface Submission {
  _id: string;
  albumId: string;
  selections: Selection[];
  submittedAt: string;
}
```

- [ ] **Step 13: Install dependencies and verify**

```bash
pnpm install
```

Expected: All dependencies installed, no errors.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: scaffold monorepo with Turborepo, Astro, Sanity, Mastra packages"
```

---

## Task 2: Sanity Schema Setup

**Covers:** [S2, S4]

**Files:**
- Create: `packages/sanity/schemas/album.ts`
- Create: `packages/sanity/schemas/photo.ts`
- Create: `packages/sanity/schemas/selection.ts`
- Create: `packages/sanity/schemas/submission.ts`
- Create: `packages/sanity/schemas/index.ts`
- Modify: `packages/sanity/sanity.config.ts`

- [ ] **Step 1: Create album schema**

```typescript
// packages/sanity/schemas/album.ts
import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'album',
  title: 'Album',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'clientName',
      title: 'Client Name',
      type: 'string',
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'eventDate',
      title: 'Event Date',
      type: 'date',
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'pin',
      title: 'Access PIN',
      type: 'string',
      validation: (rule) => rule.required().regex(/^\d{4}$/, 'Must be 4 digits')
    }),
    defineField({
      name: 'maxSelections',
      title: 'Maximum Selections',
      type: 'number',
      validation: (rule) => rule.required().min(1)
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Active', value: 'active' },
          { title: 'Locked', value: 'locked' }
        ]
      },
      initialValue: 'active'
    }),
    defineField({
      name: 'photos',
      title: 'Photos',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'photo' }] }]
    })
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'clientName'
    }
  }
});
```

- [ ] **Step 2: Create photo schema**

```typescript
// packages/sanity/schemas/photo.ts
import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'photo',
  title: 'Photo',
  type: 'document',
  fields: [
    defineField({
      name: 'filename',
      title: 'Filename',
      type: 'string',
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true
      },
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'album',
      title: 'Album',
      type: 'reference',
      to: [{ type: 'album' }],
      validation: (rule) => rule.required()
    })
  ],
  preview: {
    select: {
      title: 'filename',
      subtitle: 'album.clientName',
      media: 'image'
    }
  }
});
```

- [ ] **Step 3: Create selection schema**

```typescript
// packages/sanity/schemas/selection.ts
import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'selection',
  title: 'Selection',
  type: 'document',
  fields: [
    defineField({
      name: 'album',
      title: 'Album',
      type: 'reference',
      to: [{ type: 'album' }],
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'photo',
      title: 'Photo',
      type: 'reference',
      to: [{ type: 'photo' }],
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'selectedAt',
      title: 'Selected At',
      type: 'datetime',
      initialValue: () => new Date().toISOString()
    })
  ],
  preview: {
    select: {
      title: 'photo.filename',
      subtitle: 'album.clientName'
    }
  }
});
```

- [ ] **Step 4: Create submission schema**

```typescript
// packages/sanity/schemas/submission.ts
import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'submission',
  title: 'Submission',
  type: 'document',
  fields: [
    defineField({
      name: 'album',
      title: 'Album',
      type: 'reference',
      to: [{ type: 'album' }],
      validation: (rule) => rule.required()
    }),
    defineField({
      name: 'selections',
      title: 'Selections',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'selection' }] }]
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted At',
      type: 'datetime',
      initialValue: () => new Date().toISOString()
    })
  ],
  preview: {
    select: {
      title: 'album.title',
      subtitle: 'album.clientName'
    }
  }
});
```

- [ ] **Step 5: Create schema index**

```typescript
// packages/sanity/schemas/index.ts
import album from './album';
import photo from './photo';
import selection from './selection';
import submission from './submission';

export const schemaTypes = [album, photo, selection, submission];
```

- [ ] **Step 6: Update sanity.config.ts**

```typescript
// packages/sanity/sanity.config.ts
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './schemas';

export default defineConfig({
  name: 'ylx-studio',
  title: 'YLx Studio',
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: 'production',
  plugins: [structureTool()],
  schema: {
    types: schemaTypes
  }
});
```

- [ ] **Step 7: Build sanity package**

```bash
pnpm --filter @ylx/sanity build
```

Expected: TypeScript compiles without errors.

- [ ] **Step 8: Commit**

```bash
git add packages/sanity/
git commit -m "feat: add Sanity schemas for album, photo, selection, submission"
```

---

## Task 3: Sanity Client Configuration

**Covers:** [S2, S4]

**Files:**
- Create: `packages/sanity/client.ts`
- Create: `packages/sanity/lib/queries.ts`
- Create: `packages/sanity/lib/image.ts`
- Modify: `packages/sanity/package.json` (add exports)

- [ ] **Step 1: Create Sanity client**

```typescript
// packages/sanity/client.ts
import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

export const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: true
});

const builder = imageUrlBuilder(client);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
```

- [ ] **Step 2: Create queries**

```typescript
// packages/sanity/lib/queries.ts
export const albumBySlugQuery = `
  *[_type == "album" && slug.current == $slug][0] {
    _id,
    title,
    clientName,
    eventDate,
    pin,
    maxSelections,
    status,
    "photos": photos[]-> {
      _id,
      filename,
      image,
      "url": image.asset->url,
      "thumbnailUrl": image.asset->url + "?w=400&h=300&fit=cover",
      "blurhash": image.asset->metadata.blurHash,
      "width": image.asset->metadata.dimensions.width,
      "height": image.asset->metadata.dimensions.height
    },
    createdAt,
    updatedAt
  }
`;

export const allAlbumsQuery = `
  *[_type == "album"] | order(createdAt desc) {
    _id,
    title,
    clientName,
    eventDate,
    status,
    pin,
    maxSelections,
    "photoCount": count(photos),
    createdAt
  }
`;

export const selectionsByAlbumQuery = `
  *[_type == "selection" && album._ref == $albumId] {
    _id,
    "photo": photo-> {
      _id,
      filename,
      "url": image.asset->url
    },
    selectedAt
  }
`;

export const albumWithSelectionsQuery = `
  *[_type == "album" && _id == $albumId][0] {
    _id,
    title,
    clientName,
    status,
    pin,
    maxSelections,
    "selections": *[_type == "selection" && album._ref == ^._id] {
      _id,
      "photo": photo-> {
        _id,
        filename,
        "url": image.asset->url
      },
      selectedAt
    },
    "photos": photos[]-> {
      _id,
      filename
    }
  }
`;
```

- [ ] **Step 3: Create image utilities**

```typescript
// packages/sanity/lib/image.ts
import { urlFor } from '../client';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

export function getThumbnailUrl(source: SanityImageSource): string {
  return urlFor(source).width(400).height(300).fit('cover').url();
}

export function getFullSizeUrl(source: SanityImageSource): string {
  return urlFor(source).url();
}

export function getBlurHashUrl(source: SanityImageSource): string {
  return urlFor(source).width(20).blur(20).url();
}
```

- [ ] **Step 4: Update package.json exports**

```json
{
  "name": "@ylx/sanity",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client.js",
    "./schemas": "./dist/schemas/index.js",
    "./lib/*": "./dist/lib/*.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint . --ext .ts"
  },
  "dependencies": {
    "sanity": "^3.30.0",
    "@sanity/vision": "^3.30.0",
    "@sanity/client": "^6.15.0",
    "@sanity/image-url": "^1.0.2"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 5: Build and verify**

```bash
pnpm --filter @ylx/sanity build
```

Expected: TypeScript compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/sanity/
git commit -m "feat: add Sanity client, queries, and image utilities"
```

---

## Task 4: Shared Types and Utilities

**Covers:** [S1, S8]

**Files:**
- Create: `packages/shared/types/album.ts`
- Create: `packages/shared/types/photo.ts`
- Create: `packages/shared/types/selection.ts`
- Create: `packages/shared/utils/pin.ts`
- Create: `packages/shared/utils/format.ts`
- Modify: `packages/shared/types/index.ts`

- [ ] **Step 1: Create album types**

```typescript
// packages/shared/types/album.ts
export interface Album {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number;
  status: 'active' | 'locked';
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
}

export interface AlbumSummary {
  _id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: 'active' | 'locked';
  pin: string;
  maxSelections: number;
  photoCount: number;
  createdAt: string;
}

export interface AlbumWithSelections extends Album {
  selections: Selection[];
}
```

- [ ] **Step 2: Create photo types**

```typescript
// packages/shared/types/photo.ts
export interface Photo {
  _id: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
  blurhash: string;
  width: number;
  height: number;
  albumId: string;
}
```

- [ ] **Step 3: Create selection types**

```typescript
// packages/shared/types/selection.ts
export interface Selection {
  _id: string;
  albumId: string;
  photoId: string;
  photo: {
    _id: string;
    filename: string;
    url: string;
  };
  selectedAt: string;
}

export interface Submission {
  _id: string;
  albumId: string;
  selections: Selection[];
  submittedAt: string;
}
```

- [ ] **Step 4: Create PIN utility**

```typescript
// packages/shared/utils/pin.ts
export function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function formatPin(pin: string): string {
  return pin.replace(/(\d{2})(\d{2})/, '$1-$2');
}
```

- [ ] **Step 5: Create format utility**

```typescript
// packages/shared/utils/format.ts
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function formatFilenames(filenames: string[]): string {
  return filenames.join(', ');
}

export function truncateFilename(filename: string, maxLength: number = 20): string {
  if (filename.length <= maxLength) return filename;
  const ext = filename.split('.').pop();
  const name = filename.slice(0, maxLength - (ext?.length || 0) - 4);
  return `${name}...${ext}`;
}
```

- [ ] **Step 6: Update types index**

```typescript
// packages/shared/types/index.ts
export type { Album, AlbumSummary, AlbumWithSelections } from './album';
export type { Photo } from './photo';
export type { Selection, Submission } from './selection';
```

- [ ] **Step 7: Create shared index**

```typescript
// packages/shared/index.ts
export * from './types';
export * from './utils/pin';
export * from './utils/format';
```

- [ ] **Step 8: Build shared package**

```bash
pnpm --filter @ylx/shared build
```

Expected: TypeScript compiles without errors.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared types and utilities"
```

---

## Task 5: Astro Layout and Base Pages

**Covers:** [S5, S7]

**Files:**
- Create: `apps/web/src/layouts/BaseLayout.astro`
- Create: `apps/web/src/layouts/GalleryLayout.astro`
- Create: `apps/web/src/layouts/AdminLayout.astro`
- Create: `apps/web/src/pages/index.astro`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/styles/variables.css`

- [ ] **Step 1: Create CSS variables**

```css
/* apps/web/src/styles/variables.css */
:root {
  /* Colors - YLx brand */
  --color-bg: #0a0a0a;
  --color-surface: #141414;
  --color-surface-hover: #1a1a1a;
  --color-border: #2a2a2a;
  --color-text: #fafafa;
  --color-text-muted: #a0a0a0;
  --color-accent: #d4a574;
  --color-accent-hover: #e0b88a;
  --color-success: #4ade80;
  --color-error: #f87171;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: 'Playfair Display', Georgia, serif;

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  --space-3xl: 4rem;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;
}
```

- [ ] **Step 2: Create global styles**

```css
/* apps/web/src/styles/global.css */
@import './variables.css';

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-family: var(--font-sans);
  color: var(--color-text);
  background-color: var(--color-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  min-height: 100vh;
  line-height: 1.6;
}

a {
  color: var(--color-accent);
  text-decoration: none;
  transition: color var(--transition-fast);
}

a:hover {
  color: var(--color-accent-hover);
}

img {
  max-width: 100%;
  height: auto;
  display: block;
}

button {
  font-family: inherit;
  cursor: pointer;
}

input,
textarea,
select {
  font-family: inherit;
}
```

- [ ] **Step 3: Create BaseLayout**

```astro
---
// apps/web/src/layouts/BaseLayout.astro
interface Props {
  title: string;
  description?: string;
}

const { title, description = 'YLx Photo Proofing Platform' } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@500;600&display=swap"
      rel="stylesheet"
    />
    <title>{title} | YLx</title>
  </head>
  <body>
    <slot />
  </body>
</html>

<style is:global>
  @import '../styles/global.css';
</style>
```

- [ ] **Step 4: Create GalleryLayout**

```astro
---
// apps/web/src/layouts/GalleryLayout.astro
import BaseLayout from './BaseLayout.astro';

interface Props {
  title: string;
  clientName?: string;
}

const { title, clientName } = Astro.props;
---

<BaseLayout title={title}>
  <main class="gallery">
    <header class="gallery-header">
      <div class="gallery-brand">
        <span class="brand-name">YLx</span>
      </div>
      {clientName && (
        <div class="gallery-client">
          <span>Gallery for {clientName}</span>
        </div>
      )}
    </header>
    <div class="gallery-content">
      <slot />
    </div>
  </main>
</BaseLayout>

<style>
  .gallery {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .brand-name {
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-accent);
  }

  .gallery-client {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .gallery-content {
    flex: 1;
    padding: var(--space-lg);
  }

  @media (max-width: 768px) {
    .gallery-header {
      padding: var(--space-sm) var(--space-md);
    }

    .gallery-content {
      padding: var(--space-md);
    }
  }
</style>
```

- [ ] **Step 5: Create AdminLayout**

```astro
---
// apps/web/src/layouts/AdminLayout.astro
import BaseLayout from './BaseLayout.astro';

interface Props {
  title: string;
}

const { title } = Astro.props;
---

<BaseLayout title={title}>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="sidebar-brand">
        <span class="brand-name">YLx</span>
        <span class="brand-subtitle">Admin</span>
      </div>
      <nav class="sidebar-nav">
        <a href="/admin" class="nav-item">Albums</a>
        <a href="/admin/upload" class="nav-item">Upload</a>
      </nav>
    </aside>
    <main class="admin-main">
      <header class="admin-header">
        <h1>{title}</h1>
      </header>
      <div class="admin-content">
        <slot />
      </div>
    </main>
  </div>
</BaseLayout>

<style>
  .admin-layout {
    display: grid;
    grid-template-columns: 250px 1fr;
    min-height: 100vh;
  }

  .admin-sidebar {
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    padding: var(--space-lg);
  }

  .sidebar-brand {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    margin-bottom: var(--space-2xl);
  }

  .brand-name {
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-accent);
  }

  .brand-subtitle {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .nav-item {
    display: block;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    transition: all var(--transition-fast);
  }

  .nav-item:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .admin-main {
    display: flex;
    flex-direction: column;
  }

  .admin-header {
    padding: var(--space-lg) var(--space-xl);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .admin-header h1 {
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 500;
  }

  .admin-content {
    flex: 1;
    padding: var(--space-xl);
  }

  @media (max-width: 768px) {
    .admin-layout {
      grid-template-columns: 1fr;
    }

    .admin-sidebar {
      display: none;
    }
  }
</style>
```

- [ ] **Step 6: Create home page**

```astro
---
// apps/web/src/pages/index.astro
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="Welcome">
  <div class="home">
    <div class="home-content">
      <h1 class="home-title">YLx</h1>
      <p class="home-subtitle">Photo Proofing Platform</p>
      <div class="home-actions">
        <a href="/admin" class="btn btn-primary">Admin Dashboard</a>
        <p class="home-note">Or enter a gallery PIN to view your photos</p>
      </div>
    </div>
  </div>
</BaseLayout>

<style>
  .home {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-xl);
  }

  .home-title {
    font-family: var(--font-display);
    font-size: 4rem;
    font-weight: 600;
    color: var(--color-accent);
    margin-bottom: var(--space-sm);
  }

  .home-subtitle {
    font-size: 1.25rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-2xl);
  }

  .home-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
  }

  .btn {
    display: inline-block;
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius-md);
    font-weight: 500;
    transition: all var(--transition-fast);
  }

  .btn-primary {
    background: var(--color-accent);
    color: var(--color-bg);
  }

  .btn-primary:hover {
    background: var(--color-accent-hover);
  }

  .home-note {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .home-title {
      font-size: 2.5rem;
    }
  }
</style>
```

- [ ] **Step 7: Create favicon**

```svg
<!-- apps/web/public/favicon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#0a0a0a"/>
  <text x="50" y="65" font-family="Georgia, serif" font-size="40" font-weight="bold" fill="#d4a574" text-anchor="middle">YLx</text>
</svg>
```

- [ ] **Step 8: Add Astro config for path aliases**

```javascript
// apps/web/astro.config.mjs (update)
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

export default defineConfig({
  integrations: [react()],
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  vite: {
    ssr: {
      noExternal: ['framer-motion']
    },
    resolve: {
      alias: {
        '@': '/src',
        '@ylx/shared': '../../packages/shared'
      }
    }
  }
});
```

- [ ] **Step 9: Build and verify**

```bash
pnpm --filter @ylx/web build
```

Expected: Build completes without errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/
git commit -m "feat: add Astro layouts, base pages, and YLx design system"
```

---

## Task 6: Client Gallery - PIN Entry Component

**Covers:** [S3, S5]

**Files:**
- Create: `apps/web/src/components/gallery/PinEntry.tsx`
- Create: `apps/web/src/components/gallery/PinEntry.test.tsx`
- Create: `apps/web/src/pages/gallery/[slug].astro`
- Create: `apps/web/src/pages/gallery/[slug]/index.tsx`

- [ ] **Step 1: Write failing test for PinEntry**

```tsx
// apps/web/src/components/gallery/PinEntry.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PinEntry from './PinEntry';

describe('PinEntry', () => {
  it('renders 4 digit inputs', () => {
    render(<PinEntry onSubmit={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(4);
  });

  it('calls onSubmit with complete PIN', async () => {
    const onSubmit = vi.fn();
    render(<PinEntry onSubmit={onSubmit} />);
    
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: '1' } });
    fireEvent.change(inputs[1], { target: { value: '2' } });
    fireEvent.change(inputs[2], { target: { value: '3' } });
    fireEvent.change(inputs[3], { target: { value: '4' } });
    
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('shows error message when provided', () => {
    render(<PinEntry onSubmit={vi.fn()} error="Invalid PIN" />);
    expect(screen.getByText('Invalid PIN')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @ylx/web test PinEntry
```

Expected: FAIL with "Cannot find module './PinEntry'"

- [ ] **Step 3: Create PinEntry component**

```tsx
// apps/web/src/components/gallery/PinEntry.tsx
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PinEntryProps {
  onSubmit: (pin: string) => void;
  error?: string;
  isLoading?: boolean;
}

export default function PinEntry({ onSubmit, error, isLoading }: PinEntryProps) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newDigits.every(d => d !== '')) {
      onSubmit(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="pin-entry">
      <div className="pin-inputs">
        {digits.map((digit, index) => (
          <motion.input
            key={index}
            ref={el => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(index, e.target.value)}
            onKeyDown={e => handleKeyDown(index, e)}
            className="pin-digit"
            disabled={isLoading}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
          />
        ))}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            className="pin-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      {isLoading && (
        <motion.div
          className="pin-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Verifying...
        </motion.div>
      )}
      <style>{`
        .pin-entry {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-lg);
        }
        .pin-inputs {
          display: flex;
          gap: var(--space-sm);
        }
        .pin-digit {
          width: 64px;
          height: 80px;
          text-align: center;
          font-size: 2rem;
          font-family: var(--font-display);
          background: var(--color-surface);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-lg);
          color: var(--color-text);
          transition: all var(--transition-fast);
        }
        .pin-digit:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.2);
        }
        .pin-digit:disabled {
          opacity: 0.5;
        }
        .pin-error {
          color: var(--color-error);
          font-size: 0.875rem;
        }
        .pin-loading {
          color: var(--color-text-muted);
          font-size: 0.875rem;
        }
        @media (max-width: 480px) {
          .pin-digit {
            width: 56px;
            height: 72px;
            font-size: 1.75rem;
          }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @ylx/web test PinEntry
```

Expected: PASS

- [ ] **Step 5: Create gallery page component**

```tsx
// apps/web/src/pages/gallery/[slug]/index.tsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PinEntry from '../../../components/gallery/PinEntry';
import type { Album, Photo, Selection } from '@ylx/shared';

interface GalleryPageProps {
  slug: string;
}

export default function GalleryPage({ slug }: GalleryPageProps) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePinSubmit = async (pin: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/gallery/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      if (!response.ok) {
        throw new Error('Invalid PIN');
      }

      const data = await response.json();
      setAlbum(data.album);
      setIsAuthenticated(true);
    } catch (err) {
      setError('Invalid PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (photoId: string) => {
    if (!album) return;

    setSelections(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else if (next.size < album.maxSelections) {
        next.add(photoId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!album || selections.size === 0) return;

    try {
      const response = await fetch(`/api/gallery/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: Array.from(selections) })
      });

      if (!response.ok) {
        throw new Error('Submission failed');
      }

      setAlbum({ ...album, status: 'locked' });
    } catch (err) {
      setError('Failed to submit. Please try again.');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="gallery-auth">
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2>Enter Gallery</h2>
          <p>Enter your 4-digit PIN to view photos</p>
          <PinEntry onSubmit={handlePinSubmit} error={error || undefined} isLoading={isLoading} />
        </motion.div>
        <style>{`
          .gallery-auth {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-xl);
          }
          .auth-card {
            background: var(--color-surface);
            padding: var(--space-2xl);
            border-radius: var(--radius-xl);
            text-align: center;
            max-width: 400px;
            width: 100%;
          }
          .auth-card h2 {
            font-family: var(--font-display);
            font-size: 1.5rem;
            margin-bottom: var(--space-sm);
          }
          .auth-card p {
            color: var(--color-text-muted);
            margin-bottom: var(--space-xl);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="gallery-grid">
      <div className="gallery-info">
        <h2>{album?.title}</h2>
        <p className="selection-count">
          {selections.size} / {album?.maxSelections} selected
        </p>
      </div>
      <div className="photo-grid">
        {album?.photos.map((photo, index) => (
          <motion.div
            key={photo._id}
            className={`photo-item ${selections.has(photo._id) ? 'selected' : ''}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => toggleSelection(photo._id)}
          >
            <img
              src={photo.thumbnailUrl}
              alt={photo.filename}
              loading="lazy"
            />
            <div className="photo-overlay">
              <div className="photo-checkbox">
                {selections.has(photo._id) && (
                  <motion.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </motion.svg>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="gallery-actions">
        <button
          className="submit-btn"
          disabled={selections.size === 0 || album?.status === 'locked'}
          onClick={handleSubmit}
        >
          {album?.status === 'locked' ? 'Selection Locked' : 'Submit Selection'}
        </button>
      </div>
      <style>{`
        .gallery-grid {
          max-width: 1400px;
          margin: 0 auto;
        }
        .gallery-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-xl);
        }
        .gallery-info h2 {
          font-family: var(--font-display);
          font-size: 1.5rem;
        }
        .selection-count {
          color: var(--color-accent);
          font-weight: 500;
        }
        .photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: var(--space-md);
        }
        .photo-item {
          position: relative;
          aspect-ratio: 4/3;
          border-radius: var(--radius-lg);
          overflow: hidden;
          cursor: pointer;
          background: var(--color-surface);
        }
        .photo-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform var(--transition-normal);
        }
        .photo-item:hover img {
          transform: scale(1.05);
        }
        .photo-item.selected {
          outline: 3px solid var(--color-accent);
          outline-offset: 2px;
        }
        .photo-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            transparent 60%,
            rgba(0, 0, 0, 0.6)
          );
          opacity: 0;
          transition: opacity var(--transition-fast);
        }
        .photo-item:hover .photo-overlay {
          opacity: 1;
        }
        .photo-checkbox {
          position: absolute;
          top: var(--space-sm);
          right: var(--space-sm);
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--color-bg);
          border: 2px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-accent);
        }
        .photo-item.selected .photo-checkbox {
          background: var(--color-accent);
          border-color: var(--color-accent);
          color: var(--color-bg);
        }
        .gallery-actions {
          position: sticky;
          bottom: 0;
          padding: var(--space-lg);
          background: var(--color-bg);
          border-top: 1px solid var(--color-border);
          display: flex;
          justify-content: center;
        }
        .submit-btn {
          padding: var(--space-sm) var(--space-2xl);
          background: var(--color-accent);
          color: var(--color-bg);
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 1rem;
          transition: all var(--transition-fast);
        }
        .submit-btn:hover:not(:disabled) {
          background: var(--color-accent-hover);
          transform: translateY(-2px);
        }
        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        @media (max-width: 768px) {
          .photo-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: var(--space-sm);
          }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 6: Create Astro gallery page**

```astro
---
// apps/web/src/pages/gallery/[slug].astro
import GalleryLayout from '../../layouts/GalleryLayout.astro';
import GalleryPage from './index.tsx';

const { slug } = Astro.params;
---

<GalleryLayout title="Gallery">
  <GalleryPage client:load slug={slug!} />
</GalleryLayout>
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter @ylx/web test PinEntry
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/gallery/ apps/web/src/pages/gallery/
git commit -m "feat: add client gallery with PIN entry and photo selection"
```

---

## Task 7: Gallery API Endpoints

**Covers:** [S3, S5]

**Files:**
- Create: `apps/web/src/pages/api/gallery/[slug]/verify.ts`
- Create: `apps/web/src/pages/api/gallery/[slug]/submit.ts`
- Create: `apps/web/src/pages/api/gallery/[slug]/selections.ts`

- [ ] **Step 1: Create verify endpoint**

```typescript
// apps/web/src/pages/api/gallery/[slug]/verify.ts
import type { APIRoute } from 'astro';
import { client } from '@ylx/sanity/client';
import { albumBySlugQuery } from '@ylx/sanity/lib/queries';

export const POST: APIRoute = async ({ params, request }) => {
  const { slug } = params;
  const { pin } = await request.json();

  if (!slug || !pin) {
    return new Response(JSON.stringify({ error: 'Missing slug or pin' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const album = await client.fetch(albumBySlugQuery, { slug });

  if (!album) {
    return new Response(JSON.stringify({ error: 'Album not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (album.pin !== pin) {
    return new Response(JSON.stringify({ error: 'Invalid PIN' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ album }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Step 2: Create submit endpoint**

```typescript
// apps/web/src/pages/api/gallery/[slug]/submit.ts
import type { APIRoute } from 'astro';
import { client } from '@ylx/sanity/client';
import { albumBySlugQuery } from '@ylx/sanity/lib/queries';

export const POST: APIRoute = async ({ params, request }) => {
  const { slug } = params;
  const { selections } = await request.json();

  if (!slug || !selections || !Array.isArray(selections)) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const album = await client.fetch(albumBySlugQuery, { slug });

  if (!album) {
    return new Response(JSON.stringify({ error: 'Album not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (album.status === 'locked') {
    return new Response(JSON.stringify({ error: 'Album is locked' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (selections.length > album.maxSelections) {
    return new Response(JSON.stringify({ error: 'Too many selections' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create selection documents
  for (const photoId of selections) {
    await client.create({
      _type: 'selection',
      album: { _ref: album._id },
      photo: { _ref: photoId },
      selectedAt: new Date().toISOString()
    });
  }

  // Create submission document
  await client.create({
    _type: 'submission',
    album: { _ref: album._id },
    submittedAt: new Date().toISOString()
  });

  // Lock the album
  await client.patch(album._id).set({ status: 'locked' }).commit();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Step 3: Create selections endpoint**

```typescript
// apps/web/src/pages/api/gallery/[slug]/selections.ts
import type { APIRoute } from 'astro';
import { client } from '@ylx/sanity/client';
import { selectionsByAlbumQuery, albumBySlugQuery } from '@ylx/sanity/lib/queries';

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const album = await client.fetch(albumBySlugQuery, { slug });

  if (!album) {
    return new Response(JSON.stringify({ error: 'Album not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const selections = await client.fetch(selectionsByAlbumQuery, {
    albumId: album._id
  });

  return new Response(JSON.stringify({ selections }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @ylx/web build
```

Expected: Build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/api/
git commit -m "feat: add gallery API endpoints for PIN verification and submission"
```

---

## Task 8: Admin Dashboard - Album List

**Covers:** [S5, S6]

**Files:**
- Create: `apps/web/src/components/admin/AlbumList.tsx`
- Create: `apps/web/src/components/admin/AlbumCard.tsx`
- Create: `apps/web/src/pages/admin/index.astro`
- Create: `apps/web/src/pages/admin/index.tsx`

- [ ] **Step 1: Create AlbumCard component**

```tsx
// apps/web/src/components/admin/AlbumCard.tsx
import { motion } from 'framer-motion';
import type { AlbumSummary } from '@ylx/shared';
import { formatDate } from '@ylx/shared';

interface AlbumCardProps {
  album: AlbumSummary;
  onClick: () => void;
}

export default function AlbumCard({ album, onClick }: AlbumCardProps) {
  return (
    <motion.div
      className="album-card"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      <div className="album-status">
        <span className={`status-badge ${album.status}`}>
          {album.status === 'active' ? 'Active' : 'Locked'}
        </span>
      </div>
      <h3 className="album-title">{album.title}</h3>
      <p className="album-client">{album.clientName}</p>
      <div className="album-meta">
        <span>{formatDate(album.eventDate)}</span>
        <span>{album.photoCount} photos</span>
      </div>
      <div className="album-pin">
        PIN: {album.pin}
      </div>
      <style>{`
        .album-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .album-card:hover {
          border-color: var(--color-accent);
          box-shadow: var(--shadow-md);
        }
        .album-status {
          margin-bottom: var(--space-sm);
        }
        .status-badge {
          display: inline-block;
          padding: var(--space-xs) var(--space-sm);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
        }
        .status-badge.active {
          background: rgba(74, 222, 128, 0.15);
          color: var(--color-success);
        }
        .status-badge.locked {
          background: rgba(248, 113, 113, 0.15);
          color: var(--color-error);
        }
        .album-title {
          font-family: var(--font-display);
          font-size: 1.25rem;
          margin-bottom: var(--space-xs);
        }
        .album-client {
          color: var(--color-text-muted);
          margin-bottom: var(--space-md);
        }
        .album-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          color: var(--color-text-muted);
          margin-bottom: var(--space-sm);
        }
        .album-pin {
          font-family: monospace;
          color: var(--color-accent);
          font-size: 0.875rem;
        }
      `}</style>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create AlbumList component**

```tsx
// apps/web/src/components/admin/AlbumList.tsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AlbumCard from './AlbumCard';
import type { AlbumSummary } from '@ylx/shared';

interface AlbumListProps {
  onSelectAlbum: (album: AlbumSummary) => void;
}

export default function AlbumList({ onSelectAlbum }: AlbumListProps) {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAlbums();
  }, []);

  const fetchAlbums = async () => {
    try {
      const response = await fetch('/api/admin/albums');
      if (!response.ok) throw new Error('Failed to fetch albums');
      const data = await response.json();
      setAlbums(data.albums);
    } catch (err) {
      setError('Failed to load albums');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="album-list-loading">
        <motion.div
          className="loading-spinner"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <style>{`
          .album-list-loading {
            display: flex;
            justify-content: center;
            padding: var(--space-3xl);
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--color-border);
            border-top-color: var(--color-accent);
            border-radius: 50%;
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="album-list-error">
        <p>{error}</p>
        <button onClick={fetchAlbums}>Retry</button>
        <style>{`
          .album-list-error {
            text-align: center;
            padding: var(--space-3xl);
            color: var(--color-error);
          }
          .album-list-error button {
            margin-top: var(--space-md);
            padding: var(--space-sm) var(--space-lg);
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            color: var(--color-text);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="album-list">
      <AnimatePresence>
        {albums.map((album, index) => (
          <motion.div
            key={album._id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <AlbumCard
              album={album}
              onClick={() => onSelectAlbum(album)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
      {albums.length === 0 && (
        <div className="album-list-empty">
          <p>No albums yet. Create your first album to get started.</p>
        </div>
      )}
      <style>{`
        .album-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: var(--space-lg);
        }
        .album-list-empty {
          grid-column: 1 / -1;
          text-align: center;
          padding: var(--space-3xl);
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 3: Create admin page component**

```tsx
// apps/web/src/pages/admin/index.tsx
import { useState } from 'react';
import AlbumList from '../../components/admin/AlbumList';
import AlbumDetail from '../../components/admin/AlbumDetail';
import type { AlbumSummary, AlbumWithSelections } from '@ylx/shared';

export default function AdminPage() {
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumWithSelections | null>(null);

  const handleSelectAlbum = async (album: AlbumSummary) => {
    const response = await fetch(`/api/admin/albums/${album._id}`);
    const data = await response.json();
    setSelectedAlbum(data.album);
  };

  const handleBack = () => {
    setSelectedAlbum(null);
  };

  if (selectedAlbum) {
    return <AlbumDetail album={selectedAlbum} onBack={handleBack} />;
  }

  return <AlbumList onSelectAlbum={handleSelectAlbum} />;
}
```

- [ ] **Step 4: Create Astro admin page**

```astro
---
// apps/web/src/pages/admin/index.astro
import AdminLayout from '../../layouts/AdminLayout.astro';
import AdminPage from './index.tsx';
---

<AdminLayout title="Albums">
  <AdminPage client:load />
</AdminLayout>
```

- [ ] **Step 5: Build and verify**

```bash
pnpm --filter @ylx/web build
```

Expected: Build completes without errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/ apps/web/src/pages/admin/
git commit -m "feat: add admin dashboard with album list"
```

---

## Task 9: Admin Dashboard - Album Detail with Filename Export

**Covers:** [S5, S6]

**Files:**
- Create: `apps/web/src/components/admin/AlbumDetail.tsx`
- Create: `apps/web/src/components/admin/SelectionTable.tsx`
- Create: `apps/web/src/components/admin/CopyFilenamesButton.tsx`

- [ ] **Step 1: Create CopyFilenamesButton component**

```tsx
// apps/web/src/components/admin/CopyFilenamesButton.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatFilenames } from '@ylx/shared';

interface CopyFilenamesButtonProps {
  filenames: string[];
}

export default function CopyFilenamesButton({ filenames }: CopyFilenamesButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = formatFilenames(filenames);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="copy-btn-wrapper">
      <button
        className="copy-btn"
        onClick={handleCopy}
        disabled={filenames.length === 0}
      >
        {copied ? 'Copied!' : 'Copy List'}
      </button>
      <AnimatePresence>
        {copied && (
          <motion.span
            className="copy-success"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            Copied to clipboard
          </motion.span>
        )}
      </AnimatePresence>
      <style>{`
        .copy-btn-wrapper {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: var(--space-xs);
        }
        .copy-btn {
          padding: var(--space-sm) var(--space-lg);
          background: var(--color-accent);
          color: var(--color-bg);
          border: none;
          border-radius: var(--radius-md);
          font-weight: 500;
          transition: all var(--transition-fast);
        }
        .copy-btn:hover:not(:disabled) {
          background: var(--color-accent-hover);
        }
        .copy-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .copy-success {
          color: var(--color-success);
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Create SelectionTable component**

```tsx
// apps/web/src/components/admin/SelectionTable.tsx
import { motion } from 'framer-motion';
import type { Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';

interface SelectionTableProps {
  selections: Selection[];
}

export default function SelectionTable({ selections }: SelectionTableProps) {
  return (
    <div className="selection-table">
      <table>
        <thead>
          <tr>
            <th>Filename</th>
            <th>Selected At</th>
          </tr>
        </thead>
        <tbody>
          {selections.map((selection, index) => (
            <motion.tr
              key={selection._id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <td className="filename">{selection.photo.filename}</td>
              <td className="date">{formatDate(selection.selectedAt)}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      {selections.length === 0 && (
        <div className="empty-state">
          No selections yet
        </div>
      )}
      <style>{`
        .selection-table {
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: var(--space-sm) var(--space-md);
          text-align: left;
          border-bottom: 1px solid var(--color-border);
        }
        th {
          color: var(--color-text-muted);
          font-weight: 500;
          font-size: 0.875rem;
        }
        .filename {
          font-family: monospace;
        }
        .date {
          color: var(--color-text-muted);
        }
        .empty-state {
          text-align: center;
          padding: var(--space-2xl);
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 3: Create AlbumDetail component**

```tsx
// apps/web/src/components/admin/AlbumDetail.tsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SelectionTable from './SelectionTable';
import CopyFilenamesButton from './CopyFilenamesButton';
import type { AlbumWithSelections } from '@ylx/shared';
import { formatDate } from '@ylx/shared';

interface AlbumDetailProps {
  album: AlbumWithSelections;
  onBack: () => void;
}

export default function AlbumDetail({ album, onBack }: AlbumDetailProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    try {
      await fetch(`/api/admin/albums/${album._id}/unlock`, {
        method: 'POST'
      });
      window.location.reload();
    } catch (err) {
      console.error('Failed to unlock album');
    } finally {
      setIsUnlocking(false);
    }
  };

  const selectedFilenames = album.selections.map(s => s.photo.filename);

  return (
    <div className="album-detail">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button className="back-btn" onClick={onBack}>
          ← Back to Albums
        </button>

        <div className="detail-header">
          <div>
            <h2>{album.title}</h2>
            <p className="client-name">{album.clientName}</p>
          </div>
          <div className="detail-actions">
            <CopyFilenamesButton filenames={selectedFilenames} />
            {album.status === 'locked' && (
              <button
                className="unlock-btn"
                onClick={handleUnlock}
                disabled={isUnlocking}
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock Gallery'}
              </button>
            )}
          </div>
        </div>

        <div className="detail-meta">
          <div className="meta-item">
            <span className="meta-label">Event Date</span>
            <span className="meta-value">{formatDate(album.eventDate)}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Status</span>
            <span className={`meta-value status ${album.status}`}>
              {album.status === 'active' ? 'Active' : 'Locked'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">PIN</span>
            <span className="meta-value pin">{album.pin}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Max Selections</span>
            <span className="meta-value">{album.maxSelections}</span>
          </div>
        </div>

        <div className="selections-section">
          <h3>Selected Photos ({album.selections.length})</h3>
          <SelectionTable selections={album.selections} />
        </div>
      </motion.div>

      <style>{`
        .album-detail {
          max-width: 900px;
        }
        .back-btn {
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: 0.875rem;
          margin-bottom: var(--space-lg);
          padding: 0;
        }
        .back-btn:hover {
          color: var(--color-text);
        }
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-xl);
        }
        .detail-header h2 {
          font-family: var(--font-display);
          font-size: 1.75rem;
          margin-bottom: var(--space-xs);
        }
        .client-name {
          color: var(--color-text-muted);
        }
        .detail-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          align-items: flex-end;
        }
        .unlock-btn {
          padding: var(--space-sm) var(--space-lg);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text);
          font-weight: 500;
          transition: all var(--transition-fast);
        }
        .unlock-btn:hover:not(:disabled) {
          border-color: var(--color-accent);
        }
        .unlock-btn:disabled {
          opacity: 0.5;
        }
        .detail-meta {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-lg);
          padding: var(--space-lg);
          background: var(--color-surface);
          border-radius: var(--radius-lg);
          margin-bottom: var(--space-xl);
        }
        .meta-item {
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        .meta-label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-transform: uppercase;
        }
        .meta-value {
          font-weight: 500;
        }
        .meta-value.status.active {
          color: var(--color-success);
        }
        .meta-value.status.locked {
          color: var(--color-error);
        }
        .meta-value.pin {
          font-family: monospace;
          color: var(--color-accent);
        }
        .selections-section h3 {
          font-family: var(--font-display);
          font-size: 1.25rem;
          margin-bottom: var(--space-lg);
        }
        @media (max-width: 768px) {
          .detail-header {
            flex-direction: column;
            gap: var(--space-lg);
          }
          .detail-actions {
            align-items: flex-start;
          }
          .detail-meta {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @ylx/web build
```

Expected: Build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/
git commit -m "feat: add album detail view with selection table and filename export"
```

---

## Task 10: Admin API Endpoints

**Covers:** [S5, S6]

**Files:**
- Create: `apps/web/src/pages/api/admin/albums.ts`
- Create: `apps/web/src/pages/api/admin/albums/[id].ts`
- Create: `apps/web/src/pages/api/admin/albums/[id]/unlock.ts`

- [ ] **Step 1: Create albums list endpoint**

```typescript
// apps/web/src/pages/api/admin/albums.ts
import type { APIRoute } from 'astro';
import { client } from '@ylx/sanity/client';
import { allAlbumsQuery } from '@ylx/sanity/lib/queries';

export const GET: APIRoute = async () => {
  const albums = await client.fetch(allAlbumsQuery);
  return new Response(JSON.stringify({ albums }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Step 2: Create album detail endpoint**

```typescript
// apps/web/src/pages/api/admin/albums/[id].ts
import type { APIRoute } from 'astro';
import { client } from '@ylx/sanity/client';
import { albumWithSelectionsQuery } from '@ylx/sanity/lib/queries';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing album ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const album = await client.fetch(albumWithSelectionsQuery, { albumId: id });

  if (!album) {
    return new Response(JSON.stringify({ error: 'Album not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ album }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Step 3: Create unlock endpoint**

```typescript
// apps/web/src/pages/api/admin/albums/[id]/unlock.ts
import type { APIRoute } from 'astro';
import { client } from '@ylx/sanity/client';

export const POST: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing album ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await client.patch(id).set({ status: 'active' }).commit();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @ylx/web build
```

Expected: Build completes without errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/api/admin/
git commit -m "feat: add admin API endpoints for album management"
```

---

## Task 11: Ably Real-time Integration

**Covers:** [S5, S6]

**Files:**
- Create: `packages/shared/types/realtime.ts`
- Create: `apps/web/src/lib/ably.ts`
- Create: `apps/web/src/hooks/useRealtime.ts`
- Modify: `apps/web/src/pages/gallery/[slug]/index.tsx`

- [ ] **Step 1: Create realtime types**

```typescript
// packages/shared/types/realtime.ts
export interface RealtimeEvent {
  type: 'photo:uploaded' | 'selection:changed' | 'submission:received' | 'album:unlocked';
  albumId: string;
  data: Record<string, unknown>;
  timestamp: string;
}
```

- [ ] **Step 2: Create Ably client**

```typescript
// apps/web/src/lib/ably.ts
import Ably from 'ably';

let ablyInstance: Ably.Realtime | null = null;

export function getAblyClient(): Ably.Realtime {
  if (!ablyInstance) {
    ablyInstance = new Ably.Realtime({
      key: import.meta.env.PUBLIC_ABLY_KEY,
      clientId: `ylx-${Date.now()}`
    });
  }
  return ablyInstance;
}

export function getChannel_name(albumId: string): string {
  return `album:${albumId}`;
}
```

- [ ] **Step 3: Create useRealtime hook**

```tsx
// apps/web/src/hooks/useRealtime.ts
import { useEffect, useCallback } from 'react';
import { getAblyClient, getChannel_name } from '../lib/ably';
import type { RealtimeEvent } from '@ylx/shared';

interface UseRealtimeOptions {
  albumId: string;
  onPhotoUploaded?: (data: Record<string, unknown>) => void;
  onSelectionChanged?: (data: Record<string, unknown>) => void;
  onSubmissionReceived?: (data: Record<string, unknown>) => void;
  onAlbumUnlocked?: (data: Record<string, unknown>) => void;
}

export function useRealtime({
  albumId,
  onPhotoUploaded,
  onSelectionChanged,
  onSubmissionReceived,
  onAlbumUnlocked
}: UseRealtimeOptions) {
  const handleMessage = useCallback((message: Ably.Message) => {
    const event = message.data as RealtimeEvent;
    
    switch (event.type) {
      case 'photo:uploaded':
        onPhotoUploaded?.(event.data);
        break;
      case 'selection:changed':
        onSelectionChanged?.(event.data);
        break;
      case 'submission:received':
        onSubmissionReceived?.(event.data);
        break;
      case 'album:unlocked':
        onAlbumUnlocked?.(event.data);
        break;
    }
  }, [onPhotoUploaded, onSelectionChanged, onSubmissionReceived, onAlbumUnlocked]);

  useEffect(() => {
    const ably = getAblyClient();
    const channelName = getChannel_name(albumId);
    const channel = ably.channels.get(channelName);

    channel.subscribe('realtime-event', handleMessage);

    return () => {
      channel.unsubscribe('realtime-event', handleMessage);
    };
  }, [albumId, handleMessage]);
}
```

- [ ] **Step 4: Update shared types index**

```typescript
// packages/shared/types/index.ts
export type { Album, AlbumSummary, AlbumWithSelections } from './album';
export type { Photo } from './photo';
export type { Selection, Submission } from './selection';
export type { RealtimeEvent } from './realtime';
```

- [ ] **Step 5: Build shared package**

```bash
pnpm --filter @ylx/shared build
```

Expected: TypeScript compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/types/ apps/web/src/lib/ apps/web/src/hooks/
git commit -m "feat: add Ably real-time integration for live updates"
```

---

## Task 12: Mastra Workflows

**Covers:** [S4]

**Files:**
- Create: `packages/mastra/workflows/upload.ts`
- Create: `packages/mastra/workflows/submit.ts`
- Create: `packages/mastra/workflows/export.ts`
- Create: `packages/mastra/tools/sanity.ts`
- Create: `packages/mastra/index.ts`

- [ ] **Step 1: Create Sanity tools**

```typescript
// packages/mastra/tools/sanity.ts
import { createTool } from '@mastra/core';
import { client } from '@ylx/sanity/client';

export const createAlbumTool = createTool({
  id: 'create-album',
  description: 'Create a new album in Sanity',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      clientName: { type: 'string' },
      eventDate: { type: 'string' },
      pin: { type: 'string' },
      maxSelections: { type: 'number' }
    },
    required: ['title', 'clientName', 'eventDate', 'pin', 'maxSelections']
  },
  outputSchema: {
    type: 'object',
    properties: {
      albumId: { type: 'string' }
    }
  },
  execute: async ({ context }) => {
    const album = await client.create({
      _type: 'album',
      ...context,
      status: 'active',
      photos: []
    });
    return { albumId: album._id };
  }
});

export const uploadPhotoTool = createTool({
  id: 'upload-photo',
  description: 'Upload a photo to an album in Sanity',
  inputSchema: {
    type: 'object',
    properties: {
      albumId: { type: 'string' },
      filename: { type: 'string' },
      imageUrl: { type: 'string' }
    },
    required: ['albumId', 'filename', 'imageUrl']
  },
  outputSchema: {
    type: 'object',
    properties: {
      photoId: { type: 'string' }
    }
  },
  execute: async ({ context }) => {
    const photo = await client.create({
      _type: 'photo',
      filename: context.filename,
      image: { _type: 'image', asset: { _ref: context.imageUrl } },
      album: { _ref: context.albumId }
    });

    await client
      .patch(context.albumId)
      .append('photos', [{ _ref: photo._id }])
      .commit();

    return { photoId: photo._id };
  }
});

export const getSelectionsTool = createTool({
  id: 'get-selections',
  description: 'Get all selections for an album',
  inputSchema: {
    type: 'object',
    properties: {
      albumId: { type: 'string' }
    },
    required: ['albumId']
  },
  outputSchema: {
    type: 'object',
    properties: {
      selections: { type: 'array' }
    }
  },
  execute: async ({ context }) => {
    const selections = await client.fetch(
      `*[_type == "selection" && album._ref == $albumId] {
        _id,
        "photo": photo-> { filename },
        selectedAt
      }`,
      { albumId: context.albumId }
    );
    return { selections };
  }
});
```

- [ ] **Step 2: Create upload workflow**

```typescript
// packages/mastra/workflows/upload.ts
import { Workflow, Step } from '@mastra/core';
import { createAlbumTool, uploadPhotoTool } from '../tools/sanity';

const createAlbumStep = new Step({
  id: 'create-album',
  description: 'Create a new album',
  execute: async ({ context }) => {
    return await createAlbumTool.execute({
      context: context.albumData
    });
  }
});

const uploadPhotosStep = new Step({
  id: 'upload-photos',
  description: 'Upload photos to the album',
  execute: async ({ context }) => {
    const results = [];
    for (const photo of context.photos) {
      const result = await uploadPhotoTool.execute({
        context: {
          albumId: context.albumId,
          filename: photo.filename,
          imageUrl: photo.imageUrl
        }
      });
      results.push(result);
    }
    return { uploadedCount: results.length };
  }
});

export const uploadWorkflow = new Workflow('upload')
  .then(createAlbumStep)
  .then(uploadPhotosStep)
  .commit();
```

- [ ] **Step 3: Create submit workflow**

```typescript
// packages/mastra/workflows/submit.ts
import { Workflow, Step } from '@mastra/core';
import { client } from '@ylx/sanity/client';

const createSelectionsStep = new Step({
  id: 'create-selections',
  description: 'Create selection documents',
  execute: async ({ context }) => {
    const selections = [];
    for (const photoId of context.photoIds) {
      const selection = await client.create({
        _type: 'selection',
        album: { _ref: context.albumId },
        photo: { _ref: photoId },
        selectedAt: new Date().toISOString()
      });
      selections.push(selection);
    }
    return { selections };
  }
});

const createSubmissionStep = new Step({
  id: 'create-submission',
  description: 'Create submission and lock album',
  execute: async ({ context }) => {
    await client.create({
      _type: 'submission',
      album: { _ref: context.albumId },
      submittedAt: new Date().toISOString()
    });

    await client.patch(context.albumId).set({ status: 'locked' }).commit();

    return { success: true };
  }
});

export const submitWorkflow = new Workflow('submit')
  .then(createSelectionsStep)
  .then(createSubmissionStep)
  .commit();
```

- [ ] **Step 4: Create export workflow**

```typescript
// packages/mastra/workflows/export.ts
import { Workflow, Step } from '@mastra/core';
import { getSelectionsTool } from '../tools/sanity';

const getSelectionsStep = new Step({
  id: 'get-selections',
  description: 'Get selected photos',
  execute: async ({ context }) => {
    return await getSelectionsTool.execute({
      context: { albumId: context.albumId }
    });
  }
});

const formatFilenamesStep = new Step({
  id: 'format-filenames',
  description: 'Format filenames for Lightroom',
  execute: async ({ context }) => {
    const filenames = context.selections.map(
      (s: { photo: { filename: string } }) => s.photo.filename
    );
    return { filenames, csv: filenames.join(', ') };
  }
});

export const exportWorkflow = new Workflow('export')
  .then(getSelectionsStep)
  .then(formatFilenamesStep)
  .commit();
```

- [ ] **Step 5: Create Mastra index**

```typescript
// packages/mastra/index.ts
import { Mastra } from '@mastra/core';
import { uploadWorkflow } from './workflows/upload';
import { submitWorkflow } from './workflows/submit';
import { exportWorkflow } from './workflows/export';

export const mastra = new Mastra({
  workflows: {
    uploadWorkflow,
    submitWorkflow,
    exportWorkflow
  }
});
```

- [ ] **Step 6: Build Mastra package**

```bash
pnpm --filter @ylx/mastra build
```

Expected: TypeScript compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add packages/mastra/
git commit -m "feat: add Mastra workflows for upload, submit, and export"
```

---

## Task 13: E2E Tests with Mastra Agent Browser

**Covers:** [S4, S8]

**Files:**
- Create: `apps/web/tests/gallery.spec.ts`
- Create: `apps/web/tests/admin.spec.ts`
- Create: `apps/web/playwright.config.ts`

- [ ] **Step 1: Create Playwright config**

```typescript
// apps/web/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:4321',
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  webServer: {
    command: 'pnpm dev',
    port: 4321,
    reuseExistingServer: true
  }
});
```

- [ ] **Step 2: Create gallery E2E test**

```typescript
// apps/web/tests/gallery.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Gallery Flow', () => {
  test('can access gallery with valid PIN', async ({ page }) => {
    await page.goto('/gallery/test-album');
    
    // PIN entry should be visible
    await expect(page.locator('.pin-entry')).toBeVisible();
    
    // Enter PIN
    const inputs = page.locator('.pin-digit');
    await inputs.nth(0).fill('1');
    await inputs.nth(1).fill('2');
    await inputs.nth(2).fill('3');
    await inputs.nth(3).fill('4');
    
    // Should navigate to gallery
    await expect(page.locator('.photo-grid')).toBeVisible();
  });

  test('shows error for invalid PIN', async ({ page }) => {
    await page.goto('/gallery/test-album');
    
    const inputs = page.locator('.pin-digit');
    await inputs.nth(0).fill('0');
    await inputs.nth(1).fill('0');
    await inputs.nth(2).fill('0');
    await inputs.nth(3).fill('0');
    
    await expect(page.locator('.pin-error')).toBeVisible();
  });

  test('can select and deselect photos', async ({ page }) => {
    await page.goto('/gallery/test-album');
    
    // Enter valid PIN
    const inputs = page.locator('.pin-digit');
    await inputs.nth(0).fill('1');
    await inputs.nth(1).fill('2');
    await inputs.nth(2).fill('3');
    await inputs.nth(3).fill('4');
    
    // Wait for photos to load
    await expect(page.locator('.photo-item')).toHaveCount({ minimum: 1 });
    
    // Click first photo
    await page.locator('.photo-item').first().click();
    
    // Selection count should update
    await expect(page.locator('.selection-count')).toContainText('1 /');
    
    // Click again to deselect
    await page.locator('.photo-item').first().click();
    await expect(page.locator('.selection-count')).toContainText('0 /');
  });
});
```

- [ ] **Step 3: Create admin E2E test**

```typescript
// apps/web/tests/admin.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test('can view album list', async ({ page }) => {
    await page.goto('/admin');
    
    await expect(page.locator('.album-list')).toBeVisible();
  });

  test('can view album details', async ({ page }) => {
    await page.goto('/admin');
    
    // Wait for albums to load
    await expect(page.locator('.album-card')).toHaveCount({ minimum: 1 });
    
    // Click first album
    await page.locator('.album-card').first().click();
    
    // Should show album detail
    await expect(page.locator('.album-detail')).toBeVisible();
  });

  test('can copy filenames', async ({ page }) => {
    await page.goto('/admin');
    
    await expect(page.locator('.album-card')).toHaveCount({ minimum: 1 });
    await page.locator('.album-card').first().click();
    
    // Click copy button
    await page.locator('.copy-btn').click();
    
    await expect(page.locator('.copy-success')).toBeVisible();
  });
});
```

- [ ] **Step 4: Add Playwright dependency**

```json
// apps/web/package.json (update devDependencies)
{
  "devDependencies": {
    "@playwright/test": "^1.42.0"
  }
}
```

- [ ] **Step 5: Install and verify**

```bash
pnpm install
```

Expected: Dependencies installed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/ apps/web/playwright.config.ts
git commit -m "feat: add E2E tests for gallery and admin flows"
```

---

## Task 14: Environment Configuration

**Covers:** [S8]

**Files:**
- Create: `.env.example`
- Create: `apps/web/.env.local.example`
- Create: `vercel.json`

- [ ] **Step 1: Create root .env.example**

```env
# Sanity
SANITY_PROJECT_ID=your_project_id
SANITY_API_TOKEN=your_api_token

# Ably
ABLY_API_KEY=your_ably_api_key

# Mastra
MASTRA_API_KEY=your_mastra_api_key
```

- [ ] **Step 2: Create web .env.local.example**

```env
# Sanity (public)
PUBLIC_SANITY_PROJECT_ID=your_project_id
PUBLIC_SANITY_DATASET=production

# Ably (public)
PUBLIC_ABLY_KEY=your_ably_key
```

- [ ] **Step 3: Create vercel.json**

```json
{
  "buildCommand": "turbo build --filter=@ylx/web",
  "outputDirectory": "apps/web/dist",
  "framework": "astro",
  "installCommand": "pnpm install"
}
```

- [ ] **Step 4: Update .gitignore**

```
node_modules/
dist/
.turbo/
.env
.env.local
.env.*.local
*.log
.vercel
```

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/web/.env.local.example vercel.json .gitignore
git commit -m "feat: add environment configuration and Vercel deployment config"
```

---

## Summary

| Task | Description | Spec Coverage |
|------|-------------|---------------|
| 1 | Project scaffolding | S1, S8 |
| 2 | Sanity schema setup | S2, S4 |
| 3 | Sanity client configuration | S2, S4 |
| 4 | Shared types and utilities | S1, S8 |
| 5 | Astro layout and base pages | S5, S7 |
| 6 | Client gallery - PIN entry | S3, S5 |
| 7 | Gallery API endpoints | S3, S5 |
| 8 | Admin dashboard - album list | S5, S6 |
| 9 | Admin dashboard - album detail | S5, S6 |
| 10 | Admin API endpoints | S5, S6 |
| 11 | Ably real-time integration | S5, S6 |
| 12 | Mastra workflows | S4 |
| 13 | E2E tests | S4, S8 |
| 14 | Environment configuration | S8 |

**Total tasks:** 14
**Estimated time:** 4-6 hours (dependent on Sanity/Ably setup)
