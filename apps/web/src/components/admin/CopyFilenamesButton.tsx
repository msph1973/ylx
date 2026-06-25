import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CopyFilenamesButtonProps {
  filenames: string[];
}

export function CopyFilenamesButton({ filenames }: CopyFilenamesButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const handleCopy = async () => {
    const text = filenames.join(', ');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 2000);
    }
  };

  return (
    <div className="copy-filenames-wrapper">
      <button
        className="copy-btn"
        onClick={handleCopy}
        disabled={filenames.length === 0}
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
        Copy Filenames
      </button>

      <div aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {copied && (
          <motion.div
            className="copied-feedback"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
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
        {copyError && (
          <motion.div
            className="copy-error-feedback"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
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
          gap: var(--space-3);
          position: relative;
        }

        .copy-btn {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
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

        .copy-error-feedback {
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