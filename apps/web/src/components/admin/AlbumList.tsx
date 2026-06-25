import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlbumCard, type AlbumCardData } from './AlbumCard';

interface AlbumListProps {
  onSelectAlbum: (album: AlbumCardData) => void;
}

export function AlbumList({ onSelectAlbum }: AlbumListProps) {
  const shouldReduceMotion = useReducedMotion();
  const [albums, setAlbums] = useState<AlbumCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlbums = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/albums');
      if (!response.ok) {
        throw new Error('Failed to fetch albums');
      }
      const data = await response.json();
      setAlbums(data.albums);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlbums();
  }, []);

  if (isLoading) {
    return (
      <div className="album-list-state">
        <div className="spinner" />
        <p>Loading albums...</p>

        <style>{`
          .album-list-state {
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

  if (error) {
    return (
      <div className="album-list-state">
        <p className="error-message">{error}</p>
        <button className="retry-btn" onClick={fetchAlbums}>
          Try Again
        </button>

        <style>{`
          .album-list-state {
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

  if (albums.length === 0) {
    return (
      <div className="album-list-state">
        <p className="empty-message">No albums yet</p>
        <p className="empty-hint">Create your first album to get started</p>

        <style>{`
          .album-list-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-16);
            gap: var(--space-2);
          }

          .empty-message {
            font-size: var(--text-lg);
            font-weight: var(--font-medium);
            color: var(--color-text);
            margin-bottom: 0;
          }

          .empty-hint {
            font-size: var(--text-sm);
            color: var(--color-text-muted);
            margin-bottom: 0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="album-list">
      <AnimatePresence mode="popLayout">
        {albums.map((album) => (
          <motion.div
            key={album.id}
            layout
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, duration: shouldReduceMotion ? 0 : undefined }}
          >
            <AlbumCard album={album} onClick={onSelectAlbum} />
          </motion.div>
        ))}
      </AnimatePresence>

      <style>{`
        .album-list {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: var(--space-4);
        }

        @media (min-width: 640px) {
          .album-list {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .album-list {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
