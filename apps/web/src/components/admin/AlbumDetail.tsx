import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { AlbumWithSelections, Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';
import { SelectionTable } from './SelectionTable';
import { CopyFilenamesButton } from './CopyFilenamesButton';
import { AlbumFormModal } from './AlbumFormModal';

interface AlbumDetailProps {
  albumId: string;
  onBack: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

export function AlbumDetail({ albumId, onBack, onDeleted, onUpdated }: AlbumDetailProps) {
  const shouldReduceMotion = useReducedMotion();
  const [album, setAlbum] = useState<AlbumWithSelections | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const copyLinkTimeoutRef = useRef<number | null>(null);
  const copyPinTimeoutRef = useRef<number | null>(null);

  const handleCopyLink = useCallback(async () => {
    if (!album?.slug) return;
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await navigator.clipboard.writeText(`${origin}/gallery/${album.slug}`);
      setCopiedLink(true);
      if (copyLinkTimeoutRef.current !== null) window.clearTimeout(copyLinkTimeoutRef.current);
      copyLinkTimeoutRef.current = window.setTimeout(() => { setCopiedLink(false); copyLinkTimeoutRef.current = null; }, 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }, [album?.slug]);

  const handleCopyPin = useCallback(async () => {
    if (!album?.pin) return;
    try {
      await navigator.clipboard.writeText(album.pin);
      setCopiedPin(true);
      if (copyPinTimeoutRef.current !== null) window.clearTimeout(copyPinTimeoutRef.current);
      copyPinTimeoutRef.current = window.setTimeout(() => { setCopiedPin(false); copyPinTimeoutRef.current = null; }, 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }, [album?.pin]);

  // Cleanup copy timeouts on unmount
  useEffect(() => {
    return () => {
      if (copyLinkTimeoutRef.current !== null) window.clearTimeout(copyLinkTimeoutRef.current);
      if (copyPinTimeoutRef.current !== null) window.clearTimeout(copyPinTimeoutRef.current);
    };
  }, []);

  const fetchAlbum = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/albums/${albumId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch album');
      }
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

  const handleUnlock = async () => {
    if (!album) return;

    setIsUnlocking(true);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/unlock`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to unlock album');
      }
      setAlbum((prev) => (prev ? { ...prev, isLocked: false } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/albums/${albumId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete album');
      }
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleteConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSuccess = useCallback(() => {
    void fetchAlbum();
    onUpdated?.();
  }, [fetchAlbum, onUpdated]);

  const selectedFilenames = album?.selections.map((s) => s.photo.filename) || [];

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
        <button className="retry-btn" onClick={fetchAlbum}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="album-detail"
        className="album-detail"
        initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: shouldReduceMotion ? 0 : -32 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, duration: shouldReduceMotion ? 0 : undefined }}
      >
        <div className="detail-nav">
          <button className="back-btn" onClick={onBack}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Albums
          </button>
          <div className="detail-nav-actions">
            <button
              className="btn-edit"
              onClick={() => setIsEditModalOpen(true)}
              aria-label="Edit album"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
            <button
              className="btn-delete"
              onClick={() => setIsDeleteConfirmOpen(true)}
              aria-label="Delete album"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete
            </button>
          </div>
        </div>

        <div className="album-header">
          <h2 className="album-title">{album.clientName}</h2>
          <span className={`status-badge ${album.isLocked ? 'locked' : 'active'}`}>
            {album.isLocked ? 'Locked' : 'Active'}
          </span>
        </div>

        <div className="metadata-grid">
          <div className="metadata-item">
            <span className="metadata-label">Event Date</span>
            <span className="metadata-value">{album.eventDate ? formatDate(album.eventDate) : '—'}</span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">Status</span>
            <span className="metadata-value">
              {album.isLocked ? 'Locked' : 'Active'}
            </span>
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
          <button
            className="share-btn"
            onClick={() => { void handleCopyLink(); }}
            disabled={!album.slug}
            aria-label="Copy gallery link to clipboard"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {copiedLink ? 'Copied!' : 'Copy Gallery Link'}
          </button>
          <button
            className="share-btn"
            onClick={() => { void handleCopyPin(); }}
            disabled={!album.pin}
            aria-label="Copy PIN to clipboard"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="11" width="6" height="11" rx="1" />
              <path d="M9 11V7a3 3 0 0 1 6 0v4" />
            </svg>
            {copiedPin ? 'Copied!' : 'Copy PIN'}
          </button>
        </div>

        <div className="section-header">
          <h3 className="section-title">
            Selected Photos ({album.selections.length})
          </h3>
          <div className="section-actions">
            <CopyFilenamesButton filenames={selectedFilenames} />
            {album.isLocked && (
              <button
                className="unlock-btn"
                onClick={handleUnlock}
                disabled={isUnlocking}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
                {isUnlocking ? 'Unlocking...' : 'Unlock Gallery'}
              </button>
            )}
          </div>
        </div>

        <SelectionTable selections={album.selections} />

        {/* Edit modal */}
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
            photoCount: album.photos.length,
            pin: album.pin,
            maxSelections: album.maxSelections,
          }}
        />

        {/* Delete confirmation */}
        {isDeleteConfirmOpen && (
          <div
            className="confirm-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete"
          >
            <div className="confirm-dialog">
              <h3 className="confirm-title">Delete Album?</h3>
              <p className="confirm-body">
                This will permanently delete <strong>{album.title ?? album.clientName}</strong> and all its selections. This action cannot be undone.
              </p>
              <div className="confirm-actions">
                <button
                  className="btn-cancel"
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  className="btn-confirm-delete"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting…' : 'Delete Album'}
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          .album-detail {
            padding: var(--space-4);
          }

          .detail-nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--space-6);
          }

          .detail-nav-actions {
            display: flex;
            align-items: center;
            gap: var(--space-2);
          }

          .back-btn {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-4);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            color: var(--color-text-muted);
            font-size: var(--text-sm);
            transition: all var(--transition-fast);
            cursor: pointer;
          }

          .back-btn:hover {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }

          .btn-edit {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-3);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            color: var(--color-text-muted);
            font-size: var(--text-sm);
            transition: all var(--transition-fast);
            cursor: pointer;
          }

          .btn-edit:hover {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }

          .btn-delete {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-3);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            color: var(--color-text-muted);
            font-size: var(--text-sm);
            transition: all var(--transition-fast);
            cursor: pointer;
          }

          .btn-delete:hover {
            border-color: var(--color-error);
            color: var(--color-error);
          }

          .confirm-backdrop {
            position: fixed;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-4);
            z-index: 50;
          }

          .confirm-dialog {
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-2xl);
            padding: var(--space-6);
            max-width: 400px;
            width: 100%;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
          }

          .confirm-title {
            font-size: var(--text-xl);
            font-weight: var(--font-semibold);
            color: var(--color-text);
            margin: 0 0 var(--space-3);
          }

          .confirm-body {
            font-size: var(--text-sm);
            color: var(--color-text-muted);
            line-height: 1.6;
            margin: 0 0 var(--space-6);
          }

          .confirm-actions {
            display: flex;
            justify-content: flex-end;
            gap: var(--space-3);
          }

          .btn-cancel {
            padding: var(--space-2-5) var(--space-5);
            background-color: transparent;
            color: var(--color-text-muted);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            font-size: var(--text-sm);
            font-weight: var(--font-medium);
            cursor: pointer;
            transition: background-color var(--transition-fast);
          }

          .btn-cancel:hover:not(:disabled) {
            background-color: var(--color-bg);
          }

          .btn-cancel:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .btn-confirm-delete {
            padding: var(--space-2-5) var(--space-5);
            background-color: var(--color-error);
            color: white;
            border: none;
            border-radius: var(--radius-md);
            font-size: var(--text-sm);
            font-weight: var(--font-medium);
            cursor: pointer;
            transition: opacity var(--transition-fast);
          }

          .btn-confirm-delete:hover:not(:disabled) {
            opacity: 0.88;
          }

          .btn-confirm-delete:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .album-header {
            display: flex;
            align-items: center;
            gap: var(--space-4);
            margin-bottom: var(--space-6);
          }

          .album-title {
            font-size: var(--text-2xl);
            font-weight: var(--font-semibold);
            color: var(--color-text);
            margin: 0;
          }

          .status-badge {
            padding: var(--space-1) var(--space-3);
            border-radius: var(--radius-full);
            font-size: var(--text-xs);
            font-weight: var(--font-medium);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .status-badge.active {
            background-color: rgba(74, 222, 128, 0.15);
            background-color: color-mix(in srgb, var(--color-success) 15%, transparent);
            color: var(--color-success);
          }

          .status-badge.locked {
            background-color: rgba(248, 113, 113, 0.15);
            background-color: color-mix(in srgb, var(--color-error) 15%, transparent);
            color: var(--color-error);
          }

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
            .metadata-grid {
              grid-template-columns: repeat(4, 1fr);
            }
          }

          .metadata-item {
            display: flex;
            flex-direction: column;
            gap: var(--space-1);
          }

          .metadata-label {
            font-size: var(--text-xs);
            color: var(--color-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .metadata-value {
            font-size: var(--text-base);
            font-weight: var(--font-medium);
            color: var(--color-text);
          }

          .metadata-value.pin {
            font-family: var(--font-mono, monospace);
            letter-spacing: 0.1em;
          }

          .section-header {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-4);
            margin-bottom: var(--space-4);
          }

          .section-title {
            font-size: var(--text-lg);
            font-weight: var(--font-medium);
            color: var(--color-text);
            margin: 0;
          }

          .section-actions {
            display: flex;
            align-items: center;
            gap: var(--space-3);
          }

          .unlock-btn {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-4);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            color: var(--color-text);
            font-size: var(--text-sm);
            font-weight: var(--font-medium);
            transition: all var(--transition-fast);
            cursor: pointer;
          }

          .unlock-btn:hover:not(:disabled) {
            border-color: var(--color-success);
            color: var(--color-success);
          }

          .unlock-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .share-actions {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-3);
            margin-bottom: var(--space-6);
          }

          .share-btn {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
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

          .share-btn:hover:not(:disabled) {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }

          .share-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}