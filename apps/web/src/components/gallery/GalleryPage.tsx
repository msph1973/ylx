import React, { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PinEntry } from '@/components/gallery/PinEntry';
import { BlurImage } from '@/components/gallery/BlurImage';
import { useRealtime } from '@/hooks/useRealtime';
import { saveDraft, loadDraft, clearDraft } from '@/lib/selectionDraft';
import { fetchResumeSession } from '@/lib/gallerySessionClient';
import type { Photo } from '@ylx/shared';

const PhotoLightbox = lazy(() => import('@/components/gallery/PhotoLightbox').then(m => ({ default: m.PhotoLightbox })));

class LightboxErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[LightboxErrorBoundary]', error, info);
  }
  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="lightbox-error">
          Failed to load lightbox. Please try again.
        </div>
      );
    }
    return this.props.children;
  }
}

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
  lastUnlockedAt?: string | null;
  photos: Photo[];
}

interface GalleryPhotoTileProps {
  photo: Photo;
  index: number;
  totalPhotos: number;
  isSelected: boolean;
  isDisabled: boolean;
  isAboveFold: boolean;
  shouldReduceMotion: boolean | null;
  onOpen: (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

// Toggling one photo's selection only flips isSelected for that single tile,
// so this is memoized to keep the rest of the grid's JSX from being
// regenerated on every selection change.
function areGalleryPhotoTilePropsEqual(prev: GalleryPhotoTileProps, next: GalleryPhotoTileProps): boolean {
  return (
    prev.photo === next.photo &&
    prev.photo.id === next.photo.id &&
    prev.index === next.index &&
    prev.totalPhotos === next.totalPhotos &&
    prev.isSelected === next.isSelected &&
    prev.isDisabled === next.isDisabled &&
    prev.isAboveFold === next.isAboveFold &&
    prev.shouldReduceMotion === next.shouldReduceMotion &&
    prev.onOpen === next.onOpen &&
    prev.onKeyDown === next.onKeyDown
  );
}

const GalleryPhotoTile = React.memo(function GalleryPhotoTile({
  photo,
  index,
  totalPhotos,
  isSelected,
  isDisabled,
  isAboveFold,
  shouldReduceMotion,
  onOpen,
  onKeyDown,
}: GalleryPhotoTileProps) {
  return (
    <m.div
      data-index={index}
      role="button"
      tabIndex={0}
      aria-label={`View photo ${photo.filename}${isSelected ? ' (selected)' : ''}`}
      className={`photo-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shouldReduceMotion ? 0 : Math.min(index * 0.04, 0.4) }}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <BlurImage
        src={photo.thumbnailUrl}
        srcSet={photo.thumbnailSrcSet ?? undefined}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
        lqip={photo.lqip}
        loading={isAboveFold ? 'eager' : 'lazy'}
        alt={`Photo ${index + 1} of ${totalPhotos}`}
      />
      {isSelected && (
        <m.div
          className="selection-badge"
          aria-hidden="true"
          initial={{ scale: shouldReduceMotion ? 1 : 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: shouldReduceMotion ? 1 : 0 }}
        >
          ✓
        </m.div>
      )}
    </m.div>
  );
}, areGalleryPhotoTilePropsEqual);
GalleryPhotoTile.displayName = 'GalleryPhotoTile';

// Hoisted to module scope: this ~460-line stylesheet is identical on every
// render, so building it as a template literal inside the component (which
// re-renders frequently) was wasted work on every single render.
const GALLERY_VIEW_STYLES = `
        .gallery-view {
          --selection-bar-h: 76px;
          padding: var(--space-4);
          padding-bottom: calc(var(--selection-bar-h) + var(--space-4) + env(safe-area-inset-bottom));
        }

        /* Fixed to the bottom (thumb zone) so the primary action stays
           reachable one-handed no matter how long the photo grid is. */
        .gallery-selection-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-4);
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: var(--z-sticky);
          padding: var(--space-4);
          padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
          padding-left: max(var(--space-4), env(safe-area-inset-left));
          padding-right: max(var(--space-4), env(safe-area-inset-right));
          background-color: var(--color-surface);
          border-top: 1px solid var(--color-border);
        }

        .selection-count {
          flex: 1;
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }

        .submit-cancel-btn {
          min-height: var(--tap-target-min);
          padding: var(--space-2) var(--space-4);
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          font-weight: var(--font-medium);
        }

        .gallery-instructions {
          margin: 0 0 var(--space-4);
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          text-align: center;
        }

        .gallery-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: var(--space-2);
          padding: var(--space-8) var(--space-4);
        }

        .gallery-empty-title {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
        }

        .gallery-empty-body {
          color: var(--color-text-muted);
          max-width: 40ch;
        }

        .submit-btn {
          padding: var(--space-2) var(--space-4);
          min-height: var(--tap-target-min);
          background-color: var(--color-accent);
          color: var(--color-bg);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          transition: all var(--transition-fast);
        }

        @media (hover: hover) {
          .submit-btn:hover:not(:disabled) {
            background-color: var(--color-accent-hover);
          }
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
          content-visibility: auto;
          contain-intrinsic-size: auto 200px;
        }

        @media (hover: hover) {
          .photo-item:hover {
            border-color: var(--color-border);
          }
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

        .photo-item .blur-wrap {
          width: 100%;
          height: 100%;
        }

        .photo-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* Blur-up progressive loading (LQIP) */
        .blur-wrap {
          display: block;
          background-size: cover;
          background-position: center;
          overflow: hidden;
        }

        .blur-img {
          display: block;
          width: 100%;
          height: 100%;
          opacity: 0;
          transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .blur-img.loaded {
          opacity: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          .blur-img {
            transition: none;
          }
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
          background-color: var(--overlay-lightbox);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: var(--z-modal);
          padding: var(--space-4);
          padding-top: max(var(--space-4), env(safe-area-inset-top));
          padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
          padding-left: max(var(--space-4), env(safe-area-inset-left));
          padding-right: max(var(--space-4), env(safe-area-inset-right));
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: var(--tap-target-min);
          min-height: var(--tap-target-min);
          background: none;
          border: none;
          color: rgba(255,255,255,0.7);
          font-size: var(--text-xl);
          cursor: pointer;
          padding: var(--space-1);
          line-height: 1;
          transition: color var(--transition-fast);
        }

        @media (hover: hover) {
          .lightbox-close:hover {
            color: #fff;
          }
        }

        .lightbox-img {
          flex: 1;
          min-height: 0;
          max-height: 75vh;
          width: 100%;
          border-radius: var(--radius-md);
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
        }

        .lightbox-img img {
          max-height: 75vh;
          object-fit: contain;
        }

        .lightbox-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          padding-top: var(--space-3);
          gap: var(--space-3);
        }

        /* On narrow phones, the note input and the nav/select controls no
           longer fit on one row — give the note its own row instead of
           squeezing every control down to an unusable width. */
        @media (max-width: 480px) {
          .lightbox-note-input {
            order: 3;
            flex-basis: 100%;
          }
        }

        .lightbox-nav {
          min-width: var(--tap-target-min);
          min-height: var(--tap-target-min);
          background: none;
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: var(--radius-md);
          color: rgba(255,255,255,0.7);
          padding: var(--space-2) var(--space-4);
          font-size: var(--text-base);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        @media (hover: hover) {
          .lightbox-nav:hover:not(:disabled) {
            border-color: rgba(255,255,255,0.6);
            color: #fff;
          }
        }

        .lightbox-nav:disabled {
          opacity: 0.25;
          cursor: default;
        }

        .lightbox-select {
          min-height: var(--tap-target-min);
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

        @media (hover: hover) {
          .lightbox-select:hover:not(.selected) {
            border-color: var(--color-accent);
            color: var(--color-accent);
          }
        }

        .lightbox-note-input {
          flex: 1;
          min-height: var(--tap-target-min);
          padding: var(--space-2) var(--space-3);
          background-color: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: var(--radius-md);
          color: #fff;
          font-size: var(--text-sm);
          outline: none;
          transition: border-color var(--transition-fast);
        }

        /* No local ::placeholder rule here — global.css's input::placeholder
           already sets color: var(--color-text-muted) (≈6.7:1 contrast, fixing
           the previous rgba(255,255,255,0.4) that measured ~3.8:1, below the
           4.5:1 AA minimum) — a local override here would be a duplicate
           source of truth. */

        .lightbox-note-input:focus {
          border-color: var(--color-accent);
        }

        /* Unlock toast */
        .unlock-toast {
          position: fixed;
          bottom: calc(var(--selection-bar-h, 76px) + var(--space-4) + env(safe-area-inset-bottom));
          left: 50%;
          transform: translateX(-50%);
          background-color: var(--color-success);
          color: var(--color-bg);
          padding: var(--space-3) var(--space-6);
          border-radius: var(--radius-lg);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          z-index: var(--z-toast);
          max-width: calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right));
          text-align: center;
          pointer-events: none;
        }

        /* Submit error toast — same slot as the unlock toast, but
           dismissible since it reports a failure the user needs to notice
           (retryable action) rather than an ambient status change. */
        .submit-error-toast {
          position: fixed;
          bottom: calc(var(--selection-bar-h, 76px) + var(--space-4) + env(safe-area-inset-bottom));
          left: max(var(--space-4), env(safe-area-inset-left));
          right: max(var(--space-4), env(safe-area-inset-right));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          background-color: var(--color-error);
          color: var(--color-bg);
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-lg);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          z-index: var(--z-toast);
        }

        .submit-error-dismiss {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: var(--tap-target-min);
          min-height: var(--tap-target-min);
          background: none;
          border: none;
          color: inherit;
          font-size: var(--text-base);
          cursor: pointer;
        }

        /* Info toast (e.g. selection-limit reached) — same slot as the
           other status toasts, neutral tone since nothing failed. */
        .info-toast {
          position: fixed;
          bottom: calc(var(--selection-bar-h, 76px) + var(--space-4) + env(safe-area-inset-bottom));
          left: max(var(--space-4), env(safe-area-inset-left));
          right: max(var(--space-4), env(safe-area-inset-right));
          margin: 0 auto;
          max-width: 420px;
          text-align: center;
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text);
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-lg);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          z-index: var(--z-toast);
          pointer-events: none;
        }

