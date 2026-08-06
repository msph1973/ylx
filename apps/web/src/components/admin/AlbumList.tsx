import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlbumCard, ALBUM_CARD_STYLES, type AlbumCardData } from './AlbumCard';
import { ConfirmDialog } from './ConfirmDialog';
import { useAdminRealtime } from '@/hooks/useAdminRealtime';
import { getAlbumStatusMeta, ALBUM_STATUS_FILTERS, type AlbumStatusVariant } from '@/lib/albumStatus';

interface AlbumListProps {
  onSelectAlbum: (album: AlbumCardData) => void;
}

export interface AlbumListHandle {
  refetch: () => void;
}

type StatusFilter = 'all' | AlbumStatusVariant;
const PAGE_SIZE = 12;

export const AlbumList = forwardRef<AlbumListHandle, AlbumListProps>(function AlbumList({ onSelectAlbum }, ref) {
  const shouldReduceMotion = useReducedMotion();
  const [albums, setAlbums] = useState<AlbumCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchAlbums = useCallback(async (options?: { background?: boolean }) => {
    // Background refreshes (realtime-triggered) skip the full-list spinner so
    // the dashboard doesn't flash while the admin is looking at it.
    if (!options?.background) setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/albums');
      if (!response.ok) throw new Error('Failed to fetch albums');
      const data = await response.json() as { albums: AlbumCardData[] };
      setAlbums(data.albums);
    } catch (err) {
      // Background (realtime-triggered) failures must not tear down the
      // visible dashboard — log and leave the current list on screen.
      if (!options?.background) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } else {
        console.error('[AlbumList] background refresh failed:', err);
      }
    } finally {
      if (!options?.background) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAlbums();
  }, [fetchAlbums]);

  // Realtime events can arrive in bursts (e.g. draft:progress while a client
  // is actively picking, or bulk operations emitting several events) —
  // coalesce them into one background refetch per 500ms window.
  const refetchTimerRef = useRef<number | null>(null);
  const coalescedRefetch = useCallback(() => {
    if (refetchTimerRef.current !== null) return;
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null;
      void fetchAlbums({ background: true });
    }, 500);
  }, [fetchAlbums]);

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current !== null) window.clearTimeout(refetchTimerRef.current);
    };
  }, []);

  useAdminRealtime(coalescedRefetch);

  // Drop any selected ids that no longer exist after a refetch.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(albums.map((a) => a.id));
      const next = new Set([...prev].filter((id) => present.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [albums]);

  const statusCounts = useMemo(() => {
    const counts: Record<AlbumStatusVariant, number> = { active: 0, submitted: 0, locked: 0 };
    for (const album of albums) counts[getAlbumStatusMeta(album.status).variant] += 1;
    return counts;
  }, [albums]);

  const filteredAlbums = useMemo(() => {
    const q = search.trim().toLowerCase();
    return albums.filter((album) => {
      if (statusFilter !== 'all' && getAlbumStatusMeta(album.status).variant !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        album.title.toLowerCase().includes(q) ||
        album.clientName.toLowerCase().includes(q) ||
        (album.pin ?? '').includes(q)
      );
    });
  }, [albums, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAlbums.length / PAGE_SIZE));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paginatedAlbums = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return filteredAlbums.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredAlbums, page]);

  const visibleRange = useMemo(() => {
    if (filteredAlbums.length === 0) {
      return { start: 0, end: 0 };
    }

    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, filteredAlbums.length);
    return { start, end };
  }, [filteredAlbums.length, page]);

  const allVisibleSelected =
    paginatedAlbums.length > 0 && paginatedAlbums.every((a) => selectedIds.has(a.id));

  const toggleSelect = useCallback((album: AlbumCardData) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(album.id)) next.delete(album.id);
      else next.add(album.id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const everySelected = paginatedAlbums.every((a) => next.has(a.id));
      for (const a of paginatedAlbums) {
        if (everySelected) next.delete(a.id);
        else next.add(a.id);
      }
      return next;
    });
  }, [paginatedAlbums]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setDeleteError(null);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch('/api/admin/albums/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to delete albums');
      }
      setConfirmOpen(false);
      exitSelectionMode();
      await fetchAlbums();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete albums');
    } finally {
      setIsDeleting(false);
    }
  }, [selectedIds, exitSelectionMode, fetchAlbums]);

  useImperativeHandle(ref, () => ({
    refetch: () => { void fetchAlbums({ background: true }); },
  }), [fetchAlbums]);

  const selectedCount = selectedIds.size;

  if (isLoading) {
    return (
      <div className="state-container">
        <div className="spinner" role="status"><span className="sr-only">Loading albums</span></div>
        <p>Loading albums...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="state-container">
        <p className="error-message" role="alert">{error}</p>
        <button className="retry-btn" onClick={() => { void fetchAlbums(); }}>Try Again</button>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="album-list-state">
        <p className="empty-message">No albums yet</p>
        <p className="empty-hint">Create your first album to get started</p>
        <style>{`
          .album-list-state {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: var(--space-16); gap: var(--space-2); text-align: center;
          }
          .empty-message { font-size: var(--text-lg); font-weight: var(--font-medium); color: var(--color-text); }
          .empty-hint { font-size: var(--text-sm); color: var(--color-text-muted); }
        `}</style>
      </div>
    );
  }

  const filterOptions: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: albums.length },
    ...ALBUM_STATUS_FILTERS.map((v) => ({
      key: v as StatusFilter,
      label: getAlbumStatusMeta(v).label,
      count: statusCounts[v],
    })),
  ];

  return (
    <div className="album-list-wrap">
      <div className="list-toolbar">
        <div className="toolbar-primary">
          <div className="search-field">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              className="search-input"
              placeholder="Search by client, title, or PIN"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search albums"
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <button
            className={`select-toggle${selectionMode ? ' active' : ''}`}
            onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
            aria-pressed={selectionMode}
          >
            {selectionMode ? 'Done' : 'Select'}
          </button>
        </div>

        <div className="status-filter" role="group" aria-label="Filter albums by status">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              aria-pressed={statusFilter === opt.key}
              className={`filter-chip${statusFilter === opt.key ? ' active' : ''}`}
              onClick={() => setStatusFilter(opt.key)}
            >
              {opt.label}
              <span className="chip-count">{opt.count}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectionMode && (
          <motion.div
            className="selection-bar"
            initial={shouldReduceMotion ? {} : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? {} : { opacity: 0, y: -8 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
          >
            <div className="selection-info">
              <button className="link-btn" onClick={toggleSelectAllVisible} disabled={paginatedAlbums.length === 0}>
                {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="selection-count">
                {selectedCount} selected
              </span>
            </div>
            <button
              className="bulk-delete-btn"
              onClick={() => { setDeleteError(null); setConfirmOpen(true); }}
              disabled={selectedCount === 0}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {filteredAlbums.length === 0 ? (
        <div className="no-results">
          <p className="empty-message">No albums match your filters</p>
          <button className="link-btn" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="pagination-summary" aria-live="polite">
            <span>
              Showing {visibleRange.start}–{visibleRange.end} of {filteredAlbums.length} album{filteredAlbums.length === 1 ? '' : 's'}
            </span>
            <span>
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="album-list">
            <AnimatePresence mode="popLayout">
              {paginatedAlbums.map((album) => (
                <motion.div
                  key={album.id}
                  layout
                  initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30, duration: shouldReduceMotion ? 0 : undefined }}
                >
                  <AlbumCard
                    album={album}
                    onClick={onSelectAlbum}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(album.id)}
                    onToggleSelect={toggleSelect}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <nav className="pagination-controls" aria-label="Album pages">
            <button
              type="button"
              className="pagination-btn"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              aria-label="Go to previous page"
            >
              Previous
            </button>
            <span className="pagination-page-label">Page {page} / {totalPages}</span>
            <button
              type="button"
              className="pagination-btn"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              aria-label="Go to next page"
            >
              Next
            </button>
          </nav>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Delete ${selectedCount} album${selectedCount === 1 ? '' : 's'}?`}
        confirmLabel={`Delete ${selectedCount} album${selectedCount === 1 ? '' : 's'}`}
        busyLabel="Deleting…"
        isBusy={isDeleting}
        error={deleteError}
        onConfirm={() => { void handleBulkDelete(); }}
        onCancel={() => setConfirmOpen(false)}
      >
        This permanently deletes the selected album{selectedCount === 1 ? '' : 's'}, their
        uploaded photos, and every client selection. This action cannot be undone.
      </ConfirmDialog>

      <style>{`
        .album-list-wrap {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .list-toolbar {
          position: sticky;
          top: 0;
          z-index: var(--z-dropdown);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          padding: var(--space-3) 0;
          background-color: var(--color-bg);
        }

        .toolbar-primary {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
          align-items: center;
        }

        .search-field {
          position: relative;
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: var(--space-3);
          color: var(--color-text-muted);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          min-height: 44px;
          padding: var(--space-2-5) var(--space-3) var(--space-2-5) var(--space-8);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text);
          font-size: var(--text-sm);
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }

        .search-input::placeholder { color: var(--color-text-muted); }

        .search-input:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
        }

        .search-clear {
          position: absolute;
          right: var(--space-2);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          color: var(--color-text-muted);
          border-radius: var(--radius-full);
          cursor: pointer;
        }

        @media (hover: hover) {
          .search-clear:hover { color: var(--color-text); background-color: var(--color-bg); }
        }

        .select-toggle {
          flex-shrink: 0;
          padding: var(--space-2-5) var(--space-4);
          min-height: 44px;
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        @media (hover: hover) {
          .select-toggle:hover { color: var(--color-text); border-color: var(--color-accent); }
        }
        .select-toggle.active { color: var(--color-accent); border-color: var(--color-accent); }

        .status-filter {
          display: flex;
          gap: var(--space-2);
          overflow-x: auto;
          scrollbar-width: none;
          padding-bottom: var(--space-1);
        }
        .status-filter::-webkit-scrollbar { display: none; }

        .filter-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          flex-shrink: 0;
          padding: var(--space-2) var(--space-3);
          min-height: 44px;
          background-color: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-full);
          color: var(--color-text-muted);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        @media (hover: hover) {
          .filter-chip:hover { color: var(--color-text); border-color: var(--color-text-muted); }
        }

        .filter-chip.active {
          color: var(--color-text);
          border-color: var(--color-accent);
          background-color: color-mix(in srgb, var(--color-accent) 10%, transparent);
        }

        .chip-count {
          font-size: var(--text-xs);
          font-variant-numeric: tabular-nums;
          color: var(--color-text-muted);
          background-color: var(--color-surface);
          padding: 1px var(--space-2);
          border-radius: var(--radius-full);
        }

        .filter-chip.active .chip-count { color: var(--color-accent); }

        .selection-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
        }

        .selection-info {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--space-4);
        }

        .link-btn {
          background: none;
          border: none;
          color: var(--color-accent);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          min-height: 44px;
          padding: 0;
        }
        @media (hover: hover) {
          .link-btn:hover:not(:disabled) { text-decoration: underline; }
        }
        .link-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .selection-count {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          font-variant-numeric: tabular-nums;
        }

        .bulk-delete-btn {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2-5) var(--space-4);
          min-height: 44px;
          background-color: transparent;
          border: 1px solid color-mix(in srgb, var(--color-error) 45%, var(--color-border));
          border-radius: var(--radius-md);
          color: var(--color-error);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        @media (hover: hover) {
          .bulk-delete-btn:hover:not(:disabled) {
            background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
            border-color: var(--color-error);
          }
        }

        .bulk-delete-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .no-results {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-12) var(--space-4);
          text-align: center;
        }

        .no-results .empty-message {
          font-size: var(--text-base);
          color: var(--color-text);
        }

        .album-list {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: var(--space-4);
        }

        .pagination-summary,
        .pagination-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          flex-wrap: wrap;
        }

        .pagination-summary {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }

        .pagination-controls {
          padding-top: var(--space-1);
        }

        .pagination-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: var(--space-2-5) var(--space-4);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background-color: var(--color-surface);
          color: var(--color-text);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
        }

        @media (hover: hover) {
          .pagination-btn:hover:not(:disabled) {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }
        }

        .pagination-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .pagination-page-label {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          font-variant-numeric: tabular-nums;
        }

        @media (min-width: 640px) {
          .album-list { grid-template-columns: repeat(2, 1fr); }
        }

        @media (min-width: 1024px) {
          .album-list { grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 480px) {
          .toolbar-primary {
            flex-direction: column;
            align-items: stretch;
          }

          .select-toggle,
          .bulk-delete-btn,
          .pagination-btn {
            width: 100%;
          }

          .pagination-controls > * {
            width: 100%;
          }

          .pagination-page-label {
            text-align: center;
          }
        }
      `}</style>

      {/* Rendered once here instead of once per <AlbumCard> — see the
          comment on ALBUM_CARD_STYLES for why. */}
      <style>{ALBUM_CARD_STYLES}</style>
    </div>
  );
});
