import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { AlbumWithSelections } from '@ylx/shared';
import { formatDate } from '@ylx/shared';
import { SelectionTable } from './SelectionTable';
import { CopyFilenamesButton } from './CopyFilenamesButton';
import { AlbumFormModal } from './AlbumFormModal';
import { ConfirmDialog } from './ConfirmDialog';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { getAlbumStatusMeta } from '@/lib/albumStatus';

interface AlbumDetailProps {
  albumId: string;
  onBack: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

interface AlbumPhoto {
  id: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
  lqip?: string | null;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function AlbumDetail({ albumId, onBack, onDeleted, onUpdated }: AlbumDetailProps) {
  const shouldReduceMotion = useReducedMotion();
  const [album, setAlbum] = useState<AlbumWithSelections | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [photoToDelete, setPhotoToDelete] = useState<AlbumPhoto | null>(null);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoDeleteError, setPhotoDeleteError] = useState<string | null>(null);
  const [photoSelectionMode, setPhotoSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [isBulkPhotoConfirmOpen, setIsBulkPhotoConfirmOpen] = useState(false);
  const [isDeletingSelectedPhotos, setIsDeletingSelectedPhotos] = useState(false);
  const [bulkPhotoDeleteError, setBulkPhotoDeleteError] = useState<string | null>(null);
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const { copied: copiedLink, copy: copyLink } = useCopyToClipboard();
  const { copied: copiedPin, copy: copyPin } = useCopyToClipboard();

  const handleCopyLink = useCallback(() => {
    if (!album?.slug) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    void copyLink(`${origin}/gallery/${album.slug}`);
  }, [album?.slug, copyLink]);

  const handleCopyPin = useCallback(() => {
    if (!album?.pin) return;
    void copyPin(album.pin);
  }, [album?.pin, copyPin]);

  const fetchAlbum = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}`);
      if (!response.ok) throw new Error('Failed to fetch album');
      const data = await response.json() as { album: AlbumWithSelections };
      setAlbum(data.album);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    void fetchAlbum();
  }, [fetchAlbum]);

  useEffect(() => {
    setSelectedPhotoIds((prev) => {
      if (prev.size === 0) return prev;

      const currentIds = new Set((album?.photos ?? []).map((photo) => photo.id));
      const next = new Set([...prev].filter((photoId) => currentIds.has(photoId)));
      return next.size === prev.size ? prev : next;
    });
  }, [album?.photos]);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/unlock`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to unlock album');
      setAlbum((prev) => (prev ? { ...prev, status: 'active', isLocked: false, selections: [] } : prev));
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLock = async () => {
    setIsLocking(true);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/lock`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to lock album');
      setAlbum((prev) => (prev ? { ...prev, status: 'locked', isLocked: true } : prev));
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lock');
    } finally {
      setIsLocking(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete album');
      onDeleted?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!photoToDelete) return;
    setIsDeletingPhoto(true);
    setPhotoDeleteError(null);
    try {
      const response = await fetch(`/api/admin/photos/${photoToDelete.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to delete photo');
      }
      setPhotoToDelete(null);
      await fetchAlbum();
      onUpdated?.();
    } catch (err) {
      setPhotoDeleteError(err instanceof Error ? err.message : 'Failed to delete photo');
    } finally {
      setIsDeletingPhoto(false);
    }
  };

  const selectedPhotoCount = selectedPhotoIds.size;
  const photos = (album?.photos ?? []) as AlbumPhoto[];
  const allPhotosSelected = photos.length > 0 && photos.every((photo) => selectedPhotoIds.has(photo.id));

