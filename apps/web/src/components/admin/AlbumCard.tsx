import React from 'react';
import { motion } from 'framer-motion';

export interface AlbumCardData {
  id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: string;
  photoCount: number;
  pin?: string;
}

interface AlbumCardProps {
  album: AlbumCardData;
  onClick: (album: AlbumCardData) => void;
}

export function AlbumCard({ album, onClick }: AlbumCardProps) {
  const formattedDate = new Date(album.eventDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const isActive = album.status === 'active';

  return (
    <motion.button
      className="album-card"
      onClick={() => onClick(album)}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div className="album-card-header">
        <h3 className="album-card-title">{album.title}</h3>
        <span className={`status-badge ${isActive ? 'active' : 'locked'}`}>
          {isActive ? 'Active' : 'Locked'}
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

      <div className="album-card-footer">
        <span className="stat">
          <span className="stat-value">{album.photoCount}</span>
          <span className="stat-label">photos</span>
        </span>
        {album.pin && (
          <span className="pin-display">
            PIN: {album.pin}
          </span>
        )}
      </div>

      <style>{`
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
          transition: border-color var(--transition-fast);
          cursor: pointer;
        }

        .album-card:hover {
          border-color: var(--color-accent);
        }

        .album-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--space-3);
        }

        .album-card-title {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-text);
          line-height: 1.3;
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

        .status-badge.active {
          background-color: color-mix(in srgb, var(--color-success) 15%, transparent);
          color: var(--color-success);
        }

        .status-badge.locked {
          background-color: color-mix(in srgb, var(--color-error) 15%, transparent);
          color: var(--color-error);
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
      `}</style>
    </motion.button>
  );
}
