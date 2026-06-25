import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PinEntry } from '@/components/gallery/PinEntry';
import { ReducedMotionProvider } from '@/components/ui/ReducedMotionProvider';
import type { Photo } from '@ylx/shared';

interface GalleryPageProps {
  slug: string;
}

interface AlbumData {
  id: string;
  clientName: string;
  maxSelections: number;
  isLocked: boolean;
  photos: Photo[];
}

export function GalleryPage({ slug }: GalleryPageProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePinSubmit = useCallback(async (pin: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/gallery/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        throw new Error('Invalid PIN');
      }

      const data = await response.json();
      setAlbum(data);
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  const togglePhoto = useCallback((photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else if (album && next.size < album.maxSelections) {
        next.add(photoId);
      }
      return next;
    });
  }, [album]);

  const handleSubmit = useCallback(async () => {
    if (!album || selectedPhotos.size === 0 || album.isLocked) return;

    try {
      const response = await fetch(`/api/gallery/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectionIds: Array.from(selectedPhotos) }),
      });

      if (!response.ok) {
        throw new Error('Submission failed');
      }

      setAlbum((prev) => prev ? { ...prev, isLocked: true } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  }, [album, selectedPhotos, slug]);

  if (!isAuthenticated) {
    return (
      <ReducedMotionProvider>
      <div className="gallery-auth">
        <motion.div
          className="gallery-auth-content"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="gallery-title">Enter PIN</h1>
          <p className="gallery-subtitle">to view your photos</p>
          <PinEntry
            onSubmit={handlePinSubmit}
            error={error}
            isLoading={isLoading}
          />
        </motion.div>

        <style>{`
          .gallery-auth {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-6);
          }

          .gallery-auth-content {
            text-align: center;
            max-width: 320px;
            width: 100%;
          }

          .gallery-title {
            font-size: var(--text-3xl);
            margin-bottom: var(--space-2);
          }

          .gallery-subtitle {
            color: var(--color-text-muted);
            margin-bottom: var(--space-8);
          }
        `}</style>
      </div>
      </ReducedMotionProvider>
    );
  }

  return (
    <ReducedMotionProvider>
    <div className="gallery-view">
      <div className="gallery-selection-bar">
        <span className="selection-count">
          {selectedPhotos.size} / {album?.maxSelections} selected
        </span>
        <button
          className="submit-btn"
          onClick={handleSubmit}
          disabled={selectedPhotos.size === 0 || album?.isLocked}
        >
          {album?.isLocked ? 'Submitted' : 'Submit Selection'}
        </button>
      </div>

      <motion.div
        className="photo-grid"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {album?.photos.map((photo, index) => {
          const isSelected = selectedPhotos.has(photo.id);
          const isDisabled = album.isLocked;
          return (
            <motion.div
              key={photo.id}
              role="button"
              tabIndex={isDisabled ? -1 : 0}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} photo ${photo.filename}`}
              aria-disabled={isDisabled}
              className={`photo-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.05, 1.5) }}
              onClick={() => !isDisabled && togglePhoto(photo.id)}
              onKeyDown={(e) => {
                if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  togglePhoto(photo.id);
                }
              }}
            >
              <img
                src={photo.thumbnailUrl}
                alt={`Photo ${index + 1} of ${album.photos.length}`}
                loading="lazy"
              />
              {isSelected && (
                <motion.div
                  className="selection-badge"
                  aria-hidden="true"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  ✓
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      <style>{`
        .gallery-view {
          padding: var(--space-4);
        }

        .gallery-selection-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-4);
          margin-bottom: var(--space-6);
          background-color: var(--color-surface);
          border-radius: var(--radius-lg);
        }

        .selection-count {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }

        .submit-btn {
          padding: var(--space-2) var(--space-4);
          background-color: var(--color-accent);
          color: var(--color-bg);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          transition: all var(--transition-fast);
        }

        .submit-btn:hover:not(:disabled) {
          background-color: var(--color-accent-hover);
        }

        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .photo-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-2);
        }

        .photo-item {
          position: relative;
          aspect-ratio: 1;
          border-radius: var(--radius-lg);
          overflow: hidden;
          cursor: pointer;
          border: 2px solid transparent;
          transition: border-color var(--transition-fast);
        }

        .photo-item:hover {
          border-color: var(--color-border);
        }

        .photo-item:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }

        .photo-item.selected {
          border-color: var(--color-accent);
        }

        .photo-item.disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .photo-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .selection-badge {
          position: absolute;
          top: var(--space-2);
          right: var(--space-2);
          width: 28px;
          height: 28px;
          background-color: var(--color-accent);
          color: var(--color-bg);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-sm);
          font-weight: var(--font-bold);
        }

        @media (min-width: 640px) {
          .photo-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .photo-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
      `}</style>
    </div>
    </ReducedMotionProvider>
  );
}
