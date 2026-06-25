import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { AlbumWithSelections, Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';
import { SelectionTable } from './SelectionTable';
import { CopyFilenamesButton } from './CopyFilenamesButton';

interface AlbumDetailProps {
  albumId: string;
  onBack: () => void;
}

export function AlbumDetail({ albumId, onBack }: AlbumDetailProps) {
  const shouldReduceMotion = useReducedMotion();
  const [album, setAlbum] = useState<AlbumWithSelections | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const fetchAlbum = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/albums/${albumId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch album');
      }
      const data = await response.json();
      setAlbum(data.album);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlbum();
  }, [albumId]);

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

  const selectedFilenames = album?.selections.map((s) => s.photo.filename) || [];

  if (isLoading) {
    return (
      <div className="album-detail-state">
        <div className="spinner" />
        <p>Loading album...</p>

        <style>{`
          .album-detail-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-16);
            gap: var(--space-4);
          }
        `}</style>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="album-detail-state">
        <p className="error-message">{error || 'Album not found'}</p>
        <button className="retry-btn" onClick={fetchAlbum}>
          Try Again
        </button>

        <style>{`
          .album-detail-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-16);
            gap: var(--space-4);
          }

          .error-message {
            color: var(--color-error);
            font-size: var(--text-sm);
          }

          .retry-btn {
            padding: var(--space-2) var(--space-4);
            background-color: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            color: var(--color-text);
            font-size: var(--text-sm);
            transition: all var(--transition-fast);
          }

          .retry-btn:hover {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }
        `}</style>
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

        <div className="album-header">
          <h2 className="album-title">{album.clientName}</h2>
          <span className={`status-badge ${album.isLocked ? 'locked' : 'active'}`}>
            {album.isLocked ? 'Locked' : 'Active'}
          </span>
        </div>

        <div className="metadata-grid">
          <div className="metadata-item">
            <span className="metadata-label">Event Date</span>
            <span className="metadata-value">{formatDate(album.createdAt)}</span>
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

        <style>{`
          .album-detail {
            padding: var(--space-4);
          }

          .back-btn {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-4);
            margin-bottom: var(--space-6);
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
            background-color: color-mix(in srgb, var(--color-success) 15%, transparent);
            color: var(--color-success);
          }

          .status-badge.locked {
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
            margin-bottom: var(--space-8);
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
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}