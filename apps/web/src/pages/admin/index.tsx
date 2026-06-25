import React, { useState } from 'react';
import { AlbumList } from '@/components/admin/AlbumList';
import { AlbumDetail } from '@/components/admin/AlbumDetail';
import type { AlbumCardData } from '@/components/admin/AlbumCard';

interface AdminPageProps {
  adminName?: string;
}

export default function AdminPage({ adminName }: AdminPageProps) {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  const handleSelectAlbum = (album: AlbumCardData) => {
    setSelectedAlbumId(album.id);
  };

  const handleBack = () => {
    setSelectedAlbumId(null);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-toolbar">
        {adminName && (
          <span className="admin-user">Welcome, {adminName}</span>
        )}
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {selectedAlbumId ? (
        <AlbumDetail albumId={selectedAlbumId} onBack={handleBack} />
      ) : (
        <AlbumList onSelectAlbum={handleSelectAlbum} />
      )}

      <style>{`
        .admin-dashboard {
          width: 100%;
        }

        .admin-toolbar {
          display: flex;
          justify-content: flex-end;
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

        .logout-btn {
          padding: var(--space-2) var(--space-4);
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
