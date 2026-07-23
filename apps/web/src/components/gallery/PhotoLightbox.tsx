import React, { useEffect, useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BlurImage } from '@/components/gallery/BlurImage';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { Photo } from '@ylx/shared';
import { MAX_TEXT_LENGTH } from '@ylx/sanity/lib/constants';

interface PhotoLightboxProps {
  photos: Photo[];
  currentIndex: number;
  isSelected: boolean;
  isDisabled: boolean;
  note?: string;
  onNoteChange?: (note: string) => void;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onToggleSelect: (photoId: string) => void;
}

export function PhotoLightbox({
  photos,
  currentIndex,
  isSelected,
  isDisabled,
  note,
  onNoteChange,
  onClose,
  onNavigate,
  onToggleSelect,
}: PhotoLightboxProps) {
  const shouldReduceMotion = useReducedMotion();
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
  const photo = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    // Skip arrow-key navigation while the note input is focused, otherwise
    // repositioning the text cursor jumps to another photo and discards the draft.
    const isTextInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (isTextInput) return;
    if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
    else if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Swipe-to-navigate on touch devices — mirrors the arrow-key/button nav
  // above but for the thumb, since there's no hover/keyboard on a phone.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD_PX = 50;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Ignore multi-touch gestures (e.g. pinch-zoom) so they don't trigger swipes.
    if (e.touches.length !== 1) {
      touchStart.current = null;
      return;
    }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    // Ignore if it was part of a multi-touch gesture (fingers still down, or
    // more than one finger lifted at once).
    if (e.touches.length > 0 || e.changedTouches.length !== 1) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    // Ignore small movements and mostly-vertical swipes so the gesture
    // doesn't fight with the browser's own vertical scroll/dismiss.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;

    if (dx > 0 && hasPrev) onNavigate(currentIndex - 1);
    else if (dx < 0 && hasNext) onNavigate(currentIndex + 1);
  }, [currentIndex, hasPrev, hasNext, onNavigate]);

  // Interrupted gestures (e.g. an incoming call, system gesture nav) fire
  // touchcancel instead of touchend — drop the in-progress swipe so a stale
  // start point can't be paired with a later, unrelated touchend.
  const handleTouchCancel = useCallback(() => {
    touchStart.current = null;
  }, []);

  // Without this, the background gallery page can still rubber-band/scroll
  // behind the fixed-position backdrop on mobile Safari (e.g. while swiping
  // near an edge, or when the note input's focus triggers an auto-scroll) —
  // lock it for as long as the lightbox is mounted, restore on close. On
  // desktop, hiding the scrollbar shrinks the usable viewport width and
  // causes a layout jump — compensate with right padding equal to the
  // scrollbar's own width so the page doesn't shift under the modal.
  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  if (!photo) return null;

  return (
    // The backdrop has no `initial`/`animate` opacity fade-IN: fading in from
    // transparent briefly let the page content behind it (e.g. the gallery
    // instructions text) show through — confirmed visually during mobile
    // testing. It's full-opaque from the first frame instead. The fade-OUT on
    // close is kept (`exit`/`transition` below) since there's no bleed-through
    // risk while the lightbox is already closing.
    <motion.div
      className="lightbox-backdrop"
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${currentIndex + 1} of ${photos.length}`}
    >
      <motion.div
        ref={focusTrapRef}
        className="lightbox-content"
        initial={{ scale: shouldReduceMotion ? 1 : 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: shouldReduceMotion ? 1 : 0.95, opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="lightbox-header">
          {/* Announces the new position to screen readers on arrow/swipe navigation,
              since navigating doesn't remount the dialog (no fresh aria-label read). */}
          <span className="lightbox-counter" aria-live="polite" aria-atomic="true">{currentIndex + 1} / {photos.length}</span>
          <span className="lightbox-filename">{photo.filename}</span>
          <button className="lightbox-close" onClick={onClose} aria-label="Close lightbox">✕</button>
        </div>

        <BlurImage
          key={photo.id}
          className="lightbox-img"
          src={photo.url}
          lqip={photo.lqip}
          loading="eager"
          alt={`Photo ${currentIndex + 1} of ${photos.length}: ${photo.filename}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
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
          {!isDisabled && onNoteChange && (
            <input
              className="lightbox-note-input"
              type="text"
              placeholder="Add a note…"
              value={note ?? ''}
              onChange={(e) => onNoteChange(e.target.value)}
              aria-label={`Note for photo ${currentIndex + 1}`}
              maxLength={MAX_TEXT_LENGTH}
            />
          )}
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