  const exitPhotoSelectionMode = useCallback(() => {
    setPhotoSelectionMode(false);
    setSelectedPhotoIds(new Set());
    setBulkPhotoDeleteError(null);
  }, []);

  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);

  const toggleSelectAllPhotos = useCallback(() => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      const everySelected = photos.every((photo) => next.has(photo.id));
      for (const photo of photos) {
        if (everySelected) {
          next.delete(photo.id);
        } else {
          next.add(photo.id);
        }
      }
      return next;
    });
  }, [photos]);

  const applyPhotoOrder = useCallback(async (nextPhotos: AlbumPhoto[]) => {
    if (!album || nextPhotos.length < 2) {
      return;
    }

    const previousPhotos = photos;
    setReorderError(null);
    setAlbum((prev) => (prev ? { ...prev, photos: nextPhotos } : prev));
    setIsSavingOrder(true);

    try {
      const response = await fetch(`/api/admin/albums/${albumId}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: nextPhotos.map((photo) => photo.id) }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to save photo order');
      }

      await fetchAlbum();
      onUpdated?.();
    } catch (err) {
      setAlbum((prev) => (prev ? { ...prev, photos: previousPhotos } : prev));
      setReorderError(err instanceof Error ? err.message : 'Failed to save photo order');
    } finally {
      setDraggedPhotoId(null);
      setIsSavingOrder(false);
    }
  }, [album, albumId, fetchAlbum, onUpdated, photos]);

  const movePhotoByOffset = useCallback((photoId: string, offset: -1 | 1) => {
    const currentIndex = photos.findIndex((photo) => photo.id === photoId);
    const nextIndex = currentIndex + offset;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= photos.length) {
      return;
    }

    void applyPhotoOrder(moveItem(photos, currentIndex, nextIndex));
  }, [applyPhotoOrder, photos]);

  const handlePhotoDrop = useCallback((targetPhotoId: string) => {
    if (!draggedPhotoId || draggedPhotoId === targetPhotoId) {
      setDraggedPhotoId(null);
      return;
    }

    const fromIndex = photos.findIndex((photo) => photo.id === draggedPhotoId);
    const toIndex = photos.findIndex((photo) => photo.id === targetPhotoId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedPhotoId(null);
      return;
    }

    void applyPhotoOrder(moveItem(photos, fromIndex, toIndex));
  }, [applyPhotoOrder, draggedPhotoId, photos]);

  const handleDeleteSelectedPhotos = useCallback(async () => {
    if (!album || selectedPhotoCount === 0) {
      return;
    }

    setIsDeletingSelectedPhotos(true);
    setBulkPhotoDeleteError(null);

    try {
      const response = await fetch('/api/admin/photos/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId: album.id, photoIds: [...selectedPhotoIds] }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to delete selected photos');
      }

      setIsBulkPhotoConfirmOpen(false);
      exitPhotoSelectionMode();
      await fetchAlbum();
      onUpdated?.();
    } catch (err) {
      setBulkPhotoDeleteError(err instanceof Error ? err.message : 'Failed to delete selected photos');
    } finally {
      setIsDeletingSelectedPhotos(false);
    }
  }, [album, exitPhotoSelectionMode, fetchAlbum, onUpdated, selectedPhotoCount, selectedPhotoIds]);

  const handleEditSuccess = useCallback(() => {
    void fetchAlbum();
    onUpdated?.();
  }, [fetchAlbum, onUpdated]);

  if (isLoading) {
    return (
      <div className="state-container">
        <div className="spinner" role="status"><span className="sr-only">Loading album details</span></div>
        <p>Loading album...</p>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="state-container">
        <p className="error-message" role="alert">{error || 'Album not found'}</p>
        <button className="retry-btn" onClick={() => { void fetchAlbum(); }}>Try Again</button>
      </div>
    );
  }

  const status = getAlbumStatusMeta(album.status);
  const isActive = album.status === 'active';
  const selectedFilenames = album.selections.map((s) => s.photo.filename);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="album-detail"
        className="album-detail"
        initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: shouldReduceMotion ? 0 : -24 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, duration: shouldReduceMotion ? 0 : undefined }}
      >
        <div className="detail-nav">
          <button className="back-btn" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span className="back-label">Back to Albums</span>
          </button>
          <div className="detail-nav-actions">
            <button className="btn-edit" onClick={() => setIsEditModalOpen(true)} aria-label="Edit album">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="btn-label">Edit</span>
            </button>
            <button className="btn-delete" onClick={() => { setDeleteError(null); setIsDeleteConfirmOpen(true); }} aria-label="Delete album">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              <span className="btn-label">Delete</span>
            </button>
          </div>
        </div>

        <div className="album-header">
          <h2 className="album-title">{album.clientName}</h2>
          <span className={`status-badge status-badge--${status.variant}`}>{status.label}</span>
        </div>
        <p className="status-hint">{status.hint}</p>

        <div className="metadata-grid">
          <div className="metadata-item">
            <span className="metadata-label">Event Date</span>
            <span className="metadata-value">{album.eventDate ? formatDate(album.eventDate) : '—'}</span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">Status</span>
            <span className="metadata-value">{status.label}</span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">PIN</span>
            <span className="metadata-value pin">{album.pin}</span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">Max Selections</span>
            <span className="metadata-value">{album.maxSelections}</span>
          </div>
        </div>

        <div className="share-actions">
          <button className="share-btn" onClick={() => { void handleCopyLink(); }} disabled={!album.slug} aria-label="Copy gallery link to clipboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {copiedLink ? 'Copied!' : 'Copy Gallery Link'}
          </button>
          <button className="share-btn" onClick={() => { void handleCopyPin(); }} disabled={!album.pin} aria-label="Copy PIN to clipboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="11" width="6" height="11" rx="1" />
              <path d="M9 11V7a3 3 0 0 1 6 0v4" />
            </svg>
            {copiedPin ? 'Copied!' : 'Copy PIN'}
          </button>

          {isActive ? (
            <button className="lock-btn" onClick={handleLock} disabled={isLocking}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {isLocking ? 'Locking…' : 'Lock Gallery'}
            </button>
          ) : (
            <button className="unlock-btn" onClick={handleUnlock} disabled={isUnlocking}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
              {isUnlocking ? 'Unlocking…' : 'Unlock Gallery'}
            </button>
          )}
        </div>

        <div className="section-header">
          <h3 className="section-title">Selected Photos ({album.selections.length})</h3>
          <div className="section-actions">
            <CopyFilenamesButton filenames={selectedFilenames} />
          </div>
        </div>

        <SelectionTable selections={album.selections} />

        <div className="section-header photos-section-header">
          <h3 className="photos-title">All Photos ({photos.length})</h3>
          <div className="section-actions photo-section-actions">
            <button
              type="button"
              className={`selection-toggle-btn${photoSelectionMode ? ' is-active' : ''}`}
              onClick={() => {
                if (photoSelectionMode) {
                  exitPhotoSelectionMode();
                } else {
                  setPhotoSelectionMode(true);
                  setBulkPhotoDeleteError(null);
                }
              }}
              aria-pressed={photoSelectionMode}
            >
              {photoSelectionMode ? 'Done selecting' : 'Select photos'}
            </button>
            {isSavingOrder && <span className="reorder-status">Saving order…</span>}
          </div>
        </div>

        {reorderError && (
          <p className="inline-error" role="alert">{reorderError}</p>
        )}

        {photoSelectionMode && photos.length > 0 && (
          <div className="selection-bar photo-selection-bar">
            <div className="selection-info">
              <button type="button" className="link-btn" onClick={toggleSelectAllPhotos}>
                {allPhotosSelected ? 'Clear all' : 'Select all'}
              </button>
              <span className="selection-count">{selectedPhotoCount} selected</span>
            </div>
            <button
              type="button"
              className="bulk-delete-btn"
              onClick={() => setIsBulkPhotoConfirmOpen(true)}
              disabled={selectedPhotoCount === 0}
            >
              Delete {selectedPhotoCount || ''} photo{selectedPhotoCount === 1 ? '' : 's'}
            </button>
          </div>
        )}

        {photos.length === 0 ? (
          <div className="photos-empty">
            <p className="empty-message">No photos uploaded yet</p>
            <a className="upload-link" href="/admin/upload">Go to upload</a>
          </div>
        ) : (
          <div className="photo-grid">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className={`photo-tile${selectedPhotoIds.has(photo.id) ? ' is-selected' : ''}`}
                draggable={!photoSelectionMode && photos.length > 1}
                onDragStart={(event) => {
                  if (photoSelectionMode || photos.length < 2) {
                    event.preventDefault();
                    return;
                  }
                  setDraggedPhotoId(photo.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => {
                  if (!photoSelectionMode && draggedPhotoId) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handlePhotoDrop(photo.id);
                }}
                onDragEnd={() => setDraggedPhotoId(null)}
              >
                {photoSelectionMode && (
                  <button
                    type="button"
                    className={`photo-select-toggle${selectedPhotoIds.has(photo.id) ? ' checked' : ''}`}
                    onClick={() => togglePhotoSelection(photo.id)}
                    aria-pressed={selectedPhotoIds.has(photo.id)}
                    aria-label={`${selectedPhotoIds.has(photo.id) ? 'Deselect' : 'Select'} photo ${photo.filename}`}
                  >
                    {selectedPhotoIds.has(photo.id) ? 'Selected' : 'Select'}
                  </button>
                )}
                <img
                  className="photo-thumb"
                  src={photo.thumbnailUrl}
                  alt={photo.filename}
                  loading="lazy"
                  draggable={false}
                />
                {!photoSelectionMode && (
                  <button
                    className="photo-delete"
                    onClick={() => { setPhotoDeleteError(null); setPhotoToDelete(photo); }}
                    aria-label={`Delete photo ${photo.filename}`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                )}
                <div className="photo-actions" aria-label={`Reorder controls for ${photo.filename}`}>
                  <button
                    type="button"
                    className="photo-move-btn"
                    onClick={() => movePhotoByOffset(photo.id, -1)}
                    disabled={index === 0 || isSavingOrder}
                    aria-label={`Move ${photo.filename} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="photo-move-btn"
                    onClick={() => movePhotoByOffset(photo.id, 1)}
                    disabled={index === photos.length - 1 || isSavingOrder}
                    aria-label={`Move ${photo.filename} later`}
                  >
                    ↓
                  </button>
                </div>
                <span className="photo-name" title={photo.filename}>{photo.filename}</span>
              </div>
            ))}
          </div>
        )}

        <AlbumFormModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={handleEditSuccess}
          album={{
            id: album.id,
            title: album.title ?? album.clientName,
            clientName: album.clientName,
            eventDate: album.eventDate ?? '',
            status: album.status ?? (album.isLocked ? 'locked' : 'active'),
            photoCount: photos.length,
            pin: album.pin,
            maxSelections: album.maxSelections,
          }}
        />

        <ConfirmDialog
          isOpen={isDeleteConfirmOpen}
          title="Delete album?"
          confirmLabel="Delete Album"
          busyLabel="Deleting…"
          isBusy={isDeleting}
          error={deleteError}
          onConfirm={() => { void handleDelete(); }}
          onCancel={() => setIsDeleteConfirmOpen(false)}
        >
          This permanently deletes <strong>{album.title ?? album.clientName}</strong>, its photos,
          and all client selections. This action cannot be undone.
        </ConfirmDialog>

        <ConfirmDialog
          isOpen={photoToDelete !== null}
          title="Delete photo?"
          confirmLabel="Delete Photo"
          busyLabel="Deleting…"
          isBusy={isDeletingPhoto}
          error={photoDeleteError}
          onConfirm={() => { void handleDeletePhoto(); }}
          onCancel={() => setPhotoToDelete(null)}
        >
          Remove <strong>{photoToDelete?.filename}</strong> from this album? If a client already
          selected it, that selection is removed too. This cannot be undone.
        </ConfirmDialog>

        <ConfirmDialog
          isOpen={isBulkPhotoConfirmOpen}
          title={`Delete ${selectedPhotoCount} photo${selectedPhotoCount === 1 ? '' : 's'}?`}
          confirmLabel={`Delete ${selectedPhotoCount} photo${selectedPhotoCount === 1 ? '' : 's'}`}
          busyLabel="Deleting…"
          isBusy={isDeletingSelectedPhotos}
          error={bulkPhotoDeleteError}
          onConfirm={() => { void handleDeleteSelectedPhotos(); }}
          onCancel={() => setIsBulkPhotoConfirmOpen(false)}
        >
          Remove {selectedPhotoCount} selected photo{selectedPhotoCount === 1 ? '' : 's'} from this album? Any existing client selections for those photos are removed too.
        </ConfirmDialog>

        <style>{`
          .album-detail { padding: var(--space-4); }

          .inline-error {
            margin: 0 0 var(--space-4);
            padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-md);
            border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
            background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
            color: var(--color-error);
            font-size: var(--text-sm);
          }

          .detail-nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-3);
            margin-bottom: var(--space-6);
          }

          .detail-nav-actions { display: flex; align-items: center; gap: var(--space-2); }

          .back-btn, .btn-edit, .btn-delete {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            min-height: 44px;
            padding: var(--space-2) var(--space-4);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            color: var(--color-text-muted);
            font-size: var(--text-sm);
            transition: all var(--transition-fast);
            cursor: pointer;
          }

          .btn-edit, .btn-delete { padding: var(--space-2) var(--space-3); }

          .back-btn:hover, .btn-edit:hover { border-color: var(--color-accent); color: var(--color-accent); }
          .btn-delete:hover { border-color: var(--color-error); color: var(--color-error); }

          .album-header {
            display: flex;
            align-items: center;
            gap: var(--space-4);
            margin-bottom: var(--space-2);
          }

          .album-title {
            font-size: var(--text-2xl);
            font-weight: var(--font-semibold);
            color: var(--color-text);
            margin: 0;
          }

          .status-hint {
            font-size: var(--text-sm);
            color: var(--color-text-muted);
            margin: 0 0 var(--space-6);
          }

          .status-badge {
            flex-shrink: 0;
            padding: var(--space-1) var(--space-3);
            border-radius: var(--radius-full);
            font-size: var(--text-xs);
            font-weight: var(--font-medium);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .status-badge--active { background-color: color-mix(in srgb, var(--color-success) 15%, transparent); color: var(--color-success); }
          .status-badge--submitted { background-color: color-mix(in srgb, var(--color-accent) 18%, transparent); color: var(--color-accent); }
          .status-badge--locked { background-color: color-mix(in srgb, var(--color-error) 15%, transparent); color: var(--color-error); }

          .metadata-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: var(--space-4);
            padding: var(--space-5);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            margin-bottom: var(--space-4);
          }

          @media (min-width: 640px) {
            .metadata-grid { grid-template-columns: repeat(4, 1fr); }
          }

          .metadata-item { display: flex; flex-direction: column; gap: var(--space-1); }
          .metadata-label { font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
          .metadata-value { font-size: var(--text-base); font-weight: var(--font-medium); color: var(--color-text); }
          .metadata-value.pin { font-family: var(--font-mono, monospace); letter-spacing: 0.1em; }

          .share-actions {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-3);
            margin-bottom: var(--space-8);
          }

          .share-btn, .lock-btn, .unlock-btn {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            min-height: 44px;
            padding: var(--space-2) var(--space-4);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            color: var(--color-text-muted);
            font-size: var(--text-sm);
            font-weight: var(--font-medium);
            transition: all var(--transition-fast);
            cursor: pointer;
          }

          .share-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
          .share-btn:disabled { opacity: 0.4; cursor: not-allowed; }

          .lock-btn { color: var(--color-text); }
          .lock-btn:hover:not(:disabled) { border-color: var(--color-error); color: var(--color-error); }
          .unlock-btn { color: var(--color-text); }
          .unlock-btn:hover:not(:disabled) { border-color: var(--color-success); color: var(--color-success); }
          .lock-btn:disabled, .unlock-btn:disabled { opacity: 0.5; cursor: not-allowed; }

          .section-header {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-4);
            margin-bottom: var(--space-4);
          }

          .photos-section-header { margin-top: var(--space-8); }

          .section-title, .photos-title { font-size: var(--text-lg); font-weight: var(--font-medium); color: var(--color-text); margin: 0; }
          .section-actions { display: flex; align-items: center; gap: var(--space-3); }

          .selection-toggle-btn,
          .bulk-delete-btn,
          .photo-select-toggle,
          .photo-move-btn,
          .link-btn {
            min-height: 44px;
          }

          .selection-toggle-btn,
          .bulk-delete-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-2-5) var(--space-4);
            border-radius: var(--radius-md);
            border: 1px solid var(--color-border);
            background-color: var(--color-surface);
            color: var(--color-text);
            font-size: var(--text-sm);
            font-weight: var(--font-medium);
            cursor: pointer;
            transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
          }

          .selection-toggle-btn:hover:not(:disabled),
          .selection-toggle-btn.is-active {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }

          .bulk-delete-btn {
            border-color: color-mix(in srgb, var(--color-error) 45%, var(--color-border));
            color: var(--color-error);
          }

          .bulk-delete-btn:hover:not(:disabled) {
            border-color: var(--color-error);
            background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
          }

          .bulk-delete-btn:disabled,
          .selection-toggle-btn:disabled,
          .photo-move-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .reorder-status,
          .selection-count {
            font-size: var(--text-sm);
            color: var(--color-text-muted);
            font-variant-numeric: tabular-nums;
          }

          .selection-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: var(--space-3);
            padding: var(--space-3) var(--space-4);
            margin-bottom: var(--space-4);
            border-radius: var(--radius-lg);
            border: 1px solid var(--color-border);
            background-color: var(--color-surface);
          }

          .selection-info {
            display: flex;
            align-items: center;
            gap: var(--space-4);
            flex-wrap: wrap;
          }

          .link-btn {
            background: none;
            border: none;
            padding: 0;
            color: var(--color-accent);
            font-size: var(--text-sm);
            font-weight: var(--font-medium);
            cursor: pointer;
          }

          .link-btn:hover:not(:disabled) {
            text-decoration: underline;
          }

          .photos-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-10) var(--space-4);
            border: 1px dashed var(--color-border);
            border-radius: var(--radius-lg);
            text-align: center;
          }
          .photos-empty .empty-message { color: var(--color-text-muted); font-size: var(--text-sm); }
          .upload-link { font-size: var(--text-sm); font-weight: var(--font-medium); }

          .photo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
            gap: var(--space-3);
          }

          @media (min-width: 640px) {
            .photo-grid { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); }
          }

          .photo-tile {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: var(--space-1);
            padding: var(--space-2);
            border: 1px solid transparent;
            border-radius: var(--radius-lg);
            background-color: var(--color-surface);
            transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
          }

          .photo-tile.is-selected {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 18%, transparent);
          }

          .photo-thumb {
            width: 100%;
            aspect-ratio: 1 / 1;
            object-fit: cover;
            border-radius: var(--radius-md);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            display: block;
          }

          .photo-delete {
            position: absolute;
            top: var(--space-2);
            right: var(--space-2);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            border: none;
            border-radius: var(--radius-md);
            background-color: color-mix(in srgb, var(--color-bg) 78%, transparent);
            backdrop-filter: blur(4px);
            color: var(--color-text);
            cursor: pointer;
            opacity: 0;
            transition: opacity var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
          }

          .photo-select-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-2) var(--space-3);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            background-color: var(--color-bg);
            color: var(--color-text);
            font-size: var(--text-sm);
            font-weight: var(--font-medium);
            cursor: pointer;
          }

          .photo-select-toggle.checked {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }

          .photo-actions {
            display: flex;
            gap: var(--space-2);
          }

          .photo-move-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 1;
            padding: var(--space-2);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            background-color: var(--color-bg);
            color: var(--color-text);
            cursor: pointer;
          }

          .photo-move-btn:hover:not(:disabled) {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }

          .photo-tile:hover .photo-delete,
          .photo-delete:focus-visible {
            opacity: 1;
          }

          .photo-delete:hover, .photo-delete:focus-visible {
            background-color: var(--color-error);
            color: var(--color-bg);
            outline: none;
          }

          /* Touch devices can't hover — keep the control always visible. */
          @media (hover: none) {
            .photo-delete { opacity: 1; }
          }

          .photo-name {
            font-size: var(--text-xs);
            color: var(--color-text-muted);
            font-family: var(--font-mono, monospace);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          @media (max-width: 640px) {
            .detail-nav .back-label { display: inline; }
            .btn-edit .btn-label, .btn-delete .btn-label { display: none; }
          }

          @media (max-width: 480px) {
            .album-detail {
              padding-left: 0;
              padding-right: 0;
            }

            .detail-nav,
            .album-header,
            .metadata-grid,
            .share-actions,
            .section-header,
            .selection-bar,
            .inline-error {
              margin-left: var(--space-4);
              margin-right: var(--space-4);
            }

            .detail-nav,
            .album-header,
            .section-header,
            .photo-section-actions,
            .selection-bar,
            .selection-info {
              flex-direction: column;
              align-items: stretch;
            }

            .detail-nav-actions,
            .share-actions,
            .section-actions,
            .photo-actions {
              width: 100%;
            }

            .detail-nav-actions,
            .section-actions,
            .photo-actions {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: var(--space-2);
            }

            .share-actions {
              display: grid;
              grid-template-columns: 1fr;
            }

            .share-btn,
            .lock-btn,
            .unlock-btn,
            .selection-toggle-btn,
            .bulk-delete-btn,
            .back-btn {
              width: 100%;
              justify-content: center;
            }

            .metadata-grid {
              grid-template-columns: 1fr;
            }

            /* Mobile-first: keep a compact multi-column thumbnail grid on phones
               instead of collapsing to a single full-width column (which forced
               endless scrolling to manage an album). ~96px tiles give ~3 columns
               on a typical phone while the base grid handles larger screens. */
            .photo-grid {
              grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
              padding-left: var(--space-4);
              padding-right: var(--space-4);
            }
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}
