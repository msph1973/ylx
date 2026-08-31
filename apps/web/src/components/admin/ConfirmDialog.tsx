import React, { useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  /** Body content — plain text or rich nodes. */
  children: React.ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  isBusy?: boolean;
  /** Optional inline error shown above the actions. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation modal shared across admin destructive actions.
 * Traps focus, restores it on close, closes on Escape / backdrop click, and
 * reduces motion when requested.
 */
export function ConfirmDialog({
  isOpen,
  title,
  children,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancel',
  isBusy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  const titleId = React.useId();

  const handleCancel = useCallback(() => {
    if (!isBusy) onCancel();
  }, [isBusy, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
        >
          <motion.div
            ref={dialogRef}
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.96, y: shouldReduceMotion ? 0 : 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.96, y: shouldReduceMotion ? 0 : 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30, duration: shouldReduceMotion ? 0 : undefined }}
          >
            <h3 className="confirm-title" id={titleId}>{title}</h3>
            <div className="confirm-body">{children}</div>

            {error && <p className="confirm-error" role="alert">{error}</p>}

            <div className="confirm-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={handleCancel}
                disabled={isBusy}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className="btn-confirm-delete"
                onClick={onConfirm}
                disabled={isBusy}
                aria-busy={isBusy}
              >
                {isBusy && <span className="btn-spinner" aria-hidden="true" />}
                {isBusy ? (busyLabel ?? confirmLabel) : confirmLabel}
              </button>
            </div>
          </motion.div>

          <style>{`
            .confirm-backdrop {
              position: fixed;
              inset: 0;
              background-color: var(--overlay-scrim);
              backdrop-filter: blur(4px);
              display: flex;
              align-items: center;
              justify-content: center;
              padding: var(--space-4);
              z-index: var(--z-modal);
            }

            .confirm-dialog {
              background-color: var(--color-surface);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-2xl);
              padding: var(--space-6);
              max-width: 420px;
              width: 100%;
              box-shadow: 0 24px 64px var(--overlay-shadow-dialog);
            }

            .confirm-dialog:focus {
              outline: none;
            }

            .confirm-title {
              font-size: var(--text-xl);
              font-weight: var(--font-semibold);
              color: var(--color-text);
              margin: 0 0 var(--space-3);
            }

            .confirm-body {
              font-size: var(--text-sm);
              color: var(--color-text-muted);
              line-height: 1.6;
              margin: 0 0 var(--space-6);
            }

            .confirm-body strong {
              color: var(--color-text);
              font-weight: var(--font-semibold);
            }

            .confirm-error {
              margin: 0 0 var(--space-4);
              padding: var(--space-2-5) var(--space-3);
              font-size: var(--text-sm);
              color: var(--color-error);
              background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
              border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
              border-radius: var(--radius-md);
            }

            .confirm-actions {
              display: flex;
              justify-content: flex-end;
              gap: var(--space-3);
            }

            .btn-cancel {
              padding: var(--space-2-5) var(--space-5);
              min-height: var(--tap-target-min);
              background-color: transparent;
              color: var(--color-text-muted);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-md);
              font-size: var(--text-sm);
              font-weight: var(--font-medium);
              cursor: pointer;
              transition: background-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
            }

            .btn-cancel:hover:not(:disabled) {
              background-color: var(--color-bg);
              color: var(--color-text);
            }

            @media (prefers-reduced-motion: no-preference) {
              .btn-cancel:active:not(:disabled),
              .btn-confirm-delete:active:not(:disabled) {
                transform: scale(var(--press-scale));
              }
            }

            .btn-confirm-delete {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: var(--space-2);
              padding: var(--space-2-5) var(--space-5);
              min-height: var(--tap-target-min);
              background-color: var(--color-error);
              color: var(--color-bg);
              border: none;
              border-radius: var(--radius-md);
              font-size: var(--text-sm);
              font-weight: var(--font-medium);
              cursor: pointer;
              transition: background-color var(--transition-fast), transform var(--transition-fast);
            }

            .btn-confirm-delete:hover:not(:disabled) {
              background-color: color-mix(in srgb, var(--color-error) 85%, var(--color-bg));
            }

            .btn-cancel:disabled,
            .btn-confirm-delete:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }

            @media (max-width: 480px) {
              .confirm-actions {
                flex-direction: column;
              }

              .btn-cancel,
              .btn-confirm-delete {
                width: 100%;
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
