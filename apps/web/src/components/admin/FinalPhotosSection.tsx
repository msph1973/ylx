import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Photo } from '@ylx/shared';
import { BlurImage } from '@/components/gallery/BlurImage';
import { ConfirmDialog } from './ConfirmDialog';
import { runWithConcurrency } from '@/lib/concurrency';
import type { AlbumStatusVariant } from '@/lib/albumStatus';
import {
  type UploadCredentials,
  type RetryableError,
  RETRY_BASE_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  delay,
  makeError,
  isRetryableStatus,
  putAssetToSanity,
} from '@/lib/sanityUpload';

interface FinalPhotosSectionProps {
  albumId: string;
  status: AlbumStatusVariant;
  finalPhotos: Photo[];
  /** Re-fetches the parent album so `status`/`finalPhotos` reflect the latest state. */
  onRefresh: () => void | Promise<void>;
}

interface FinalUploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — mirrors the main upload flow.
const VALID_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif'];

// Mirrors UploadPage.tsx's bounded-concurrency and retry settings so large
// batches of final photos get the same protection against saturating the
// browser/Sanity API, and transient failures (network blips, Sanity 429s)
// don't force the photographer to manually reselect the file.
const UPLOAD_CONCURRENCY = 3;
// 1 initial attempt + up to 2 retries for transient failures.
const MAX_UPLOAD_ATTEMPTS = 3;

// Wires the uploaded asset into the album's `finalPhotos` array, server-side.
async function finalizeFinalPhoto(assetId: string, albumId: string, filename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/albums/${albumId}/final-photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, filename }),
    });
  } catch {
    // `fetch` itself rejecting (offline, DNS failure, connection dropped mid-
    // request) is just as transient as the retryable network error already
    // handled in putAssetToSanity's `xhr` 'error' listener — without this,
    // uploadWithRetry's `e?.retryable === true` check sees a plain error with
    // no `retryable` flag and treats it as permanent, forcing the photographer
    // to reselect a file whose binary already uploaded successfully.
    throw makeError('Network error while finalizing photo', { retryable: true, status: 0 });
  }
  if (!res.ok) {
    throw makeError(`Finalizing photo failed (${res.status})`, {
      retryable: isRetryableStatus(res.status),
      status: res.status,
    });
  }
}

/**
 * Final delivery section shown on a submitted/locked/delivered album: lets the
 * photographer upload the finished/edited photos and hand them off to the
 * client once ready. Mirrors the upload pattern in UploadPage.tsx (direct
 * browser → Sanity upload, then a small finalize call) and the delete/grid
 * patterns already used for the main photo grid in AlbumDetail.
 */
