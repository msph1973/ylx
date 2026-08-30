import React, { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatDate } from '@ylx/shared';
import { getAlbumStatusMeta } from '@/lib/albumStatus';

export interface AlbumCardData {
  id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: string;
  photoCount: number;
  pin?: string;
  customSlug?: string;
  maxSelections?: number;
  selectionCount?: number;
  draftCount?: number | null;
  draftUpdatedAt?: number | null;
  vendorName?: string;
}

// A draft older than this is likely an abandoned session — showing it as
// "selecting now" would mislead the photographer.
const DRAFT_FRESH_MS = 30 * 60 * 1000;

interface SelectionProgress {
  count: number;
  max: number;
  live: boolean;
}

export function getSelectionProgress(album: AlbumCardData, now: number = Date.now()): SelectionProgress | null {
  if (!album.maxSelections || album.maxSelections <= 0) return null;

  if (album.status === 'active') {
    if (
      typeof album.draftCount === 'number' &&
      album.draftCount >= 0 &&
      typeof album.draftUpdatedAt === 'number'
    ) {
      const live = now - album.draftUpdatedAt < DRAFT_FRESH_MS;
      return { count: Math.min(album.draftCount, album.maxSelections), max: album.maxSelections, live };
    }
    return null;
  }

  // submitted / locked: real selection docs exist.
  if (typeof album.selectionCount === 'number' && album.selectionCount > 0) {
    return { count: Math.min(album.selectionCount, album.maxSelections), max: album.maxSelections, live: false };
  }
  return null;
}

// Hoisted to module scope and rendered once by the parent (AlbumList),
// instead of once per <AlbumCard> instance: up to PAGE_SIZE (12) cards render
// simultaneously, and each one embedding this same <style> block duplicated
// identical CSS text 12x in the DOM for no benefit.
export const ALBUM_CARD_STYLES = `
        .album-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          padding: var(--space-5);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          text-align: left;
          width: 100%;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background-color var(--transition-fast);
          cursor: pointer;
        }

        .album-card:hover {
          border-color: var(--color-accent);
        }

        .album-card:focus-visible {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 25%, transparent);
        }

        .album-card.is-selected {
          border-color: var(--color-accent);
          background-color: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));
        }

        .album-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--space-3);
        }

        .album-card-heading {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          min-width: 0;
        }

        .select-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          border: 1.5px solid var(--color-border);
          border-radius: var(--radius-sm);
          background-color: var(--color-bg);
          color: var(--color-bg);
          transition: background-color var(--transition-fast), border-color var(--transition-fast);
        }

        .select-box.checked {
          background-color: var(--color-accent);
          border-color: var(--color-accent);
          color: var(--color-bg);
        }

        .album-card-title {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-text);
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
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

        .status-badge--active {
          background-color: color-mix(in srgb, var(--color-success) 15%, transparent);
          color: var(--color-success);
        }

        .status-badge--submitted {
          background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
          color: var(--color-accent);
        }

        .status-badge--locked {
          background-color: color-mix(in srgb, var(--color-error) 15%, transparent);
          color: var(--color-error);
        }

        .status-badge--delivered {
          background-color: color-mix(in srgb, var(--color-success) 18%, transparent);
          color: var(--color-success);
        }

        .album-card-meta {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .meta-item {
          display: flex;
          gap: var(--space-2);
          font-size: var(--text-sm);
        }

        .meta-label {
          color: var(--color-text-muted);
          min-width: 50px;
        }

        .meta-value {
          color: var(--color-text);
        }

        .album-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: var(--space-3);
          border-top: 1px solid var(--color-border);
        }

        .selection-progress {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .progress-track {
          height: 6px;
          border-radius: var(--radius-full);
          background-color: var(--color-bg);
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          width: 100%;
          /* No radius here: scaleX would distort it, and the track's
             overflow:hidden + own radius already clips the fill's edges. */
          background-color: var(--color-accent);
          transform-origin: left;
          transition: transform var(--transition-fast);
        }

        .progress-text {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-muted);
        }

        .live-badge {
          display: inline-flex;
          align-items: center;
          padding: 0 var(--space-2);
          border-radius: var(--radius-full);
          background-color: color-mix(in srgb, var(--color-success) 15%, transparent);
          color: var(--color-success);
          font-weight: var(--font-medium);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .stat {
          display: flex;
          align-items: baseline;
          gap: var(--space-1);
        }

        .stat-value {
          font-size: var(--text-xl);
          font-weight: var(--font-bold);
          color: var(--color-accent);
        }

        .stat-label {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }

        .pin-display {
          font-family: var(--font-mono, monospace);
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          padding: var(--space-1) var(--space-2);
          background-color: var(--color-bg);
          border-radius: var(--radius-md);
        }
`;

