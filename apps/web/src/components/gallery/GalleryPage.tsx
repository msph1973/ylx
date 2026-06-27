import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PinEntry } from '@/components/gallery/PinEntry';
import { PhotoLightbox } from '@/components/gallery/PhotoLightbox';
import { useRealtime } from '@/hooks/useRealtime';
import type { Photo } from '@ylx/shared';

interface GalleryPageProps {
  slug: string;
}

interface AlbumData {
  id: string;
  title: string;
  clientName: string;
  eventDate: string;
  maxSelections: number;
  status: string;
  photos: Photo[];
}

function isAlbumLocked(album: AlbumData | null): boolean {
  return album?.status === 'locked' || album?.status === 'submitted';
}

export function GalleryPage({ slug }: GalleryPageProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showUnlockToast, setShowUnlockToast] = useState(false);
  const unlockToastTimeoutRef = useRef<number | null>(null);

  const realtimeCallbacks = useMemo(() => ({
    onAlbumUnlocked: () => {
      setAlbum((prev) => prev ? { ...prev, status: 'active' } : prev);
      setShowUnlockToast(true);
      if (unlockToastTimeoutRef.current !== null) {
        window.clearTimeout(unlockToastTimeoutRef.current);
      }
      unlockToastTimeoutRef.current = window.setTimeout(() => {
        setShowUnlockToast(false);
        unlockToastTimeoutRef.current = null;
      }, 4000);
    },
  }), []);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (unlockToastTimeoutRef.current !== null) {
        window.clearTimeout(unlockToastTimeoutRef.current);
      }
    };
  }, []);

  useRealtime(isAuthenticated ? (album?.id ?? null) : null, realtimeCallbacks);

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
      setAlbum(data.album);
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

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
    if (!album || selectedPhotos.size === 0 || isAlbumLocked(album)) return;

    try {
      const response = await fetch(`/api/gallery/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: Array.from(selectedPhotos) }),
      });

      if (!response.ok) {
        throw new Error('Submission failed');
      }

      setAlbum((prev) => prev ? { ...prev, status: 'locked' } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  }, [album, selectedPhotos, slug]);

  if (!isAuthenticated) {
    return (
      <div className="gallery-auth">
        <motion.div
          className="gallery-auth-content"
          initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
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
    );
  }

  return (
    <div className="gallery-view">
      <div className="gallery-selection-bar">
        <span className="selection-count">
          {selectedPhotos.size} / {album?.maxSelections} selected
        </span>
        <button
          className="submit-btn"
          onClick={handleSubmit}
          disabled={selectedPhotos.size === 0 || isAlbumLocked(album)}
        >
          {isAlbumLocked(album) ? 'Submitted' : 'Submit Selection'}
        </button>
      </div>

      <motion.div
        className="photo-grid"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
      >
        {album?.photos.map((photo, index) => {
          const isSelected = selectedPhotos.has(photo.id);
          const isDisabled = isAlbumLocked(album);
          return (
            <motion.div
              key={photo.id}
              role="button"
              tabIndex={0}
              aria-label={`View photo ${photo.filename}${isSelected ? ' (selected)' : ''}`}
              className={`photo-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : Math.min(index * 0.04, 0.4) }}
              onClick={() => openLightbox(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openLightbox(index);
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
                  initial={{ scale: shouldReduceMotion ? 1 : 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: shouldReduceMotion ? 1 : 0 }}
                >
                  ✓
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      <AnimatePresence>
        {showUnlockToast && (
          <motion.div
            className="unlock-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
          >
            Gallery unlocked — you can update your selection
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxIndex !== null && album && (
          <PhotoLightbox
            key="lightbox"
            photos={album.photos}
            currentIndex={lightboxIndex}
            isSelected={selectedPhotos.has(album.photos[lightboxIndex]?.id ?? '')}
            isDisabled={isAlbumLocked(album)}
            onClose={closeLightbox}
            onNavigate={setLightboxIndex}
            onToggleSelect={togglePhoto}
          />
        )}
      </AnimatePresence>

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

        /* Lightbox */
        .lightbox-backdrop {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.92);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: var(--space-4);
        }

        .lightbox-content {
          display: flex;
          flex-direction: column;
          max-width: 90vw;
          max-height: 90vh;
          width: 100%;
        }

        .lightbox-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding-bottom: var(--space-3);
          color: rgba(255,255,255,0.7);
          font-size: var(--text-sm);
        }

        .lightbox-counter {
          font-variant-numeric: tabular-nums;
        }

        .lightbox-filename {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: var(--font-mono, monospace);
          font-size: var(--text-xs);
        }

        .lightbox-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.7);
          font-size: var(--text-xl);
          cursor: pointer;
          padding: var(--space-1);
          line-height: 1;
          transition: color var(--transition-fast);
        }

        .lightbox-close:hover {
          color: #fff;
        }

        .lightbox-img {
          flex: 1;
          min-height: 0;
          object-fit: contain;
          max-height: 75vh;
          width: 100%;
          border-radius: var(--radius-md);
        }

        .lightbox-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: var(--space-3);
          gap: var(--space-3);
        }

        .lightbox-nav {
          background: none;
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: var(--radius-md);
          color: rgba(255,255,255,0.7);
          padding: var(--space-2) var(--space-4);
          font-size: var(--text-base);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .lightbox-nav:hover:not(:disabled) {
          border-color: rgba(255,255,255,0.6);
          color: #fff;
        }

        .lightbox-nav:disabled {
          opacity: 0.25;
          cursor: default;
        }

        .lightbox-select {
          padding: var(--space-2) var(--space-6);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
          background-color: transparent;
          border: 1px solid rgba(255,255,255,0.4);
          color: rgba(255,255,255,0.8);
        }

        .lightbox-select.selected {
          background-color: var(--color-accent);
          border-color: var(--color-accent);
          color: var(--color-bg);
        }

        .lightbox-select:hover:not(.selected) {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }

        /* Unlock toast */
        .unlock-toast {
          position: fixed;
          bottom: var(--space-6);
          left: 50%;
          transform: translateX(-50%);
          background-color: var(--color-success);
          color: #fff;
          padding: var(--space-3) var(--space-6);
          border-radius: var(--radius-lg);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          z-index: 200;
          white-space: nowrap;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
