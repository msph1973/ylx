import React, { useState, useCallback, useRef } from 'react';
import { AlbumList, type AlbumListHandle } from '@/components/admin/AlbumList';
import { AlbumDetail } from '@/components/admin/AlbumDetail';
import { AlbumFormModal } from '@/components/admin/AlbumFormModal';
import type { AlbumCardData } from '@/components/admin/AlbumCard';

interface AdminPageProps {
  adminName?: string;
}

export default function AdminPage({ adminName }: AdminPageProps) {
  const albumListRef = useRef<AlbumListHandle>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleSelectAlbum = useCallback((album: AlbumCardData) => {
    setSelectedAlbumId(album.id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedAlbumId(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }, []);

  // AlbumList already refetches itself in the background on Ably realtime
  // "admin:updates" events (see useAdminRealtime in AlbumList.tsx), which the
  // create/update/delete API routes publish on every mutation — so no manual
  // refresh trigger is needed here in the common case. Forcing a remount via
  // a key bump used to discard the admin's in-progress search/filter/page
  // state on every create.
  //
  // Realtime (Ably) usually refreshes the list, but its connection can still
  // be establishing right when a fast admin creates an album — trigger an
  // explicit background refetch as a fallback so the new album always
  // appears without needing a manual reload.
  const handleAlbumCreated = useCallback(() => {
    albumListRef.current?.refetch();
  }, []);

  const handleAlbumDeleted = useCallback(() => {
    setSelectedAlbumId(null);
  }, []);

  return (
    <div className="admin-dashboard">
      <div className="admin-toolbar">
        {adminName && (
          <span className="admin-user">Welcome, {adminName}</span>
        )}
        <div className="toolbar-actions">
          {!selectedAlbumId && (
            <button
              className="btn-new-album"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Album
            </button>
          )}
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {selectedAlbumId ? (
        <AlbumDetail
          albumId={selectedAlbumId}
          onBack={handleBack}
          onDeleted={handleAlbumDeleted}
        />
      ) : (
        <AlbumList ref={albumListRef} onSelectAlbum={handleSelectAlbum} />
      )}

      <AlbumFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleAlbumCreated}
      />

      <style>{`
        .admin-dashboard {
          width: 100%;
        }

        .admin-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-4);
          margin-bottom: var(--space-6);
          padding-bottom: var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .admin-user {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }

        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .btn-new-album {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          min-height: var(--tap-target-min);
          background-color: var(--color-accent);
          color: var(--color-bg);
          border: none;
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: opacity var(--transition-fast);
        }

        .btn-new-album:hover {
          background-color: var(--color-accent-hover);
        }

        .logout-btn {
          padding: var(--space-2) var(--space-4);
          min-height: var(--tap-target-min);
          background-color: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .logout-btn:hover {
          background-color: var(--color-surface);
          color: var(--color-text);
          border-color: var(--color-accent);
        }
      `}</style>
    </div>
  );
}
