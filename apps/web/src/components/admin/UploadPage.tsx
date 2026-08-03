import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { resizeImageInWorker } from '../../lib/imageResizeClient';

interface Album {
  // The admin albums API (/api/admin/albums) returns each album keyed as `id`
  // (mapped from Sanity's `_id`). Using `_id` here made the field `undefined` at
  // runtime, so the <option> value fell back to its text content and finalize
  // received the album title instead of a real document id → 500 on getDocument.
  id: string;
  title: string;
  clientName: string;
}

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'resizing' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  // Stamped with the target album the first time this file starts uploading, so
  // a later independent retry (or a batch retry after the admin changes the
  // dropdown) always targets the SAME album the file was originally queued
  // against, instead of silently re-targeting whatever album is currently selected.
  albumId?: string;
}

// Credentials the browser uses to upload the binary straight to Sanity, bypassing
// Vercel's ~4.5MB serverless body limit. Fetched at runtime from an admin-only
// endpoint — never bundled into client JS.
interface UploadCredentials {
  projectId: string;
  dataset: string;
  apiVersion: string;
  token: string;
}

interface RetryableError extends Error {
  retryable?: boolean;
  status?: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (now genuinely supported — the
// binary goes direct to Sanity, so the old ~4.5MB Vercel cap no longer applies).
const VALID_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif'];

// Upload several files at once with a small parallelism cap. Fully sequential wastes
// time waiting on the network; unbounded parallelism floods bandwidth/memory and
// makes progress unreadable. 3 is a good middle ground for large full-res photos.
const UPLOAD_CONCURRENCY = 3;
// 1 initial attempt + up to 2 retries for transient failures.
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 800;
const MAX_RETRY_DELAY_MS = 30_000; // hard ceiling even if MAX_UPLOAD_ATTEMPTS grows later

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Network-layer failures (status 0) and transient server/rate-limit responses are
// worth retrying; 4xx (auth, payload too large, validation) are permanent — a retry
// would only fail again the same way.
function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function makeError(message: string, opts: { retryable: boolean; status?: number }): RetryableError {
  const err = new Error(message) as RetryableError;
  err.retryable = opts.retryable;
  err.status = opts.status;
  return err;
}

// One direct upload attempt of the raw file to Sanity's asset API. Resolves the
// created asset id (`image-...`), or rejects with a RetryableError. XHR is used
// (over fetch) so we get real upload-progress events for the large binary.
function putAssetToSanity(
  creds: UploadCredentials,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url =
      `https://${creds.projectId}.api.sanity.io/v${creds.apiVersion}` +
      `/assets/images/${creds.dataset}?filename=${encodeURIComponent(file.name)}`;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const assetId = JSON.parse(xhr.responseText)?.document?._id;
          if (typeof assetId === 'string' && assetId) {
            resolve(assetId);
            return;
          }
        } catch {
          /* fall through to reject */
        }
        reject(makeError('Malformed upload response from Sanity', { retryable: true }));
      } else {
        reject(
          makeError(`Sanity upload failed (${xhr.status})`, {
            retryable: isRetryableStatus(xhr.status),
            status: xhr.status,
          }),
        );
      }
    });
    xhr.addEventListener('error', () =>
      reject(makeError('Network error during upload', { retryable: true, status: 0 })),
    );
    xhr.addEventListener('timeout', () =>
      reject(makeError('Upload timed out', { retryable: true, status: 0 })),
    );
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${creds.token}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

// Small JSON call (well under 4.5MB) that wires the uploaded asset into a photo
// document + the album's ordered `photos` array, server-side.
async function finalizePhoto(assetId: string, albumId: string, filename: string): Promise<void> {
  const res = await fetch('/api/admin/upload/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, albumId, filename }),
  });
  if (!res.ok) {
    throw makeError(`Finalizing photo failed (${res.status})`, {
      retryable: isRetryableStatus(res.status),
      status: res.status,
    });
  }
}

// Run `worker` over `items` with at most `concurrency` in flight at once.
async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