        .lightbox-loading {
          position: fixed;
          inset: 0;
          z-index: var(--z-modal);
          background: rgba(0, 0, 0, 0.7);
        }

        .lightbox-error {
          position: fixed;
          inset: 0;
          z-index: var(--z-modal);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.9);
          color: #fff;
          font-size: 1rem;
        }
`;

function isAlbumLocked(album: AlbumData | null): boolean {
  return album?.status === 'locked' || album?.status === 'submitted';
}

// `fetch` rejects with a generic TypeError (message often just "Failed to
// fetch" / "Load failed") when the network itself is down — surfacing that
// raw text is meaningless on a flaky mobile connection, so translate it.
function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    return 'Could not connect. Please check your internet connection and try again.';
  }
  return err instanceof Error ? err.message : fallback;
}

export function GalleryPage({ slug }: GalleryPageProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Blocks the PIN screen until the resume-session check finishes, so a
  // returning visitor with a valid cookie doesn't see a PIN flash.
  const [sessionChecked, setSessionChecked] = useState(false);
  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photoNotes, setPhotoNotes] = useState<Map<string, string>>(new Map());
  const [showUnlockToast, setShowUnlockToast] = useState(false);
  const unlockToastTimeoutRef = useRef<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const confirmTimeoutRef = useRef<number | null>(null);
  // Guards against a fast double-tap/confirm firing a duplicate submit POST
  // while the first one is still in flight (see the submit button's disabled
  // condition below).
  const [isSubmitting, setIsSubmitting] = useState(false);
  const albumIdRef = useRef<string | null>(null);
  // Synchronous double-submit guard: `isSubmitting` state is async (a second
  // tap in the same tick as the first still reads `isSubmitting === false`),
  // so a ref is flipped before any await to make the guard race-free even
  // under the most rapid multi-taps. Mirrors the submit button's disabled
  // condition; this is the belt-and-suspenders layer.
  const isSubmittingRef = useRef(false);
  // Set inside the setSelectedPhotos updater when an over-limit tap is
  // rejected; the effect below fires the "reached the limit" toast on the
  // commit. A ref is used (not state) so setting it inside the updater is an
  // idempotent flag write that keeps the updater otherwise pure (no state
  // mutation, no render), and it lets us detect the rejection from within the
  // updater's race-free `prev` rather than from a possibly-stale closure.
  const noticedLimitRef = useRef(false);

  useEffect(() => {
    albumIdRef.current = album?.id ?? null;
  }, [album]);

  const realtimeCallbacks = useMemo(() => ({
    onAlbumUnlocked: () => {
      setAlbum((prev) => prev ? { ...prev, status: 'active' } : prev);
      setSelectedPhotos(new Set()); // server deleted existing selections on unlock
      setPhotoNotes(new Map()); // clear note drafts on unlock
      // The old draft describes selections the server just deleted — restoring
      // it later would mislead the client into thinking they were kept.
      if (albumIdRef.current) clearDraft(albumIdRef.current);
      setError(null); // drop any stale submit-error toast so it can't overlap the unlock toast
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

  // Cleanup toast timeouts on unmount
  useEffect(() => {
    return () => {
      if (unlockToastTimeoutRef.current !== null) {
        window.clearTimeout(unlockToastTimeoutRef.current);
      }
      if (noticeTimeoutRef.current !== null) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
      if (confirmTimeoutRef.current !== null) {
        window.clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimeoutRef.current !== null) window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimeoutRef.current = null;
    }, 2500);
  }, []);

  useRealtime(isAuthenticated ? (album?.id ?? null) : null, realtimeCallbacks);

  const restoreDraft = useCallback((albumData: AlbumData) => {
    if (albumData.status !== 'active') return;
    // Drafts saved before the album's most recent unlock describe selections
    // the server already deleted — never restore them.
    const unlockedAtMs = albumData.lastUnlockedAt ? Date.parse(albumData.lastUnlockedAt) : undefined;
    const draft = loadDraft(
      albumData.id,
      albumData.photos.map((p) => p.id),
      albumData.maxSelections,
      Number.isFinite(unlockedAtMs) ? unlockedAtMs : undefined
    );
    if (!draft) return;
    setSelectedPhotos(new Set(draft.photoIds));
    setPhotoNotes(new Map(Object.entries(draft.notes)));
    showNotice(
      `Draft restored — ${draft.photoIds.length} photo${draft.photoIds.length === 1 ? '' : 's'} selected`
    );
  }, [showNotice]);

  // Resume without re-entering the PIN when the signed 24h gallery cookie is
  // still valid (verify.ts set it on the first successful PIN entry). The
  // helper aborts after a bounded timeout so a stalled request can't leave
  // the visitor on the blank pre-PIN screen indefinitely.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resumed = await fetchResumeSession(slug);
      if (cancelled) return;
      if (resumed) {
        setAlbum(resumed);
        setIsAuthenticated(true);
        restoreDraft(resumed);
      }
      setSessionChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, restoreDraft]);

  // Autosave the in-progress selection (debounced) so a closed tab or reload
  // doesn't lose it. Saving an empty selection clears the stored draft.
  useEffect(() => {
    if (!isAuthenticated || !album || album.status !== 'active') return;
    const timer = window.setTimeout(() => {
      saveDraft(album.id, Array.from(selectedPhotos), Object.fromEntries(photoNotes));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, album, selectedPhotos, photoNotes]);

  // Report only the draft COUNT to the server (photo choices stay private
  // until submit) so the admin dashboard can show live progress. Longer
  // debounce than the local autosave — this one costs a network call — and
  // best-effort: failures are silently ignored.
  const lastSyncedCountRef = useRef<number | null>(null);
  // Base seq from Date.now() so a gallery reload doesn't restart at 0
  // while Redis still has the previous session's higher sequence.
  const seqRef = useRef(Date.now());
  useEffect(() => {
    if (!isAuthenticated || !album || album.status !== 'active') return;
    const count = selectedPhotos.size;
    if (lastSyncedCountRef.current === count) return;
    const timer = window.setTimeout(() => {
      const seq = seqRef.current++;
      const body = JSON.stringify({ count, seq });
      void fetch(`/api/gallery/${slug}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).then((response) => {
        // Only mark synced when the server accepted the write — a 4xx (auth
        // expiry, stale seq) must leave the ref stale so a later change
        // retries instead of being swallowed by the equality guard.
        if (response.ok) lastSyncedCountRef.current = count;
      }).catch(() => {});
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, album, selectedPhotos, slug]);

  // Flush the final count when the tab is backgrounded/closed before the
  // debounce fires — sendBeacon survives page teardown where fetch may not.
  // Also flush the localStorage draft synchronously: a toggle followed by an
  // immediate tab close lands inside the 500ms autosave window and would
  // otherwise lose the last change.
  const selectedCountRef = useRef(0);
  selectedCountRef.current = selectedPhotos.size;
  const selectedPhotosRef = useRef(selectedPhotos);
  selectedPhotosRef.current = selectedPhotos;
  const photoNotesRef = useRef(photoNotes);
  photoNotesRef.current = photoNotes;
  useEffect(() => {
    if (!isAuthenticated || !album || album.status !== 'active') return;
    const flush = () => {
      saveDraft(album.id, Array.from(selectedPhotosRef.current), Object.fromEntries(photoNotesRef.current));
      if (lastSyncedCountRef.current === selectedCountRef.current) return;
      const seq = seqRef.current++;
      try {
        const queued = navigator.sendBeacon(
          `/api/gallery/${slug}/draft`,
          new Blob([JSON.stringify({ count: selectedCountRef.current, seq })], { type: 'application/json' })
        );
        // sendBeacon returns true only when the payload was queued — that is
        // the one case where the count is actually on its way. Leaving the
        // ref stale on a false return lets the debounced sync retry after
        // bfcache restore.
        if (queued) lastSyncedCountRef.current = selectedCountRef.current;
      } catch {
        // sendBeacon unsupported/blocked — the debounced sync remains the fallback.
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [isAuthenticated, album, slug]);

  const handlePinSubmit = useCallback(async (pin: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/gallery/${slug}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      // The API returns a distinct, meaningful `error` message even on
      // failure (429 rate-limited, 404 unknown slug, 401 wrong PIN) — read it
      // instead of collapsing every non-OK response into a hardcoded
      // "Invalid PIN", which is actively misleading for the other two cases.
      const data = (await response.json().catch(() => ({}))) as { album?: AlbumData; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }
      if (!data.album) {
        throw new Error('Verification failed');
      }

      setAlbum(data.album);
      setIsAuthenticated(true);
      restoreDraft(data.album);
    } catch (err) {
      setError(getErrorMessage(err, 'Verification failed'));
    } finally {
      setIsLoading(false);
    }
  }, [slug, restoreDraft]);

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  // Stable across every tile (reads the index off the event target) so
  // a re-render triggered by toggling one photo's selection doesn't have
  // to hand every tile a brand-new per-index closure.
  const handlePhotoTileOpen = useCallback((event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    const indexAttr = event.currentTarget.dataset.index;
    if (indexAttr === undefined) return;
    const index = Number(indexAttr);
    if (Number.isNaN(index)) return;
    openLightbox(index);
  }, [openLightbox]);

  const handlePhotoTileKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePhotoTileOpen(event);
    }
  }, [handlePhotoTileOpen]);

  const togglePhoto = useCallback((photoId: string) => {
    // The "at selection limit" notice is a side effect (setNotice plus a
    // window.setTimeout to clear it) and must never run inside the updater
    // passed to setSelectedPhotos — React can invoke that function more than
    // once (StrictMode / concurrent features), which would duplicate the
    // toast and leak a stray timer, and updaters must stay pure. So the
    // rejection decision is made *inside* the updater (which sees the latest,
    // race-free `prev`) and merely recorded on an idempotent ref; the actual
    // toast fires from the effect below after the commit. Without this, a
    // fast second tap (before React re-renders after the first) reads an
    // out-of-date size from the `selectedPhotos` closure and the over-limit
    // rejection is silently dropped instead of notifying the user.
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else if (album && next.size < album.maxSelections) {
        next.add(photoId);
      } else if (album) {
        // At capacity and this photo isn't already selected — the tap is
        // being rejected. Flag it on a ref (idempotent, not React state) so
        // the commit effect below surfaces the limit message.
        noticedLimitRef.current = true;
      }
      return next;
    });
  }, [album]);

  useEffect(() => {
    if (noticedLimitRef.current && album) {
      noticedLimitRef.current = false;
      showNotice(`You've reached the limit of ${album.maxSelections} photos. Deselect one to choose another.`);
    }
  }, [album, selectedPhotos, showNotice]);

  const setNote = useCallback((photoId: string, note: string) => {
    setPhotoNotes((prev) => {
      const next = new Map(prev);
      if (note) next.set(photoId, note);
      else next.delete(photoId);
      return next;
    });
  }, []);

  const doSubmit = useCallback(async () => {
    if (!album || selectedPhotos.size === 0 || isAlbumLocked(album) || isSubmitting || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/gallery/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections: Array.from(selectedPhotos).map((photoId) => ({
            photoId,
            notes: photoNotes.get(photoId) || undefined,
          })),
        }),
      });

      // The API returns a distinct, meaningful `error` message even on
      // failure (403 expired PIN session, 409 locked/already-submitted, 400
      // over the selection cap) — read it instead of a hardcoded
      // "Submission failed" for every non-OK response.
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        // A 403 means the 24h gallery session cookie has expired — the PIN
        // entry screen must be shown again so the user re-verifies instead of
        // just seeing an error toast they can't act on.
        if (response.status === 403) {
          setIsAuthenticated(false);
        }
        throw new Error(data.error || 'Submission failed');
      }

      // Server sets status to 'submitted' on submit (three-state model: active → submitted → locked).
      setAlbum((prev) => prev ? { ...prev, status: 'submitted' } : prev);
      // The selection is now persisted server-side; the local draft is spent.
      clearDraft(album.id);
    } catch (err) {
      setError(getErrorMessage(err, 'Submission failed'));
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [album, selectedPhotos, photoNotes, slug, isSubmitting]);

  // Submitting locks the gallery — the client can't change their mind
  // afterwards without the photographer unlocking it — so a stray tap
  // shouldn't be able to finalize it. First tap arms a confirmation instead
  // of submitting immediately.
  const handleSubmitTap = useCallback(() => {
    if (!confirmingSubmit) {
      setConfirmingSubmit(true);
      if (confirmTimeoutRef.current !== null) window.clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingSubmit(false);
        confirmTimeoutRef.current = null;
      }, 5000);
      return;
    }
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    setConfirmingSubmit(false);
    void doSubmit();
  }, [confirmingSubmit, doSubmit]);

  const cancelSubmitConfirm = useCallback(() => {
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    setConfirmingSubmit(false);
  }, []);

  if (!isAuthenticated) {
    // Hold back the PIN screen for the brief resume-session check — showing
    // it and then yanking it away reads as a glitch for returning visitors.
    if (!sessionChecked) {
      return <div className="gallery-auth" aria-busy="true" />;
    }
    return (
      <div className="gallery-auth">
        <LazyMotion features={domAnimation} strict>
        <m.div
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
        </m.div>
        </LazyMotion>

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

  const hasPhotos = (album?.photos.length ?? 0) > 0;

  return (
    <div className="gallery-view">
      <LazyMotion features={domAnimation} strict>
      <div className="gallery-selection-bar">
        <span className="selection-count">
          {confirmingSubmit
            ? 'Selections are final once submitted. Send now?'
            : `${selectedPhotos.size} / ${album?.maxSelections} selected`}
        </span>
        {confirmingSubmit && (
          <button
            type="button"
            className="submit-cancel-btn"
            onClick={cancelSubmitConfirm}
          >
            Cancel
          </button>
        )}
        <button
          className="submit-btn"
          onClick={handleSubmitTap}
          disabled={selectedPhotos.size === 0 || isAlbumLocked(album) || isSubmitting}
        >
          {isAlbumLocked(album) ? 'Submitted' : confirmingSubmit ? 'Yes, Submit' : 'Submit Selection'}
        </button>
      </div>

      {hasPhotos && (
        <p className="gallery-instructions">
          Tap a photo to preview it, then select up to {album?.maxSelections}.
        </p>
      )}

      {!hasPhotos ? (
        <div className="gallery-empty">
          <p className="gallery-empty-title">No photos yet</p>
          <p className="gallery-empty-body">
            Your photographer hasn't uploaded any photos to this gallery yet. Check back soon.
          </p>
        </div>
      ) : (
      <m.div
        className="photo-grid"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
      >
        {album?.photos.map((photo, index) => (
          <GalleryPhotoTile
            key={photo.id}
            photo={photo}
            index={index}
            totalPhotos={album.photos.length}
            isSelected={selectedPhotos.has(photo.id)}
            isDisabled={isAlbumLocked(album)}
            // First row (visible without scrolling on any device) loads
            // eagerly at high priority; the rest stay lazy so the LCP
            // candidate isn't competing with dozens of below-the-fold requests.
            isAboveFold={index < 4}
            shouldReduceMotion={shouldReduceMotion}
            onOpen={handlePhotoTileOpen}
            onKeyDown={handlePhotoTileKeyDown}
          />
        ))}
      </m.div>
      )}

      <AnimatePresence>
        {showUnlockToast && (
          <m.div
            className="unlock-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
          >
            Gallery unlocked — please reselect and resubmit your photos
          </m.div>
        )}
      </AnimatePresence>

      {/* Tapping a photo past the selection limit used to be a silent no-op
          — this makes the limit visible instead of looking like a bug. */}
      <AnimatePresence>
        {notice && (
          <m.div
            className="info-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
          >
            {notice}
          </m.div>
        )}
      </AnimatePresence>

      {/* Submission can fail on a flaky mobile connection — without this,
          a failed submit looked identical to a successful one (silent). */}
      <AnimatePresence>
        {error && (
          <m.div
            className="submit-error-toast"
            role="alert"
            aria-live="assertive"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
          >
            <span>{error}</span>
            <button
              type="button"
              className="submit-error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxIndex !== null && album && (
          <LightboxErrorBoundary>
            <Suspense fallback={<div className="lightbox-loading" />}>
              <PhotoLightbox
                key="lightbox"
                photos={album.photos}
                currentIndex={lightboxIndex}
                isSelected={selectedPhotos.has(album.photos[lightboxIndex]?.id ?? '')}
                isDisabled={isAlbumLocked(album)}
                note={photoNotes.get(album.photos[lightboxIndex]?.id ?? '')}
                onNoteChange={
                  !isAlbumLocked(album)
                    ? (note) => setNote(album.photos[lightboxIndex]?.id ?? '', note)
                    : undefined
                }
                onClose={closeLightbox}
                onNavigate={setLightboxIndex}
                onToggleSelect={togglePhoto}
              />
            </Suspense>
          </LightboxErrorBoundary>
        )}
      </AnimatePresence>
      </LazyMotion>

      <style>{GALLERY_VIEW_STYLES}</style>
    </div>
  );
}