interface AlbumCardProps {
  album: AlbumCardData;
  onClick: (album: AlbumCardData) => void;
  /** When true, clicking the card toggles selection instead of opening it. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (album: AlbumCardData) => void;
}

export const AlbumCard = React.memo(function AlbumCard({
  album,
  onClick,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: AlbumCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const formattedDate = formatDate(album.eventDate);

  const status = getAlbumStatusMeta(album.status);
  const [, setNowTick] = React.useState(0);
  const progress = getSelectionProgress(album, Date.now());

  // Auto-clear the "selecting now" badge when the draft freshness expires
  // so an open dashboard doesn't show stale badges indefinitely.
  useEffect(() => {
    if (!progress?.live || !album.draftUpdatedAt) return;
    const expiresAt = album.draftUpdatedAt + DRAFT_FRESH_MS;
    const remaining = Math.max(0, expiresAt - Date.now());
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNowTick((t) => t + 1), remaining + 100);
    return () => clearTimeout(timer);
  }, [progress?.live, album.draftUpdatedAt]);

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(album);
    } else {
      onClick(album);
    }
  };

  return (
    <motion.button
      type="button"
      className={`album-card${selected ? ' is-selected' : ''}`}
      onClick={handleClick}
      aria-pressed={selectionMode ? selected : undefined}
      aria-label={
        selectionMode
          ? `${selected ? 'Deselect' : 'Select'} album ${album.title}`
          : `Open album ${album.title}`
      }
      whileHover={shouldReduceMotion ? {} : { y: -4 }}
      whileTap={shouldReduceMotion ? {} : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 300, damping: 35 }}
    >
      <div className="album-card-header">
        <div className="album-card-heading">
          {selectionMode && (
            <span className={`select-box${selected ? ' checked' : ''}`} aria-hidden="true">
              {selected && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
          )}
          <h3 className="album-card-title">{album.title}</h3>
        </div>
        <span className={`status-badge status-badge--${status.variant}`}>
          {status.label}
        </span>
      </div>

      <div className="album-card-meta">
        <span className="meta-item">
          <span className="meta-label">Client</span>
          <span className="meta-value">{album.clientName}</span>
        </span>
        <span className="meta-item">
          <span className="meta-label">Date</span>
          <span className="meta-value">{formattedDate}</span>
        </span>
      </div>

      {progress && (
        <div className="selection-progress">
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={progress.count}
            aria-valuemin={0}
            aria-valuemax={progress.max}
            aria-label={`${progress.count} of ${progress.max} photos selected`}>
            <div
              className="progress-fill"
              style={{ transform: `scaleX(${progress.max > 0 ? Math.min(1, progress.count / progress.max) : 0})` }}
            />
          </div>
          <span className="progress-text">
            {progress.count}/{progress.max} selected
            {progress.live && <span className="live-badge">selecting now</span>}
          </span>
        </div>
      )}

      <div className="album-card-footer">
        <span className="stat">
          <span className="stat-value">{album.photoCount}</span>
          <span className="stat-label">photos</span>
        </span>
        {album.pin && (
          <span className="pin-display">PIN: {album.pin}</span>
        )}
      </div>
    </motion.button>
  );
});