export default function UploadPage() {
  const shouldReduceMotion = useReducedMotion();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  // Keep a ref in sync with files state so callbacks can read the latest value
  // without needing to re-subscribe on every files change. This avoids recreating
  // callbacks (and their dependents) on every progress event.
  const filesRef = useRef<UploadFile[]>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [albumsError, setAlbumsError] = useState<string | null>(null);
  // Human-readable summary of files dropped from the last add (bad format/size or
  // duplicate filenames). Null when nothing was skipped. Surfaced as a dismissible
  // banner so rejections aren't silent.
  const [skippedNotice, setSkippedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);
  // Cache the direct-upload credentials for the lifetime of a batch. Refreshed at
  // the start of every startUpload() so a token that expired between batches is
  // never reused.
  const credsRef = useRef<UploadCredentials | null>(null);
  // Reference-count in-flight upload activities (a batch and any per-file retries)
  // so `isUploading` only flips back to false once *nothing* is running — avoids a
  // per-file retry clearing the flag while a batch is still in progress.
  const activeCountRef = useRef(0);
  const beginActivity = useCallback(() => {
    activeCountRef.current += 1;
    if (mountedRef.current) setIsUploading(true);
  }, []);
  const endActivity = useCallback(() => {
    activeCountRef.current = Math.max(0, activeCountRef.current - 1);
    if (activeCountRef.current === 0 && mountedRef.current) setIsUploading(false);
  }, []);

  const getCredentials = useCallback(async (): Promise<UploadCredentials> => {
    if (credsRef.current) return credsRef.current;
    const res = await fetch('/api/admin/upload/credentials');
    if (!res.ok) {
      throw makeError(
        res.status === 401 ? 'Your session expired — please sign in again' : 'Could not start upload',
        { retryable: false, status: res.status },
      );
    }
    const creds = (await res.json()) as UploadCredentials;
    credsRef.current = creds;
    return creds;
  }, []);

  const fetchAlbums = useCallback(async () => {
    setAlbumsError(null);
    try {
      const response = await fetch('/api/admin/albums');
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Your session expired — please sign in again'
            : 'Failed to load albums'
        );
      }
      const data = await response.json();
      setAlbums(data.albums || []);
    } catch (err) {
      setAlbums([]);
      setAlbumsError(err instanceof Error ? err.message : 'Failed to load albums');
    }
  }, []);

  // Fetch albums on mount so the album selector is populated immediately
  useEffect(() => {
    void fetchAlbums();
  }, [fetchAlbums]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    // Names already queued — used to reject duplicate filenames (case-insensitive).
    // Read from ref to avoid recreating this callback on every files change.
    const existingNames = new Set(filesRef.current.map(f => f.file.name.toLowerCase()));
    // Names accepted within this same drop batch, so a batch that contains the
    // same filename twice only keeps the first occurrence.
    const seenInBatch = new Set<string>();

    let invalidCount = 0; // unsupported format or larger than MAX_FILE_SIZE
    let duplicateCount = 0; // filename already queued or repeated in this batch
    const accepted: File[] = [];

    for (const file of fileArray) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!VALID_EXTS.includes(ext || '') || file.size > MAX_FILE_SIZE) {
        invalidCount++;
        continue;
      }
      const key = file.name.toLowerCase();
      if (existingNames.has(key) || seenInBatch.has(key)) {
        duplicateCount++;
        continue;
      }
      seenInBatch.add(key);
      accepted.push(file);
    }

    const uploadFiles: UploadFile[] = accepted.map(file => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'pending',
      progress: 0,
    }));

    if (uploadFiles.length > 0) {
      setFiles(prev => [...prev, ...uploadFiles]);
    }

    // Build a concise, human-readable summary of anything that was dropped.
    const parts: string[] = [];
    if (invalidCount > 0) {
      const maxMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));
      parts.push(
        `${invalidCount} file${invalidCount === 1 ? '' : 's'} skipped — unsupported format or larger than ${maxMb}MB`,
      );
    }
    if (duplicateCount > 0) {
      parts.push(
        `${duplicateCount} duplicate filename${duplicateCount === 1 ? '' : 's'} skipped`,
      );
    }
    setSkippedNotice(parts.length > 0 ? `${parts.join('; ')}.` : null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    // Reset so re-selecting the exact same file(s) after removing them from the
    // queue still fires a change event — browsers don't fire `change` when the
    // input's value is reselected unchanged.
    e.target.value = '';
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setFiles(prev => prev.filter(f => f.status !== 'done'));
  }, []);

  // Upload a single file with automatic retry on transient failures. The binary
  // goes straight to Sanity (progress tracked), then a tiny finalize call wires it
  // to the album. Returns a result the caller writes back into file state.
  const uploadWithRetry = useCallback(
    async (uploadFile: UploadFile, albumId: string): Promise<{ ok: boolean; error?: string }> => {
      let lastError = 'Upload failed';
      // Preserve the asset id across retries: if the binary upload already
      // succeeded and only finalize failed, retry finalize alone instead of
      // re-uploading the file (which would create a duplicate/orphan asset).
      let assetId: string | null = null;

      // Resize/re-encode before the first network attempt — this is CPU-bound and
      // runs off the main thread (see imageResizeClient), so a big batch doesn't
      // freeze the UI. It's also idempotent (an already-small file is returned
      // untouched), so redoing it on a retry is cheap and keeps this function
      // self-contained rather than needing a separate cache across calls.
      setFiles(prev => prev.map(f => (f.id === uploadFile.id ? { ...f, status: 'resizing' } : f)));
      const { file: fileToUpload } = await resizeImageInWorker(uploadFile.file);
      if (fileToUpload !== uploadFile.file) {
        setFiles(prev => prev.map(f => (f.id === uploadFile.id ? { ...f, file: fileToUpload } : f)));
      }

      for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
        // Reset to a clean uploading state (also clears a previous error on retry).
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id ? { ...f, status: 'uploading', progress: assetId ? 100 : 0, error: undefined } : f
        ));

        try {
          const creds = await getCredentials();
          if (!assetId) {
            // XHR fires many progress events per file; only commit a state update
            // (which clones the whole files array and re-renders every row) when
            // the visible percentage actually moves, so a big batch upload doesn't
            // re-render the entire list on every tick.
            let lastReportedPct = -1;
            assetId = await putAssetToSanity(creds, fileToUpload, (pct) => {
              if (pct < 100 && pct - lastReportedPct < 3) return;
              lastReportedPct = pct;
              setFiles(prev => prev.map(f => (f.id === uploadFile.id ? { ...f, progress: pct } : f)));
            });
          }
          await finalizePhoto(assetId, albumId, uploadFile.file.name);
          return { ok: true };
        } catch (err) {
          const e = err as RetryableError;
          lastError = e?.message || 'Upload failed';
          let canRetry = e?.retryable === true && attempt < MAX_UPLOAD_ATTEMPTS;
          // A 401 with a freshly-refreshed token is already fixed — the failure
          // was an expired token, not server load or network congestion, so
          // there's nothing gained by waiting out the normal backoff delay.
          let recoveredFrom401 = false;

          if (e?.status === 401) {
            credsRef.current = null;
            try {
              await getCredentials();
              canRetry = attempt < MAX_UPLOAD_ATTEMPTS;
              recoveredFrom401 = true;
            } catch {
              canRetry = false;
            }
          }

          if (!canRetry) break;
          if (!recoveredFrom401) {
            await delay(Math.min(MAX_RETRY_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
          }
        }
      }

      return { ok: false, error: lastError };
    },
    [getCredentials]
  );

  const startUpload = useCallback(async () => {
    if (!selectedAlbum) return;
    const targetAlbumId = selectedAlbum;
    const queueIds = files
      .filter(f => f.status === 'pending' || f.status === 'error')
      .map(f => f.id);
    if (queueIds.length === 0) return;

    const queueIdSet = new Set(queueIds);
    setFiles(prev => prev.map(f => (queueIdSet.has(f.id) ? { ...f, albumId: f.albumId ?? targetAlbumId } : f)));
    const queue = files
      .filter(f => queueIdSet.has(f.id))
      .map(f => ({ ...f, albumId: f.albumId ?? targetAlbumId }));

    // Refresh credentials once per batch.
    credsRef.current = null;
    beginActivity();
    try {
      // Warm the credential cache once so the concurrent workers below share a
      // single GET instead of each firing its own. A failure here is non-fatal —
      // each file's own attempt will surface the error.
      try {
        await getCredentials();
      } catch {
        /* per-file uploads will report the credential error */
      }

      await runWithConcurrency(
        queue,
        async (uploadFile) => {
          const result = await uploadWithRetry(uploadFile, uploadFile.albumId);
          setFiles(prev => prev.map(f =>
            f.id === uploadFile.id
              ? {
                  ...f,
                  status: result.ok ? 'done' : 'error',
                  progress: result.ok ? 100 : 0,
                  error: result.ok ? undefined : result.error,
                }
              : f
          ));
        },
        UPLOAD_CONCURRENCY
      );
    } finally {
      endActivity();
    }
  }, [selectedAlbum, files, uploadWithRetry, getCredentials, beginActivity, endActivity]);

  // Retry one failed file on demand (independent of the main batch button).
  const retryFile = useCallback(async (id: string) => {
    const target = filesRef.current.find(f => f.id === id);
    if (!target) return;
    const targetAlbumId = target.albumId ?? selectedAlbum;
    if (!targetAlbumId) return;

    beginActivity();
    try {
      const result = await uploadWithRetry(target, targetAlbumId);
      setFiles(prev => prev.map(f =>
        f.id === id
          ? {
              ...f,
              status: result.ok ? 'done' : 'error',
              progress: result.ok ? 100 : 0,
              error: result.ok ? undefined : result.error,
              albumId: targetAlbumId, // keep it stamped for any further retry
            }
          : f
      ));
    } finally {
      endActivity();
    }
  }, [selectedAlbum, uploadWithRetry, beginActivity, endActivity]);

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  // The main button both uploads new files and retries failed ones.
  const queuedCount = pendingCount + errorCount;

  // Byte-weighted aggregate so the bar moves continuously as bytes actually
  // transfer, instead of jumping only when a whole file finishes (which could
  // look frozen for a long time on a batch of a few large photos). Errored
  // files still count their full size as "settled" bytes so the bar still
  // reaches 100% once nothing is in flight, even when some uploads failed.
  const totalUploadBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const loadedUploadBytes = files.reduce((sum, f) => {
    if (f.status === 'done' || f.status === 'error') return sum + f.file.size;
    if (f.status === 'uploading') return sum + (f.file.size * f.progress) / 100;
    return sum; // pending / resizing haven't sent any bytes yet
  }, 0);
  // Clamped defensively — rounding/future changes to the byte math above
  // must never push this past what aria-valuenow/scaleX can sanely render.
  const batchProgressPct = totalUploadBytes > 0
    ? Math.min(100, Math.max(0, (loadedUploadBytes / totalUploadBytes) * 100))
    : 0;

  return (
    <div className="upload-page">
      <div className="upload-header">
        <h2>Upload Photos</h2>
        <p className="upload-subtitle">Drag & drop photos or click to select</p>
      </div>

      {/* Album Selection */}
      <div className="album-select-section">
        <label htmlFor="album-select">Select Album</label>
        {albumsError ? (
          <div className="albums-error" role="alert">
            <span>{albumsError}</span>
            <button type="button" className="btn-text" onClick={() => { void fetchAlbums(); }}>
              Retry
            </button>
          </div>
        ) : (
          <select
            id="album-select"
            value={selectedAlbum}
            disabled={isUploading}
            onChange={(e) => {
              setSelectedAlbum(e.target.value);
              if (albums.length === 0) fetchAlbums();
            }}
            onFocus={() => { if (albums.length === 0) fetchAlbums(); }}
          >
            <option value="">-- Select an album --</option>
            {albums.map(album => (
              <option key={album.id} value={album.id}>
                {album.title} ({album.clientName})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Drop Zone */}
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Add photos: drop files here, or press Enter to browse"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.tiff,.tif"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="drop-zone-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <p>Drop photos here or click to browse</p>
          <span>JPG, PNG, WebP, TIFF • Max 50MB each</span>
        </div>
      </div>

      {/* Skipped-files notice */}
      {skippedNotice && (
        <div className="skipped-notice" role="status">
          <span className="skipped-notice-text">{skippedNotice}</span>
          <button
            className="skipped-notice-dismiss"
            aria-label="Dismiss"
            onClick={() => setSkippedNotice(null)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="file-list-section">
          <div className="file-list-header">
            <span>{files.length} photos selected</span>
            <div className="file-list-actions">
              {doneCount > 0 && (
                <button className="btn-text" onClick={clearCompleted}>
                  Clear completed ({doneCount})
                </button>
              )}
              <button className="btn-text" onClick={() => setFiles([])} disabled={isUploading}>
                Clear all
              </button>
            </div>
          </div>

          {(isUploading || doneCount + errorCount > 0) && (
            <div className="batch-progress-section">
              <div className="batch-progress-label">
                <span>Uploaded {doneCount} of {files.length}</span>
              </div>
              <div
                className="batch-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(batchProgressPct)}
              >
                <div
                  className="batch-progress-fill"
                  style={{ transform: `scaleX(${batchProgressPct / 100})` }}
                />
              </div>
            </div>
          )}

          <div className="file-list">
            <AnimatePresence>
              {files.map((uploadFile) => (
                <motion.div
                  key={uploadFile.id}
                  className={`file-item ${uploadFile.status}`}
                  initial={shouldReduceMotion ? {} : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={shouldReduceMotion ? {} : { opacity: 0, height: 0 }}
                >
                  <div className="file-info">
                    <span className="file-name">{uploadFile.file.name}</span>
                    {uploadFile.status === 'error' && uploadFile.error ? (
                      <span className="file-error-msg" role="alert">{uploadFile.error}</span>
                    ) : (
                      <span className="file-size">
                        {(uploadFile.file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                  <div className="file-status">
{(uploadFile.status === 'pending' || uploadFile.status === 'resizing') && (
                      <button type="button" className="btn-icon" onClick={() => removeFile(uploadFile.id)} aria-label="Remove file" disabled={isUploading}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                    {uploadFile.status === 'resizing' && (
                      <span className="status-resizing">Optimizing…</span>
                    )}
                    {uploadFile.status === 'uploading' && (
                      <div
                        className="progress-bar"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={uploadFile.progress}
                        aria-label={`Uploading ${uploadFile.file.name}`}
                      >
                        <div className="progress-fill" style={{ transform: `scaleX(${uploadFile.progress / 100})` }} />
                      </div>
                    )}
                    {uploadFile.status === 'done' && (
                      <span className="status-done" role="img" aria-label="Upload complete">✓</span>
                    )}
                    {uploadFile.status === 'error' && (
                      <>
                        <span className="status-error" aria-hidden="true">✗</span>
                        <button
                          className="btn-retry"
                          onClick={() => retryFile(uploadFile.id)}
                          disabled={isUploading}
                        >
                          Retry
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Upload Button */}
          <div className="upload-actions">
            <button
              className="upload-btn"
              onClick={startUpload}
              disabled={!selectedAlbum || queuedCount === 0 || isUploading}
            >
              {isUploading
                ? 'Uploading...'
                : errorCount > 0 && pendingCount === 0
                  ? `Retry ${errorCount} failed`
                  : `Upload ${queuedCount} ${queuedCount === 1 ? 'photo' : 'photos'}`
              }
            </button>
          </div>

          {/* Stats */}
          <div className="upload-stats">
            <span className="stat">Pending: {pendingCount}</span>
            <span className="stat success">Done: {doneCount}</span>
            {errorCount > 0 && (
              <span className="stat error">Failed: {errorCount}</span>
            )}
          </div>
        </div>
      )}

      <style>{`
        .upload-page {
          max-width: 800px;
        }

        .upload-header {
          margin-bottom: var(--space-6);
        }

        .upload-header h2 {
          font-family: var(--font-sans);
          font-size: var(--text-2xl);
          font-weight: var(--font-semibold);
          margin-bottom: var(--space-2);
        }

        .upload-subtitle {
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }

        .album-select-section {
          margin-bottom: var(--space-6);
        }

        .album-select-section label {
          display: block;
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-muted);
          margin-bottom: var(--space-2);
        }

        .album-select-section select {
          width: 100%;
          padding: var(--space-3);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text);
          font-size: var(--text-base);
          cursor: pointer;
        }

        .album-select-section select:focus {
          outline: none;
          border-color: var(--color-accent);
        }

        .drop-zone {
          border: 2px dashed var(--color-border);
          border-radius: var(--radius-xl);
          padding: var(--space-12);
          text-align: center;
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-bottom: var(--space-6);
        }

        .drop-zone.dragging {
          border-color: var(--color-accent);
          background-color: var(--color-surface);
        }

        @media (hover: hover) {
          .drop-zone:hover {
            border-color: var(--color-accent);
            background-color: var(--color-surface);
          }
        }

        .drop-zone:focus-visible {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
        }

        .drop-zone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-3);
          color: var(--color-text-muted);
        }

        .drop-zone-content svg {
          opacity: 0.5;
        }

        .drop-zone-content p {
          font-size: var(--text-base);
          color: var(--color-text);
          margin: 0;
        }

        .drop-zone-content span {
          font-size: var(--text-sm);
        }

        .file-list-section {
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          overflow: hidden;
        }

        .file-list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .file-list-actions {
          display: flex;
          gap: var(--space-3);
        }

        .btn-text {
          display: inline-flex;
          align-items: center;
          min-height: var(--tap-target-min);
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: var(--text-sm);
          cursor: pointer;
          padding: 0;
        }

        @media (hover: hover) {
          .btn-text:hover {
            color: var(--color-text);
          }
        }

        .btn-text:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .albums-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-3);
          background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          color: var(--color-error);
        }

        .albums-error .btn-text {
          color: var(--color-error);
          font-weight: var(--font-medium);
        }

        .file-list {
          max-height: 400px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .file-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .file-item:last-child {
          border-bottom: none;
        }

        .file-info {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          min-width: 0;
          flex: 1;
        }

        .file-name {
          font-size: var(--text-sm);
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-size {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
        }

        .file-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          min-width: 100px;
          justify-content: flex-end;
        }

        .btn-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: var(--tap-target-min);
          min-width: var(--tap-target-min);
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: var(--space-1);
        }

        .btn-icon:hover {
          color: var(--color-error);
        }

        .btn-icon:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .progress-bar {
          width: 80px;
          height: 4px;
          background-color: var(--color-border);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          width: 100%;
          background-color: var(--color-accent);
          transform-origin: left;
          transform: scaleX(0);
          transition: transform var(--transition-fast);
        }

        .status-done {
          color: var(--color-success);
          font-weight: var(--font-medium);
        }

        .status-resizing {
          color: var(--color-text-muted);
          font-size: var(--text-xs);
          white-space: nowrap;
        }

        .status-error {
          color: var(--color-error);
          font-weight: var(--font-medium);
        }

        .file-error-msg {
          font-size: var(--text-xs);
          color: var(--color-error);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .btn-retry {
          min-height: var(--tap-target-min);
          padding: var(--space-1) var(--space-3);
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: border-color var(--transition-fast), color var(--transition-fast);
        }

        .btn-retry:hover:not(:disabled) {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }

        .btn-retry:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .upload-actions {
          padding: var(--space-4);
          border-top: 1px solid var(--color-border);
        }

        .upload-btn {
          width: 100%;
          padding: var(--space-3);
          background-color: var(--color-accent);
          color: var(--color-bg);
          border: none;
          border-radius: var(--radius-md);
          font-size: var(--text-base);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: background-color var(--transition-fast);
        }

        .upload-btn:hover:not(:disabled) {
          background-color: var(--color-accent-hover);
        }

        .upload-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .upload-stats {
          display: flex;
          gap: var(--space-4);
          padding: var(--space-3) var(--space-4);
          border-top: 1px solid var(--color-border);
          font-size: var(--text-sm);
        }

        .stat {
          color: var(--color-text-muted);
        }

        .stat.success {
          color: var(--color-success);
        }

        .stat.error {
          color: var(--color-error);
        }

        .skipped-notice {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          margin-bottom: var(--space-6);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }

        .skipped-notice-text {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }

        .skipped-notice-dismiss {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: var(--tap-target-min);
          min-width: var(--tap-target-min);
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: var(--space-1);
        }

        .skipped-notice-dismiss:hover {
          color: var(--color-text);
        }

        .batch-progress-section {
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .batch-progress-label {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          margin-bottom: var(--space-2);
        }

        .batch-progress {
          width: 100%;
          height: 6px;
          background-color: var(--color-border);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .batch-progress-fill {
          height: 100%;
          width: 100%;
          background-color: var(--color-accent);
          transform-origin: left;
          transform: scaleX(0);
          transition: transform var(--transition-fast);
        }

        @media (prefers-reduced-motion: reduce) {
          .batch-progress-fill,
          .progress-fill {
            transition: none;
          }
        }

        @media (max-width: 480px) {
          .upload-page { padding: 0; }

          .drop-zone {
            padding: var(--space-6);
            border-radius: var(--radius-lg);
            margin-left: var(--space-3);
            margin-right: var(--space-3);
          }

          .upload-header,
          .album-select-section,
          .skipped-notice {
            padding-left: var(--space-3);
            padding-right: var(--space-3);
          }

          .file-item {
            padding: var(--space-3);
            gap: var(--space-2);
          }

          .file-status {
            min-width: 0;
            flex-shrink: 0;
            max-width: 80px;
          }

          .progress-bar {
            width: 100%;
            max-width: 50px;
          }

          .upload-stats {
            flex-wrap: wrap;
            gap: var(--space-2);
          }

          .file-list-header {
            flex-direction: column;
            align-items: stretch;
            gap: var(--space-2);
            padding: var(--space-3);
          }

          .file-list-actions {
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  );
}