export function FinalPhotosSection({ albumId, status, finalPhotos, onRefresh }: FinalPhotosSectionProps) {
  const isVisible = status === 'submitted' || status === 'locked' || status === 'delivered';

  const [files, setFiles] = useState<FinalUploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [photoToDelete, setPhotoToDelete] = useState<Photo | null>(null);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoDeleteError, setPhotoDeleteError] = useState<string | null>(null);

  const [isDelivering, setIsDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [includeOriginals, setIncludeOriginals] = useState(true);
  // Delivering is final and immediately changes what the client sees, so it
  // gets the same confirm-before-destructive-action treatment as deleting a
  // final photo below, instead of firing straight off a single button tap.
  const [confirmingDeliver, setConfirmingDeliver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const credsRef = useRef<UploadCredentials | null>(null);
  // Mirrors `files` so addFiles can read the current queue synchronously
  // (to reject duplicate filenames) without depending on `files` itself,
  // which would recreate the callback on every queue change.
  const filesRef = useRef<FinalUploadFile[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  // Guards against committing state (or calling onRefresh) after this
  // section unmounts mid-upload — e.g. the admin navigates away from the
  // album detail page while a batch is still in flight. Mirrors the same
  // guard already used by UploadPage.tsx for the same reason.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
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

  // Upload a single file with automatic retry on transient failures, mirroring
  // UploadPage.tsx's uploadWithRetry: the binary goes straight to Sanity
  // (progress tracked), then a tiny finalize call wires it into the album's
  // `finalPhotos` array. The asset id is preserved across retries so a binary
  // upload that already succeeded isn't redone if only finalize failed —
  // otherwise a retry would leave an orphaned duplicate asset behind.
  const uploadWithRetry = useCallback(
    async (uploadFile: FinalUploadFile): Promise<{ ok: boolean; error?: string }> => {
      let lastError = 'Upload failed';
      let assetId: string | null = null;

      for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
        setFiles((prev) => prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: 'uploading', progress: assetId ? 100 : 0, error: undefined } : f
        ));

        try {
          const creds = await getCredentials();
          if (!assetId) {
            // XHR fires many progress events per file; only commit a state
            // update (which clones the whole files array and re-renders
            // every row) when the visible percentage actually moves,
            // matching UploadPage.tsx's throttling for the same reason.
            let lastReportedPct = -1;
            assetId = await putAssetToSanity(creds, uploadFile.file, (pct) => {
              if (pct < 100 && pct - lastReportedPct < 3) return;
              lastReportedPct = pct;
              setFiles((prev) => prev.map((f) => (f.id === uploadFile.id ? { ...f, progress: pct } : f)));
            });
          }
          await finalizeFinalPhoto(assetId, albumId, uploadFile.file.name);
          return { ok: true };
        } catch (err) {
          const e = err as RetryableError;
          lastError = e?.message || 'Upload failed';
          let canRetry = e?.retryable === true && attempt < MAX_UPLOAD_ATTEMPTS;
          // A 401 with a freshly-refreshed token is already fixed — no need to
          // wait out the normal backoff delay before the next attempt.
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
    [albumId, getCredentials],
  );

  const addFiles = useCallback((newFiles: FileList) => {
    const fileArray = Array.from(newFiles);
    // Names already queued — rejects duplicate filenames (case-insensitive),
    // matching UploadPage.tsx's dedup so a photographer can't accidentally
    // queue the same edit twice.
    const existingNames = new Set(filesRef.current.map((f) => f.file.name.toLowerCase()));
    // Names accepted within this same drop/pick batch, so a batch that
    // contains the same filename twice only keeps the first occurrence.
    const seenInBatch = new Set<string>();
    const accepted: File[] = [];
    let invalidCount = 0;
    let duplicateCount = 0;

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

    const parts: string[] = [];
    if (invalidCount > 0) {
      const maxMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));
      parts.push(`${invalidCount} file${invalidCount === 1 ? '' : 's'} skipped — unsupported format or larger than ${maxMb}MB`);
    }
    if (duplicateCount > 0) {
      parts.push(`${duplicateCount} duplicate filename${duplicateCount === 1 ? '' : 's'} skipped`);
    }
    setUploadError(parts.length > 0 ? `${parts.join('; ')}.` : null);

    const queued: FinalUploadFile[] = accepted.map((file) => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'pending',
      progress: 0,
    }));

    if (queued.length === 0) return;

    setIsUploading(true);
    setFiles((prev) => [...prev, ...queued]);
    credsRef.current = null;

    void (async () => {
      try {
        await runWithConcurrency(
          queued,
          async (uploadFile) => {
            const result = await uploadWithRetry(uploadFile);
            setFiles((prev) => prev.map((f) =>
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
          UPLOAD_CONCURRENCY,
        );
      } finally {
        if (mountedRef.current) {
          setIsUploading(false);
          await onRefresh();
        }
      }
    })();
  }, [onRefresh, uploadWithRetry]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  }, [addFiles]);

  const clearCompleted = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== 'done'));
  }, []);

  const handleDeletePhoto = useCallback(async () => {
    if (!photoToDelete) return;
    setIsDeletingPhoto(true);
    setPhotoDeleteError(null);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/final-photos`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId: photoToDelete.id }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to delete photo');
      }
      setPhotoToDelete(null);
      await onRefresh();
    } catch (err) {
      setPhotoDeleteError(err instanceof Error ? err.message : 'Failed to delete photo');
    } finally {
      setIsDeletingPhoto(false);
    }
  }, [albumId, photoToDelete, onRefresh]);

  const handleDeliver = useCallback(async () => {
    setIsDelivering(true);
    setDeliverError(null);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeOriginals }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to deliver to client');
      }
      setConfirmingDeliver(false);
      await onRefresh();
    } catch (err) {
      setDeliverError(err instanceof Error ? err.message : 'Failed to deliver to client');
    } finally {
      setIsDelivering(false);
    }
  }, [albumId, includeOriginals, onRefresh]);

  if (!isVisible) return null;

  const canDeliver = (status === 'locked' || status === 'submitted') && finalPhotos.length > 0;
  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const totalUploadBytes = files.reduce((sum, f) => sum + f.file.size, 0);
  const loadedUploadBytes = files.reduce((sum, f) => {
    if (f.status === 'done' || f.status === 'error') return sum + f.file.size;
    if (f.status === 'uploading') return sum + (f.file.size * f.progress) / 100;
    return sum;
  }, 0);
  const batchProgressPct = totalUploadBytes > 0
    ? Math.min(100, Math.max(0, (loadedUploadBytes / totalUploadBytes) * 100))
    : 0;

  return (
    <div className="final-photos-section">
      <div className="section-header photos-section-header">
        <h3 className="photos-title">Final Delivery ({finalPhotos.length})</h3>
        <div className="section-actions">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.tiff,.tif"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="selection-toggle-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading…' : 'Upload Final Photos'}
          </button>
          {canDeliver && (
            <label className="deliver-originals-toggle">
              <input
                type="checkbox"
                checked={includeOriginals}
                onChange={(e) => setIncludeOriginals(e.target.checked)}
                disabled={isDelivering}
              />
              Give client access to original photos too
            </label>
          )}
          {canDeliver && (
            <button
              type="button"
              className="lock-btn deliver-btn"
              onClick={() => { setDeliverError(null); setConfirmingDeliver(true); }}
              // Also disabled while an upload is in flight — delivering
              // mid-upload could hand off before a newly selected photo has
              // finished attaching to the album.
              disabled={isDelivering || isUploading}
            >
              {isDelivering ? 'Delivering…' : 'Deliver to Client'}
            </button>
          )}
        </div>
      </div>

      {uploadError && <p className="inline-error" role="alert">{uploadError}</p>}
      {!confirmingDeliver && deliverError && <p className="inline-error" role="alert">{deliverError}</p>}

      {files.length > 0 && (
        <div className="final-upload-list">
          <div className="final-upload-list-header">
            <span>Uploaded {doneCount} of {files.length}</span>
            {doneCount > 0 && (
              <button type="button" className="link-btn" onClick={clearCompleted}>
                Clear completed
              </button>
            )}
          </div>
          <div
            className="final-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(batchProgressPct)}
          >
            <div className="final-progress-fill" style={{ transform: `scaleX(${batchProgressPct / 100})` }} />
          </div>
          {errorCount > 0 && (
            <p className="inline-error" role="alert">{errorCount} file{errorCount === 1 ? '' : 's'} failed to upload.</p>
          )}
        </div>
      )}

      {finalPhotos.length === 0 ? (
        <div className="photos-empty">
          <p className="empty-message">No final photos uploaded yet</p>
        </div>
      ) : (
        <div className="photo-grid">
          {finalPhotos.map((photo) => (
            <div key={photo.id} className="photo-tile">
              <BlurImage
                className="photo-thumb"
                src={photo.thumbnailUrl}
                alt={photo.filename}
                lqip={photo.lqip}
                srcSet={photo.thumbnailSrcSet ?? undefined}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                draggable={false}
              />
              <button
                className="photo-delete"
                onClick={() => { setPhotoDeleteError(null); setPhotoToDelete(photo); }}
                aria-label={`Delete final photo ${photo.filename}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
              <span className="photo-name" title={photo.filename}>{photo.filename}</span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={photoToDelete !== null}
        title="Delete final photo?"
        confirmLabel="Delete Photo"
        busyLabel="Deleting…"
        isBusy={isDeletingPhoto}
        error={photoDeleteError}
        onConfirm={() => { void handleDeletePhoto(); }}
        onCancel={() => setPhotoToDelete(null)}
      >
        Remove <strong>{photoToDelete?.filename}</strong> from final delivery? This cannot be undone.
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={confirmingDeliver}
        title="Deliver to client?"
        confirmLabel="Deliver to Client"
        busyLabel="Delivering…"
        isBusy={isDelivering}
        error={deliverError}
        onConfirm={() => { void handleDeliver(); }}
        onCancel={() => setConfirmingDeliver(false)}
      >
        This immediately gives the client access to their final gallery
        {includeOriginals ? ' (including the original photos)' : ''}. This cannot be undone.
      </ConfirmDialog>

      <style>{`
        .final-photos-section {
          margin-top: var(--space-8);
        }

        .deliver-btn {
          color: var(--color-success);
        }

        .deliver-btn:hover:not(:disabled) {
          border-color: var(--color-success);
          color: var(--color-success);
        }

        .deliver-originals-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          cursor: pointer;
        }

        .deliver-originals-toggle input[type="checkbox"] {
          cursor: pointer;
        }

        .final-upload-list {
          margin-bottom: var(--space-4);
          padding: var(--space-3) var(--space-4);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          background-color: var(--color-surface);
        }

        .final-upload-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          margin-bottom: var(--space-2);
        }

        .final-progress-bar {
          position: relative;
          width: 100%;
          height: 8px;
          border-radius: var(--radius-full);
          background-color: var(--color-bg);
          overflow: hidden;
        }

        .final-progress-fill {
          position: absolute;
          inset: 0;
          transform-origin: left;
          background-color: var(--color-accent);
          border-radius: var(--radius-full);
          transition: transform var(--transition-fast);
        }

        @media (max-width: 480px) {
          .final-photos-section {
            padding-left: var(--space-4);
            padding-right: var(--space-4);
          }
        }
      `}</style>
    </div>
  );
}
