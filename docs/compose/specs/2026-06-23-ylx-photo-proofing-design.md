# YLx Photo Proofing Platform — Design Spec

## [S1] Problem

Wedding photographers need a streamlined way to distribute photos to clients and collect selections for final editing. Current workflows involve manual file sharing, email back-and-forth, and manual Lightroom filtering — which is error-prone and time-consuming.

## [S2] Solution Overview

A full-stack photo proofing platform (YLx) that provides:
- PIN-locked client galleries for photo selection
- Real-time admin dashboard for tracking submissions
- One-click Lightroom filename export
- Premium, mobile-first UI with smooth animations

## [S3] Core Architecture

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Data Store** | Sanity | Single source of truth for photos, albums, selections. Managed service with built-in image optimization. |
| **Frontend** | Astro + React islands | Island architecture for fast initial loads; React components only for interactive parts (selection grid, admin). |
| **Animations** | Framer Motion | Smooth, performant animations for premium feel. |
| **Real-time** | Ably | Live updates without page reload (new photo uploads, selection changes). |
| **Auth** | OAuth (Google/GitHub) | Passwordless admin authentication. |
| **Deployment** | Vercel | Serverless, edge-ready, Astro-native support. |
| **Structure** | Turborepo monorepo | Modular packages (frontend, backend, shared types) with shared build cache. |

## [S4] Photo Pipeline

### Upload Flow
- **Sources**: Sanity Studio UI, custom admin UI, Python API scripts
- **Batch support**: Up to 100 photos per batch upload
- **File limits**: 50MB max per file
- **Retry mechanism**: Automatic retry on network failures with exponential backoff

### Image Processing (Sanity-managed)
- **Auto-optimization**: Sanity compresses and resizes images automatically
- **Blurhash LQIP**: Low-quality image placeholders for progressive loading
- **Thumbnail generation**: Automatic thumbnail creation for gallery grid
- **Original access**: Full-resolution images available for download via Sanity CDN

### Storage
- **Primary**: Sanity assets (all images)
- **CDN**: Sanity's built-in CDN for optimized delivery

## [S5] Gallery Flow

### Album Lifecycle
1. **Creation** → Photographer creates album with:
   - Client name
   - Event date
   - 4-digit numeric PIN
   - Max selection limit (hard cap)
2. **Sharing** → Photographer shares gallery URL + PIN with client
3. **Selection** → Client accesses gallery, selects photos
4. **Submission** → Client submits, gallery locks
5. **Unlock** → Photographer can unlock if client needs to change selections

### Client Experience
- **Access**: Server-side PIN validation at `/gallery/[album-slug]`
- **Grid**: Responsive photo grid with smooth lazy loading
- **Selection**: Checkbox overlay on each photo, real-time counter
- **Hard cap**: Cannot exceed max selection limit
- **Submit**: Button disables when limit reached, enables when selections valid

### Admin Dashboard
- **Album list**: View all albums with status (active/locked)
- **Selection view**: See which photos client selected
- **Filename export**: "Copy List" button outputs comma-separated filenames for Lightroom filter
- **Real-time updates**: Ably-powered live updates for new uploads and submissions

## [S6] Mastra Integration

### Workflows
- **Upload processing**: Handle batch uploads, validation, Sanity asset creation
- **Selection submission**: Process client submissions, update album status
- **Export generation**: Compile selected filenames for Lightroom

### Agent Browser
- **E2E testing**: Automated verification of:
  - Gallery navigation and PIN entry
  - Photo selection and counter behavior
  - Submission and lock mechanics
  - Admin dashboard functionality

## [S7] Design Direction

### Brand
- **Name**: YLx
- **Philosophy**: Premium, non-generic, photo-focused

### Visual Style
- **Mobile-first**: Responsive design starting from mobile
- **Color**: Black/white base with warm accent tones
- **Typography**: Premium, clean, readable
- **Animations**: Smooth Framer Motion transitions
- **Reference**: `impeccable.style` principles

### UI Principles
- Ultra-clean layouts that let photos speak
- Minimal chrome, maximum image real estate
- Progressive blur-up image loading (LQIP)
- Seamless transitions between states

## [S8] Technical Constraints

- **Node.js**: v18+ (LTS)
- **Package manager**: pnpm (monorepo-optimized)
- **TypeScript**: Strict mode throughout
- **Testing**: Vitest for unit, Playwright for E2E
- **Linting**: ESLint + Prettier
- **CI/CD**: GitHub Actions → Vercel preview deployments
