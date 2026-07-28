import React, { useState, useId } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { Selection } from '@ylx/shared';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import {
  formatSelections,
  EXPORT_FORMATS,
  EXPORT_FORMAT_LABELS,
  type ExportFormat,
} from '../../lib/selectionExport';

interface CopyFilenamesButtonProps {
  selections: Selection[];
}

export function CopyFilenamesButton({ selections }: CopyFilenamesButtonProps) {
  const { copied, error, copy } = useCopyToClipboard(2000);
  const shouldReduceMotion = useReducedMotion();
  const [format, setFormat] = useState<ExportFormat>('comma');
  const formatSelectId = useId();

  const handleCopy = () => {
    copy(formatSelections(selections, format));
  };

  return (
    <div className="copy-filenames-wrapper">
      <label className="sr-only" htmlFor={formatSelectId}>
        Copy format
      </label>
      <select
        id={formatSelectId}
        className="format-select"
        value={format}
        onChange={(e) => setFormat(e.target.value as ExportFormat)}
      >
        {EXPORT_FORMATS.map((value) => (
          <option key={value} value={value}>
            {EXPORT_FORMAT_LABELS[value]}
          </option>
        ))}
      </select>

      <button
        className="copy-btn"
        onClick={handleCopy}
        disabled={selections.length === 0}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {format === 'csv' ? 'Copy CSV' : 'Copy Filenames'}
      </button>

      <div aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {copied && (
          <motion.div
            className="copied-feedback"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={shouldReduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 300, damping: 25 }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied!
          </motion.div>
        )}
        {error && (
          <motion.div
            className="error-feedback"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={shouldReduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 300, damping: 25 }}
          >
            Copy failed
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <style>{`
        .copy-filenames-wrapper {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--space-3);
          position: relative;
        }

        /* On narrow screens .section-actions (AlbumDetail) becomes a 2-col
           grid; claim the full row and stack the controls so neither the
           select nor the button overflows its cell. */
        @media (max-width: 480px) {
          .copy-filenames-wrapper {
            grid-column: 1 / -1;
          }

          .copy-filenames-wrapper .format-select,
          .copy-filenames-wrapper .copy-btn {
            flex: 1 1 100%;
            justify-content: center;
          }
        }

        .format-select {
          min-height: var(--tap-target-min);
          padding: var(--space-2) var(--space-3);
          background-color: var(--color-surface);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          cursor: pointer;
        }

        .format-select:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }

        .copy-btn {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          min-height: var(--tap-target-min);
          background-color: var(--color-accent);
          color: var(--color-bg);
          border: none;
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .copy-btn:hover:not(:disabled) {
          background-color: var(--color-accent-hover);
        }

        .copy-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .copied-feedback {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          color: var(--color-success);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
        }

        .error-feedback {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          color: var(--color-error);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
        }
      `}</style>
    </div>
  );
}