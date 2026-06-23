import React, { useState } from 'react';
import { AlbumList } from '@/components/admin/AlbumList';
import type { AlbumCardData } from '@/components/admin/AlbumCard';

export default function AdminPage() {
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumCardData | null>(null);

  const handleSelectAlbum = (album: AlbumCardData) => {
    setSelectedAlbum(album);
  };

  const handleBack = () => {
    setSelectedAlbum(null);
  };

  return (
    <div className="admin-dashboard">
      {selectedAlbum ? (
        <div className="album-detail">
          <button className="back-btn" onClick={handleBack}>
            ← Back to Albums
          </button>
          <h2 className="detail-title">{selectedAlbum.title}</h2>
          <p className="detail-client">Client: {selectedAlbum.clientName}</p>
          <p className="detail-status">
            Status: <span className={selectedAlbum.status === 'active' ? 'status-active' : 'status-locked'}>
              {selectedAlbum.status === 'active' ? 'Active' : 'Locked'}
            </span>
          </p>
          <p className="detail-photos">{selectedAlbum.photoCount} photos</p>
        </div>
      ) : (
        <AlbumList onSelectAlbum={handleSelectAlbum} />
      )}

      <style>{`
        .admin-dashboard {
          width: 100%;
        }

        .album-detail {
          padding: var(--space-4);
        }

        .back-btn {
          padding: var(--space-2) var(--space-4);
          margin-bottom: var(--space-6);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          font-size: var(--text-sm);
          transition: all var(--transition-fast);
        }

        .back-btn:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }

        .detail-title {
          font-size: var(--text-2xl);
          margin-bottom: var(--space-4);
        }

        .detail-client {
          color: var(--color-text-muted);
          margin-bottom: var(--space-2);
        }

        .detail-status {
          color: var(--color-text-muted);
          margin-bottom: var(--space-2);
        }

        .status-active {
          color: #22c55e;
        }

        .status-locked {
          color: #ef4444;
        }

        .detail-photos {
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
