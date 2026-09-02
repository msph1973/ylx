import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { AlbumWithSelections, Photo } from '@ylx/shared';
import { DRIVE_STORAGE, formatDate } from '@ylx/shared';
import { SelectionTable } from './SelectionTable';
import { CopyFilenamesButton } from './CopyFilenamesButton';
import { AlbumFormModal } from './AlbumFormModal';
import { ConfirmDialog } from './ConfirmDialog';
import { BlurImage } from '@/components/gallery/BlurImage';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { getAlbumStatusMeta, type AlbumStatusVariant } from '@/lib/albumStatus';
import { FinalPhotosSection } from './FinalPhotosSection';

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
  thumbnailSrcSet?: string | null;
  lqip?: string | null;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

interface PhotoTileProps {
  photo: AlbumPhoto;
  index: number;
  totalCount: number;
  isSelected: boolean;
  isDragged: boolean;
  isDragOver: boolean;
  selectionMode: boolean;
  reorderMode: boolean;
  isSavingOrder: boolean;
  onTileDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onTileDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onTileDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onTileDragEnd: (event: React.DragEvent<HTMLDivElement>) => void;
  onSelectToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDragHandlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMoveUp: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMoveDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

// A drag/hover only touches draggedPhotoId/dragOverPhotoId on the parent, so
// this tile is memoized to make sure that state change re-renders just the
// tiles whose own props actually changed instead of the whole photo grid.
function arePhotoTilePropsEqual(prev: PhotoTileProps, next: PhotoTileProps): boolean {
  return (
    prev.photo === next.photo &&
    prev.photo.id === next.photo.id &&
    prev.index === next.index &&
    prev.totalCount === next.totalCount &&
    prev.isSelected === next.isSelected &&
    prev.isDragged === next.isDragged &&
    prev.isDragOver === next.isDragOver &&
    prev.selectionMode === next.selectionMode &&
    prev.reorderMode === next.reorderMode &&
    prev.isSavingOrder === next.isSavingOrder &&
    prev.onTileDragStart === next.onTileDragStart &&
    prev.onTileDragOver === next.onTileDragOver &&
    prev.onTileDrop === next.onTileDrop &&
    prev.onTileDragEnd === next.onTileDragEnd &&
    prev.onSelectToggle === next.onSelectToggle &&
    prev.onDeleteClick === next.onDeleteClick &&
    prev.onDragHandlePointerDown === next.onDragHandlePointerDown &&
    prev.onDragHandlePointerMove === next.onDragHandlePointerMove &&
    prev.onDragHandlePointerUp === next.onDragHandlePointerUp &&
    prev.onDragHandlePointerCancel === next.onDragHandlePointerCancel &&
    prev.onMoveUp === next.onMoveUp &&
    prev.onMoveDown === next.onMoveDown
  );
}

const PhotoTile = React.memo(function PhotoTile({
  photo,
  index,
  totalCount,
  isSelected,
  isDragged,
  isDragOver,
  selectionMode,
  reorderMode,
  isSavingOrder,
  onTileDragStart,
  onTileDragOver,
  onTileDrop,
  onTileDragEnd,
  onSelectToggle,
  onDeleteClick,
  onDragHandlePointerDown,
  onDragHandlePointerMove,
  onDragHandlePointerUp,
  onDragHandlePointerCancel,
  onMoveUp,
  onMoveDown,
}: PhotoTileProps) {
  return (
    <div
      data-photo-id={photo.id}
      className={`photo-tile${isSelected ? ' is-selected' : ''}${isDragged ? ' is-dragging' : ''}${isDragOver ? ' is-drag-over' : ''}`}
      draggable={reorderMode && totalCount > 1 && !isSavingOrder}
      onDragStart={onTileDragStart}
      onDragOver={onTileDragOver}
      onDrop={onTileDrop}
      onDragEnd={onTileDragEnd}
    >
      {selectionMode && (
        <button
          type="button"
          data-photo-id={photo.id}
          className={`photo-select-toggle${isSelected ? ' checked' : ''}`}
          onClick={onSelectToggle}
          aria-pressed={isSelected}
          aria-label={`${isSelected ? 'Deselect' : 'Select'} photo ${photo.filename}`}
        >
          {isSelected ? 'Selected' : 'Select'}
        </button>
      )}
      <BlurImage
        className="photo-thumb"
        src={photo.thumbnailUrl}
        alt={photo.filename}
        lqip={photo.lqip}
        srcSet={photo.thumbnailSrcSet ?? undefined}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
        draggable={false}
      />
      {!selectionMode && !reorderMode && (
        <button
          className="photo-delete"
          data-photo-id={photo.id}
          onClick={onDeleteClick}
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
      {reorderMode && (
        <div className="photo-actions" aria-label={`Reorder controls for ${photo.filename}`}>
          <button
            type="button"
            data-photo-id={photo.id}
            className="photo-move-btn photo-drag-handle"
            onPointerDown={onDragHandlePointerDown}
            onPointerMove={onDragHandlePointerMove}
            onPointerUp={onDragHandlePointerUp}
            onPointerCancel={onDragHandlePointerCancel}
            disabled={isSavingOrder}
            aria-label={`Drag ${photo.filename} to reorder`}
          >
            ⠿
          </button>
          <button
            type="button"
            data-photo-id={photo.id}
            className="photo-move-btn"
            onClick={onMoveUp}
            disabled={index === 0 || isSavingOrder}
            aria-label={`Move ${photo.filename} earlier`}
          >
            ↑
          </button>
          <button
            type="button"
            data-photo-id={photo.id}
            className="photo-move-btn"
            onClick={onMoveDown}
            disabled={index === totalCount - 1 || isSavingOrder}
            aria-label={`Move ${photo.filename} later`}
          >
            ↓
          </button>
        </div>
      )}
      <span className="photo-name" title={photo.filename}>{photo.filename}</span>
    </div>
  );
}, arePhotoTilePropsEqual);
PhotoTile.displayName = 'PhotoTile';

export function AlbumDetail({ albumId, onBack, onDeleted, onUpdated }: AlbumDetailProps) {
  const shouldReduceMotion = useReducedMotion();
  const [album, setAlbum] = useState<AlbumWithSelections | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [pinRevealed, setPinRevealed] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDriveWarningDismissed, setIsDriveWarningDismissed] = useState(false);

  const [photoToDelete, setPhotoToDelete] = useState<AlbumPhoto | null>(null);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [photoDeleteError, setPhotoDeleteError] = useState<string | null>(null);
  const [photoSelectionMode, setPhotoSelectionMode] = useState(false);
  const [photoReorderMode, setPhotoReorderMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [isBulkPhotoConfirmOpen, setIsBulkPhotoConfirmOpen] = useState(false);
  const [isDeletingSelectedPhotos, setIsDeletingSelectedPhotos] = useState(false);
  const [bulkPhotoDeleteError, setBulkPhotoDeleteError] = useState<string | null>(null);
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [dragOverPhotoId, setDragOverPhotoId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const { copied: copiedLink, error: copyLinkError, copy: copyLink } = useCopyToClipboard();
  const { copied: copiedPin, error: copyPinError, copy: copyPin } = useCopyToClipboard();

  const handleCopyLink = useCallback(() => {
    const preferredSlug = album?.customSlug || album?.slug;
    if (!preferredSlug) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    void copyLink(`${origin}/gallery/${preferredSlug}`);
  }, [album?.customSlug, album?.slug, copyLink]);

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
    setPinRevealed(false);
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
      // Unlock only reopens the gallery — the client's previous selections
      // are left intact server-side now, so refetch instead of assuming
      // `selections: []` (that used to be true when unlock deleted them).
      await fetchAlbum();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Reset is the deliberate, destructive counterpart to unlock above: it
  // actually wipes the client's selections (e.g. the client asked to start
  // over), unlike a plain unlock which now preserves them for revision.
  const handleReset = async () => {
    setIsResetting(true);
    setResetError(null);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/reset`, { method: 'POST' });
      if (!response.ok) {
        // Surfaces reset.ts's specific rejection reason (e.g. "Cannot reset
        // a delivered album") instead of a generic message.
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to reset album');
      }
      setAlbum((prev) => (prev ? { ...prev, status: 'active', isLocked: false, selections: [] } : prev));
      setIsResetConfirmOpen(false);
      onUpdated?.();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setIsResetting(false);
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
  const finalPhotos = (album?.finalPhotos ?? []) as Photo[];
  // Drive-storage albums hide upload/final-delivery affordances — their
  // photo binaries never enter Sanity.
  const isDriveAlbum = album?.storageType === DRIVE_STORAGE;
  const allPhotosSelected = photos.length > 0 && photos.every((photo) => selectedPhotoIds.has(photo.id));

  const exitPhotoSelectionMode = useCallback(() => {
    setPhotoSelectionMode(false);
    setSelectedPhotoIds(new Set());
    setBulkPhotoDeleteError(null);
  }, []);

  const togglePhotoReorderMode = useCallback(() => {
    setPhotoReorderMode((prev) => !prev);
    if (photoReorderMode) {
      setReorderError(null);
    } else {
      exitPhotoSelectionMode();
    }
  }, [exitPhotoSelectionMode, photoReorderMode]);

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

      // No refetch here: the optimistic update above already shows the new
      // order, and fetchAlbum() flips isLoading which replaces the whole
      // album view with a full-page spinner on every single move.
      onUpdated?.();
    } catch (err) {
      setAlbum((prev) => (prev ? { ...prev, photos: previousPhotos } : prev));
      setReorderError(err instanceof Error ? err.message : 'Failed to save photo order');
    } finally {
      setDraggedPhotoId(null);
      setIsSavingOrder(false);
    }
  }, [album, albumId, onUpdated, photos]);

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

  // Touch-friendly drag via the per-tile handle: HTML5 drag events never fire
  // on touchscreens, so the handle uses Pointer Events + elementFromPoint to
  // hit-test which tile is under the finger. Works for mouse too.
  // Stable across all tiles (reads the id off the event target) so a
  // pointerdown on one tile's handle doesn't force every tile to re-render.
  const handleDragHandlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const photoId = event.currentTarget.dataset.photoId;
    if (!photoId || !photoReorderMode || photos.length < 2 || isSavingOrder) return;
    // Prevents native HTML5 drag/scroll from hijacking the gesture.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedPhotoId(photoId);
  }, [photoReorderMode, photos.length, isSavingOrder]);

  const handleDragHandleMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggedPhotoId) return;
    const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-photo-id]');
    const overId = tile?.dataset.photoId ?? null;
    setDragOverPhotoId(overId !== draggedPhotoId ? overId : null);
  }, [draggedPhotoId]);

  const handleDragHandleUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (draggedPhotoId) {
      // Hit-test the release coordinates directly — dragOverPhotoId can lag a
      // render behind the finger on a fast drop.
      const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-photo-id]');
      const targetId = tile?.dataset.photoId;
      if (targetId && targetId !== draggedPhotoId) {
        handlePhotoDrop(targetId);
      } else {
        setDraggedPhotoId(null);
      }
    }
    setDragOverPhotoId(null);
  }, [draggedPhotoId, handlePhotoDrop]);

  const handleDragHandleCancel = useCallback(() => {
    setDraggedPhotoId(null);
    setDragOverPhotoId(null);
  }, []);

  // Stable, tile-agnostic drag handlers for the grid below: each reads the
  // photo id off event.currentTarget.dataset.photoId instead of closing over
  // a specific photo, so their identity doesn't change per-tile per-render.
  const handleTileDragStart = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const photoId = event.currentTarget.dataset.photoId;
    if (!photoId || !photoReorderMode || photos.length < 2 || isSavingOrder) {
      event.preventDefault();
      return;
    }
    setDraggedPhotoId(photoId);
    event.dataTransfer.effectAllowed = 'move';
  }, [photoReorderMode, photos.length, isSavingOrder]);

  const handleTileDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (photoReorderMode && draggedPhotoId) {
      const photoId = event.currentTarget.dataset.photoId;
      if (!photoId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverPhotoId(photoId !== draggedPhotoId ? photoId : null);
    }
  }, [photoReorderMode, draggedPhotoId]);

  const handleTileDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOverPhotoId(null);
    const photoId = event.currentTarget.dataset.photoId;
    if (photoId) handlePhotoDrop(photoId);
  }, [handlePhotoDrop]);

  const handleTileDragEnd = useCallback(() => {
    setDraggedPhotoId(null);
    setDragOverPhotoId(null);
  }, []);

  const handleSelectToggleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const photoId = event.currentTarget.dataset.photoId;
    if (photoId) togglePhotoSelection(photoId);
  }, [togglePhotoSelection]);

  const handlePhotoDeleteClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const photoId = event.currentTarget.dataset.photoId;
    const target = photos.find((photo) => photo.id === photoId);
    if (target) {
      setPhotoDeleteError(null);
      setPhotoToDelete(target);
    }
  }, [photos]);

  const handleMoveUpClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const photoId = event.currentTarget.dataset.photoId;
    if (photoId) movePhotoByOffset(photoId, -1);
  }, [movePhotoByOffset]);

  const handleMoveDownClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const photoId = event.currentTarget.dataset.photoId;
    if (photoId) movePhotoByOffset(photoId, 1);
  }, [movePhotoByOffset]);

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

        <div className="detail-body">
          <div className="album-header">
            <h2 className="album-title">{album.clientName}</h2>
            <span className={`status-badge status-badge--${status.variant}`}>{status.label}</span>
          </div>
          <p className="status-hint">{status.hint}</p>

          {isDriveAlbum && !isDriveWarningDismissed && (
            <div className="drive-storage-warning" role="alert">
              <div>
                <strong>Google Drive storage active</strong>
                <p>
                  Photos stay in Google Drive. Final delivery and ZIP download are unavailable for this album;
                  clients receive direct per-photo Drive links. The Drive folder must remain shared for thumbnails to work.
                </p>
              </div>
              <button
                type="button"
                className="drive-storage-warning-dismiss"
                onClick={() => setIsDriveWarningDismissed(true)}
                aria-label="Dismiss Google Drive storage warning"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="share-actions">
            <button className="share-btn" onClick={() => { void handleCopyLink(); }} disabled={!album.slug} aria-label="Copy gallery link to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {copiedLink ? 'Copied!' : copyLinkError ? 'Copy failed' : (
                <>
                  <span className="share-btn-label--long">Copy Gallery Link</span>
                  <span className="share-btn-label--short">Copy Link</span>
                </>
              )}
            </button>
            <button className="share-btn" onClick={() => { void handleCopyPin(); }} disabled={!album.pin} aria-label="Copy PIN to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <rect x="9" y="11" width="6" height="11" rx="1" />
                <path d="M9 11V7a3 3 0 0 1 6 0v4" />
              </svg>
              {copiedPin ? 'Copied!' : copyPinError ? 'Copy failed' : 'Copy PIN'}
            </button>

            {isActive ? (
              <button className="lock-btn" onClick={handleLock} disabled={isLocking} aria-busy={isLocking}>
                {isLocking ? (
                  <span className="btn-spinner" aria-hidden="true" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {isLocking ? 'Locking…' : 'Lock Gallery'}
              </button>
            ) : (
              <button className="unlock-btn" onClick={handleUnlock} disabled={isUnlocking} aria-busy={isUnlocking}>
                {isUnlocking ? (
                  <span className="btn-spinner" aria-hidden="true" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
                {isUnlocking ? 'Unlocking…' : 'Unlock Gallery'}
              </button>
            )}
            {album.selections.length > 0 && (
              <button
                className="reset-btn"
                onClick={() => { setResetError(null); setIsResetConfirmOpen(true); }}
                aria-label="Reset client's photo selection"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
                Reset Selection
              </button>
            )}
          </div>

          <div className="metadata-grid">
            <div className="metadata-item">
              <span className="metadata-label">Event Date</span>
              <span className="metadata-value">{album.eventDate ? formatDate(album.eventDate) : '—'}</span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">PIN</span>
              <span className="metadata-value pin">
                {pinRevealed ? album.pin : '••••'}
                <button
                  type="button"
                  className="pin-reveal-btn"
                  onClick={() => setPinRevealed((visible) => !visible)}
                  aria-label={pinRevealed ? 'Hide PIN' : 'Show PIN'}
                >
                  {pinRevealed ? 'Hide' : 'Show'}
                </button>
              </span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">Max Selections</span>
              <span className="metadata-value">{album.maxSelections}</span>
            </div>
          </div>

          {album.shareCount !== undefined && (
            <div className="share-stats">
              <span className="stat-label">Shares:</span> {album.shareCount}
              {album.lastAccessedAt && (
                <> · <span className="stat-label">Last viewed:</span> {formatDate(new Date(album.lastAccessedAt))}</>
              )}
            </div>
          )}
        </div>

        <div className="section-header">
          <h3 className="section-title">Selected Photos ({album.selections.length})</h3>
          <div className="section-actions">
            <CopyFilenamesButton selections={album.selections} />
          </div>
        </div>

        <SelectionTable selections={album.selections} onReplySaved={fetchAlbum} />

        <div className="section-header photos-section-header">
          <h3 className="photos-title">All Photos ({photos.length})</h3>
          <div className="section-actions photo-section-actions">
            {(photos.length > 1 || photoReorderMode) && (
              <button
                type="button"
                className={`selection-toggle-btn${photoReorderMode ? ' is-active' : ''}`}
                onClick={togglePhotoReorderMode}
                aria-pressed={photoReorderMode}
              >
                {photoReorderMode ? 'Done reordering' : 'Reorder photos'}
              </button>
            )}
            <button
              type="button"
              className={`selection-toggle-btn${photoSelectionMode ? ' is-active' : ''}`}
              onClick={() => {
                if (photoSelectionMode) {
                  exitPhotoSelectionMode();
                } else {
                  setPhotoReorderMode(false);
                  setReorderError(null);
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

        {photoReorderMode && (
          <p className="reorder-touch-hint">
            Drag a photo by its ⠿ handle, or use the ↑/↓ buttons to reorder.
          </p>
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
            {isDriveAlbum ? (
              <>
                <p className="empty-message">
                  No photos scanned yet. Re-create the scan from the Drive folder link.
                </p>
              </>
            ) : (
              <>
                <p className="empty-message">No photos uploaded yet</p>
                <a className="upload-link" href="/admin/upload">Go to upload</a>
              </>
            )}
          </div>
        ) : (
          <div className="photo-grid">
            {photos.map((photo, index) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                index={index}
                totalCount={photos.length}
                isSelected={selectedPhotoIds.has(photo.id)}
                isDragged={draggedPhotoId === photo.id}
                isDragOver={dragOverPhotoId === photo.id}
                selectionMode={photoSelectionMode}
                reorderMode={photoReorderMode}
                isSavingOrder={isSavingOrder}
                onTileDragStart={handleTileDragStart}
                onTileDragOver={handleTileDragOver}
                onTileDrop={handleTileDrop}
                onTileDragEnd={handleTileDragEnd}
                onSelectToggle={handleSelectToggleClick}
                onDeleteClick={handlePhotoDeleteClick}
                onDragHandlePointerDown={handleDragHandlePointerDown}
                onDragHandlePointerMove={handleDragHandleMove}
                onDragHandlePointerUp={handleDragHandleUp}
                onDragHandlePointerCancel={handleDragHandleCancel}
                onMoveUp={handleMoveUpClick}
                onMoveDown={handleMoveDownClick}
              />
            ))}
          </div>
        )}

        {/* Drive albums skip the final-delivery flow entirely — their
            originals already live in the photographer's own Drive folder. */}
        {!isDriveAlbum && (
          <FinalPhotosSection
            albumId={albumId}
            // `AlbumWithSelections.status` (packages/shared) is a bare `string`
            // (kept broad there since it's read by many response builders) —
            // narrow to the canonical variant here, since in practice it's
            // always one of these four and this component's own comparisons
            // benefit from the compile-time safety.
            status={album.status as AlbumStatusVariant}
            finalPhotos={finalPhotos}
            onRefresh={fetchAlbum}
          />
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
            customSlug: album.customSlug,
          vendorName: album.vendorName,
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
          isOpen={isResetConfirmOpen}
          title="Reset client's selection?"
          confirmLabel="Reset Selection"
          busyLabel="Resetting…"
          isBusy={isResetting}
          error={resetError}
          onConfirm={() => { void handleReset(); }}
          onCancel={() => setIsResetConfirmOpen(false)}
        >
          This permanently deletes the client's {album.selections.length} selected photo{album.selections.length === 1 ? '' : 's'}
          {' '}(and any notes on them) and reopens the gallery empty. Unlike Unlock, this cannot be undone — use it only when
          the client wants to start over completely.
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

          .detail-body {
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
            margin-bottom: var(--space-6);
          }

          .inline-error {
            margin: 0 0 var(--space-4);
            padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-md);
            border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
            background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
            color: var(--color-error);
            font-size: var(--text-sm);
          }

          .reorder-touch-hint {
            display: none;
            margin: 0 0 var(--space-4);
            padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-md);
            border: 1px solid var(--color-border);
            background-color: var(--color-surface);
            color: var(--color-text-muted);
            font-size: var(--text-sm);
          }

          /* Only relevant on touch devices, where native drag-and-drop doesn't work. */
          @media (pointer: coarse) {
            .reorder-touch-hint { display: block; }
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
            min-height: var(--tap-target-min);
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
          .drive-storage-warning {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: var(--space-4);
            margin: 0 0 var(--space-5);
            padding: var(--space-2-5) var(--space-3);
            border: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
            border-radius: var(--radius-md);
            background: color-mix(in srgb, var(--color-accent) 6%, transparent);
            color: var(--color-text);
          }
          .drive-storage-warning strong {
            font-size: var(--text-sm);
          }
          .drive-storage-warning p {
            margin: var(--space-1) 0 0;
            color: var(--color-text-muted);
            font-size: var(--text-sm);
            line-height: var(--leading-relaxed);
          }
          .drive-storage-warning-dismiss {
            flex-shrink: 0;
            color: var(--color-text-muted);
            font-size: var(--text-xs);
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
          .status-badge--submitted { background-color: color-mix(in srgb, var(--color-accent) 12%, transparent); color: var(--color-accent); }
          .status-badge--locked { background-color: color-mix(in srgb, var(--color-error) 15%, transparent); color: var(--color-error); }
.status-badge--delivered { background-color: color-mix(in srgb, var(--color-success) 18%, transparent); color: var(--color-success); }

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
          .pin-reveal-btn {
            margin-left: var(--space-2);
            padding: 0 var(--space-1);
            background: none;
            border: none;
            color: var(--color-text-muted);
            font-size: var(--text-xs);
            font-family: var(--font-sans);
            letter-spacing: normal;
            cursor: pointer;
          }
          .pin-reveal-btn:hover { color: var(--color-text); }

          .share-stats {
            font-size: var(--text-sm);
            color: var(--color-text-muted);
            margin-top: var(--space-2);
          }
          .stat-label { font-weight: 500; }

          .share-actions {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-3);
            margin-bottom: var(--space-8);
          }

          .share-btn, .lock-btn, .unlock-btn, .reset-btn {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            min-height: var(--tap-target-min);
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

          @media (prefers-reduced-motion: no-preference) {
            .share-btn:active:not(:disabled),
            .lock-btn:active:not(:disabled),
            .unlock-btn:active:not(:disabled),
            .reset-btn:active:not(:disabled) {
              transform: scale(var(--press-scale));
            }
          }

          .share-btn-label--long { display: inline; }
          .share-btn-label--short { display: none; }

          .lock-btn { color: var(--color-text); }
          .lock-btn:hover:not(:disabled) { border-color: var(--color-error); color: var(--color-error); }
          .unlock-btn { color: var(--color-text); }
          .unlock-btn:hover:not(:disabled) { border-color: var(--color-success); color: var(--color-success); }
          .lock-btn:disabled, .unlock-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .reset-btn { color: var(--color-error); border-color: color-mix(in srgb, var(--color-error) 45%, var(--color-border)); }
          .reset-btn:hover:not(:disabled) { border-color: var(--color-error); background-color: color-mix(in srgb, var(--color-error) 12%, transparent); }
          .reset-btn:disabled { opacity: 0.5; cursor: not-allowed; }

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
            min-height: var(--tap-target-min);
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
            border-radius: var(--radius-md);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            display: block;
            overflow: hidden;
          }

          .photo-thumb.blur-wrap {
            background-size: cover;
            background-position: center;
          }

          .photo-thumb.blur-wrap .blur-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0;
            transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1);
          }

          .photo-thumb.blur-wrap .blur-img.loaded {
            opacity: 1;
          }

          .photo-delete {
            position: absolute;
            top: var(--space-2);
            right: var(--space-2);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: var(--tap-target-min);
            height: var(--tap-target-min);
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

          /* touch-action: none keeps the browser from turning the drag
             gesture into a page scroll — the whole point of the handle. */
          .photo-drag-handle {
            touch-action: none;
            cursor: grab;
          }

          .photo-tile.is-dragging {
            opacity: 0.5;
          }

          .photo-tile.is-drag-over {
            border-color: var(--color-accent);
            background-color: var(--color-surface-elevated);
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
            .share-stats,
            .status-hint,
            .section-header,
            .selection-bar,
            .inline-error,
            .reorder-touch-hint {
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

            /* Three reorder controls per tile (⠿ ↑ ↓) — keep them on one row. */
            .photo-actions {
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }

            .share-actions {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: var(--space-2);
            }

            .share-actions .lock-btn,
            .share-actions .unlock-btn,
            .share-actions .reset-btn {
              grid-column: 1 / -1;
            }

            .share-btn-label--long { display: none; }
            .share-btn-label--short { display: inline; }

            .share-btn,
            .lock-btn,
            .unlock-btn,
            .reset-btn,
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
