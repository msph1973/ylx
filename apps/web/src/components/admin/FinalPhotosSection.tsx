import React, { useCallback, useRef, useState } from 'react';
import { BlurImage } from '@/components/gallery/BlurImage';
import { ConfirmDialog } from './ConfirmDialog';

export interface FinalPhoto {
  id: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
  thumbnailSrcSet?: string | null;
  lqip?: string | null;
}

interface FinalPhotosSectionProps {
  albumId: string;
  status: string;
  finalPhotos: FinalPhoto[];
  /** Re-fetches the parent album so `status`/`finalPhotos` reflect the latest state. */
  onRefresh: () => void | Promise<void>;
}

interface UploadCredentials {
  projectId: string;
  dataset: string;
  apiVersion: string;
  token: string;
}

interface FinalUploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface RetryableError extends Error {
  retryable?: boolean;
  status?: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — mirrors the main upload flow.
const VALID_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif'];

function makeError(message: string, opts: { retryable: boolean; status?: number }): RetryableError {
  const err = new Error(message) as RetryableError;
  err.retryable = opts.retryable;
  err.status = opts.status;
  return err;
}

function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

// Direct-to-Sanity binary upload, same approach as UploadPage.tsx: bypasses
// Vercel's ~4.5MB serverless body limit by uploading straight to Sanity's
// asset API from the browser, with XHR so we get real progress events.
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

// Wires the uploaded asset into the album's `finalPhotos` array, server-side.
async function finalizeFinalPhoto(assetId: string, albumId: string, filename: string): Promise<void> {
  const res = await fetch(`/api/admin/albums/${albumId}/final-photos`, {
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

  const [photoToDelete, setPhotoToDelete] = useState<FinalPhoto | null>(null);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoDeleteError, setPhotoDeleteError] = useState<string | null>(null);

  const [isDelivering, setIsDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const uploadOne = useCallback(async (uploadFile: FinalUploadFile): Promise<void> => {
    setFiles((prev) => prev.map((f) => (f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0, error: undefined } : f)));
    try {
      const creds = await getCredentials();
      const assetId = await putAssetToSanity(creds, uploadFile.file, (pct) => {
        setFiles((prev) => prev.map((f) => (f.id === uploadFile.id ? { ...f, progress: pct } : f)));
      });
      await finalizeFinalPhoto(assetId, albumId, uploadFile.file.name);
      setFiles((prev) => prev.map((f) => (f.id === uploadFile.id ? { ...f, status: 'done', progress: 100 } : f)));
    } catch (err) {
      const e = err as RetryableError;
      setFiles((prev) => prev.map((f) => (f.id === uploadFile.id ? { ...f, status: 'error', error: e?.message ?? 'Upload failed' } : f)));
    }
  }, [albumId, getCredentials]);

  const addFiles = useCallback((newFiles: FileList) => {
    const fileArray = Array.from(newFiles);
    const accepted: File[] = [];
    let invalidCount = 0;

    for (const file of fileArray) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!VALID_EXTS.includes(ext || '') || file.size > MAX_FILE_SIZE) {
        invalidCount++;
        continue;
      }
      accepted.push(file);
    }

    if (invalidCount > 0) {
      const maxMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));
      setUploadError(`${invalidCount} file${invalidCount === 1 ? '' : 's'} skipped — unsupported format or larger than ${maxMb}MB.`);
    } else {
      setUploadError(null);
    }

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
        await Promise.all(queued.map((uploadFile) => uploadOne(uploadFile)));
      } finally {
        setIsUploading(false);
        await onRefresh();
      }
    })();
  }, [onRefresh, uploadOne]);

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
  }, [photoToDelete, onRefresh]);

  const handleDeliver = useCallback(async () => {
    setIsDelivering(true);
    setDeliverError(null);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/deliver`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to deliver to client');
      }
      await onRefresh();
    } catch (err) {
      setDeliverError(err instanceof Error ? err.message : 'Failed to deliver to client');
    } finally {
      setIsDelivering(false);
    }
  }, [albumId, onRefresh]);

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
            <button
              type="button"
              className="lock-btn deliver-btn"
              onClick={() => { void handleDeliver(); }}
              disabled={isDelivering}
            >
              {isDelivering ? 'Delivering…' : 'Deliver to Client'}
            </button>
          )}
        </div>
      </div>

      {uploadError && <p className="inline-error" role="alert">{uploadError}</p>}
      {deliverError && <p className="inline-error" role="alert">{deliverError}</p>}

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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
