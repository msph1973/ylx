import React, { useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Photo } from '@ylx/shared';

interface PhotoLightboxProps {
  photos: Photo[];
  currentIndex: number;
  isSelected: boolean;
  isDisabled: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onToggleSelect: (photoId: string) => void;
}

export function PhotoLightbox({
  photos,
  currentIndex,
  isSelected,
  isDisabled,
  onClose,
  onNavigate,
  onToggleSelect,
}: PhotoLightboxProps) {
  const shouldReduceMotion = useReducedMotion();
  const photo = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
    else if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext, photos]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!photo) return null;

  return (
    <motion.div
      className="lightbox-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${currentIndex + 1} of ${photos.length}`}
    >
      <motion.div
        className="lightbox-content"
        initial={{ scale: shouldReduceMotion ? 1 : 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: shouldReduceMotion ? 1 : 0.95, opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lightbox-header">
          <span className="lightbox-counter">{currentIndex + 1} / {photos.length}</span>
          <span className="lightbox-filename">{photo.filename}</span>
          <button className="lightbox-close" onClick={onClose} aria-label="Close lightbox">✕</button>
        </div>

        <img
          className="lightbox-img"
          src={photo.url}
          alt={`Photo ${currentIndex + 1} of ${photos.length}: ${photo.filename}`}
        />

        <div className="lightbox-footer">
          <button
            className="lightbox-nav"
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={!hasPrev}
            aria-label="Previous photo"
          >
            ←
          </button>
          {!isDisabled && (
            <button
              className={`lightbox-select ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggleSelect(photo.id)}
              aria-pressed={isSelected}
            >
              {isSelected ? '✓ Selected' : 'Select'}
            </button>
          )}
          <button
            className="lightbox-nav"
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={!hasNext}
            aria-label="Next photo"
          >
            →
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
