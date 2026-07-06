import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

interface Album {
  _id: string;
  title: string;
  clientName: string;
}

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface UploadPageProps {
  adminName?: string;
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

export default function UploadPage({ adminName }: UploadPageProps) {
  const shouldReduceMotion = useReducedMotion();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Cache the direct-upload credentials for the lifetime of a batch. Refreshed at
  // the start of every startUpload() so a token that expired between batches is
  // never reused.
  const credsRef = useRef<UploadCredentials | null>(null);

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
    try {
      const response = await fetch('/api/admin/albums');
      const data = await response.json();
      setAlbums(data.albums || []);
    } catch (err) {
      console.error('Failed to fetch albums');
    }
  }, []);

  // Fetch albums on mount so the album selector is populated immediately
  useEffect(() => {
    void fetchAlbums();
  }, [fetchAlbums]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles = fileArray.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!VALID_EXTS.includes(ext || '')) return false;
      if (file.size > MAX_FILE_SIZE) return false;
      return true;
    });

    const uploadFiles: UploadFile[] = validFiles.map(file => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'pending',
      progress: 0,
    }));

    setFiles(prev => [...prev, ...uploadFiles]);
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

      for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
        // Reset to a clean uploading state (also clears a previous error on retry).
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0, error: undefined } : f
        ));

        try {
          const creds = await getCredentials();
          const assetId = await putAssetToSanity(creds, uploadFile.file, (pct) => {
            setFiles(prev => prev.map(f => (f.id === uploadFile.id ? { ...f, progress: pct } : f)));
          });
          await finalizePhoto(assetId, albumId, uploadFile.file.name);
          return { ok: true };
        } catch (err) {
          const e = err as RetryableError;
          lastError = e?.message || 'Upload failed';
          // A stale/invalid token affects every file — drop the cache so the next
          // attempt (this file or another) re-fetches fresh credentials.
          if (e?.status === 401) credsRef.current = null;

          const canRetry = e?.retryable === true && attempt < MAX_UPLOAD_ATTEMPTS;
          if (!canRetry) break;
          // Exponential backoff: 800ms, 1600ms, ...
          await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        }
      }

      return { ok: false, error: lastError };
    },
    [getCredentials]
  );

  const startUpload = useCallback(async () => {
    if (!selectedAlbum) return;
    // Process pending files and re-attempt previously failed ones in one pass.
    const queue = files.filter(f => f.status === 'pending' || f.status === 'error');
    if (queue.length === 0) return;

    // Refresh credentials once per batch.
    credsRef.current = null;
    setIsUploading(true);

    await runWithConcurrency(
      queue,
      async (uploadFile) => {
        const result = await uploadWithRetry(uploadFile, selectedAlbum);
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

    setIsUploading(false);
  }, [selectedAlbum, files, uploadWithRetry]);

  // Retry one failed file on demand (independent of the main batch button).
  const retryFile = useCallback(async (id: string) => {
    if (!selectedAlbum) return;
    const target = files.find(f => f.id === id);
    if (!target) return;

    setIsUploading(true);
    const result = await uploadWithRetry(target, selectedAlbum);
    setFiles(prev => prev.map(f =>
      f.id === id
        ? {
            ...f,
            status: result.ok ? 'done' : 'error',
            progress: result.ok ? 100 : 0,
            error: result.ok ? undefined : result.error,
          }
        : f
    ));
    setIsUploading(false);
  }, [selectedAlbum, files, uploadWithRetry]);

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  // The main button both uploads new files and retries failed ones.
  const queuedCount = pendingCount + errorCount;

  return (
    <div className="upload-page">
      <div className="upload-header">
        <h2>Upload Photos</h2>
        <p className="upload-subtitle">Drag & drop photos or click to select</p>
      </div>

      {/* Album Selection */}
      <div className="album-select-section">
        <label htmlFor="album-select">Select Album</label>
        <select
          id="album-select"
          value={selectedAlbum}
          onChange={(e) => {
            setSelectedAlbum(e.target.value);
            if (albums.length === 0) fetchAlbums();
          }}
          onFocus={() => { if (albums.length === 0) fetchAlbums(); }}
        >
          <option value="">-- Select an album --</option>
          {albums.map(album => (
            <option key={album._id} value={album._id}>
              {album.title} ({album.clientName})
            </option>
          ))}
        </select>
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
              <button className="btn-text" onClick={() => setFiles([])}>
                Clear all
              </button>
            </div>
          </div>

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
                    {uploadFile.status === 'pending' && (
                      <button className="btn-icon" onClick={() => removeFile(uploadFile.id)} aria-label="Remove file">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                    {uploadFile.status === 'uploading' && (
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ transform: `scaleX(${uploadFile.progress / 100})` }} />
                      </div>
                    )}
                    {uploadFile.status === 'done' && (
                      <span className="status-done">✓</span>
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

        .drop-zone:hover,
        .drop-zone.dragging {
          border-color: var(--color-accent);
          background-color: var(--color-surface);
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
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: var(--text-sm);
          cursor: pointer;
          padding: 0;
        }

        .btn-text:hover {
          color: var(--color-text);
        }

        .file-list {
          max-height: 400px;
          overflow-y: auto;
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
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: var(--space-1);
        }

        .btn-icon:hover {
          color: var(--color-error);
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
          min-height: 32px;
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
      `}</style>
    </div>
  );
}
