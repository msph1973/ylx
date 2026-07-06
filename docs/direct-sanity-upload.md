# Direct-to-Sanity Photo Upload

Status: implemented on branch `feat/direct-sanity-upload`.

## Why

Vercel Serverless functions cap the **request body at ~4.5MB**. The previous upload
flow streamed each file *through* our own function (`POST /api/admin/upload`), so any
photo larger than ~4.5MB was rejected by the platform with `413
FUNCTION_PAYLOAD_TOO_LARGE` **before our handler ever ran**. Full-res wedding photos
(JPEG/TIFF) are almost always larger than that, so uploads "failed" with no useful
message.

The fix: upload the binary **straight from the browser to Sanity's Asset API**, which
has no such limit, and keep only the small document-wiring step on the server.

## Flow

```
Browser                         Our server (Vercel)              Sanity
   │                                   │                            │
   │ 1. GET /api/admin/upload/credentials (requireAdmin)           │
   │──────────────────────────────────▶│                           │
   │◀── { projectId, dataset, apiVersion, token } ─────────────────│
   │                                                               │
   │ 2. POST binary directly to Sanity Asset API (XHR, progress)   │
   │──────────────────────────────────────────────────────────────▶│
   │◀──────────────── { document: { _id: "image-…" } } ────────────│
   │                                                               │
   │ 3. POST /api/admin/upload/finalize  { assetId, albumId, name }│
   │──────────────────────────────────▶│  create photo doc +       │
   │                                    │  append to album.photos ──▶│
   │◀── { success, photoId } ───────────│                           │
```

- **`api/admin/upload/credentials.ts`** — admin-only; returns the write token at
  runtime. The token is **never bundled** into client JS; only an authenticated admin
  session can obtain it. Response is `Cache-Control: no-store`.
- **`api/admin/upload/finalize.ts`** — admin-only; receives a tiny JSON payload (well
  under 4.5MB), creates the `photo` document referencing the uploaded asset, appends it
  to the album's ordered `photos` array, and publishes `photo:uploaded`.
- The old `api/admin/upload.ts` (serverless proxy) is **removed**.

## Performance: many-at-once vs one-by-one

The client (`UploadPage.tsx`) uploads with a **bounded concurrency pool**
(`UPLOAD_CONCURRENCY = 3`):

| Strategy | Trade-off |
|---|---|
| Fully sequential (old behaviour) | Simple, but wastes time — each file waits on the previous file's full network round-trip. Slow for a big batch. |
| Unbounded parallel (all at once) | Saturates upstream bandwidth, spikes browser memory (each file is held in memory), and makes the progress UI unreadable; Sanity may also rate-limit (429). |
| **Bounded parallel (3, chosen)** | Keeps the link busy while capping memory/bandwidth and keeping progress legible. A sensible default for large full-res photos on typical connections. |

Notes / tuning:
- `3` is a pragmatic default. On a fast, wired connection you could raise it; on flaky
  mobile uploads, `2` can be steadier. It's a single constant at the top of
  `UploadPage.tsx`.
- Because uploads now go direct to Sanity, throughput is bounded by the client's
  upstream bandwidth and Sanity — **not** by Vercel function concurrency/duration.

## Retry mechanism (mandatory)

Two layers:

1. **Automatic retry per file** — `MAX_UPLOAD_ATTEMPTS = 3` (1 initial + 2 retries) with
   **exponential backoff** (`800ms`, then `1600ms`). Only *transient* failures are
   retried:
   - Retryable: network error / aborted (`status 0`), `408`, `429`, and any `5xx`.
   - Not retryable: `4xx` (auth, payload, validation) — retrying would fail identically.
2. **Manual retry** — failed files show their real error message plus a per-file
   **Retry** button; the main action button becomes **"Retry N failed"** when only
   failed files remain. Both reuse the same upload-with-retry path.

Credential handling: credentials are fetched once per batch and cached; a `401`
mid-batch drops the cache so the next attempt re-fetches a fresh token.

## Required configuration (deploy)

- **`SANITY_API_TOKEN` must be an Editor/write token** (not Viewer) — it performs
  `assets.upload` and document create/patch.
- **CORS**: add the app's origins (production + preview domains) to the Sanity project's
  **CORS origins** allowlist: `manage.sanity.io → API → CORS origins`. Without this the
  browser upload is blocked by CORS. **"Allow credentials" is not required** — we
  authenticate with a `Bearer` token, not cookies.

## Security note

Direct browser upload requires the write token to be available to the browser. We limit
exposure by (a) never bundling it into client JS and (b) serving it only to an
authenticated admin session via `requireAdmin`. For this single-admin internal tool that
trade-off is acceptable; a multi-tenant app would instead want per-user scoped or
short-lived upload tokens.

## Tests

`apps/web/tests/upload.spec.ts` (Playwright, all routes mocked):
1. Happy path — direct upload to (mocked) Sanity, then finalize → `Done: 1`.
2. Transient failure — first Sanity call `500`, retry succeeds → `Done: 1` (asserts ≥2 attempts).
3. Permanent failure — Sanity `400` → `Failed: 1` and a per-file **Retry** button appears.
