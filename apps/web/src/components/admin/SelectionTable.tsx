import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';

interface SelectionTableProps {
  selections: Selection[];
}

export function SelectionTable({ selections }: SelectionTableProps) {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: shouldReduceMotion ? 0 : 0.05 },
    },
  };

  const rowVariants = {
    hidden: { opacity: 0, x: shouldReduceMotion ? 0 : -16 },
    show: { opacity: 1, x: 0 },
  };

  if (selections.length === 0) {
    return (
      <div className="state-container">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="No photos selected"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <p>No selections yet</p>
        <p>Selected photos will appear here</p>
      </div>
    );
  }

  return (
    <div className="selection-table-container" role="table">
      <div className="table-header" role="row">
        <span className="col-filename" role="columnheader">Filename</span>
        <span className="col-date" role="columnheader">Selected</span>
      </div>

      <motion.div
        className="table-body"
        role="rowgroup"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {selections.map((selection) => (
          <motion.div
            key={selection.id}
            className="table-row"
            role="row"
            variants={rowVariants}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <span className="col-filename filename" role="cell">
              {selection.photo.filename}
            </span>
            <span className="col-date date" role="cell">
              {formatDate(selection.selectedAt)}
            </span>
          </motion.div>
        ))}
      </motion.div>

      <style>{`
        .selection-table-container {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .table-header {
          display: grid;
          grid-template-columns: 1fr minmax(100px, 140px);
          gap: var(--space-4);
          padding: var(--space-3) var(--space-4);
          background-color: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
        }

        .table-header span {
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .table-body {
          max-height: 400px;
          overflow-y: auto;
        }

        .table-row {
          display: grid;
          grid-template-columns: 1fr minmax(100px, 140px);
          gap: var(--space-4);
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--color-border);
          transition: background-color var(--transition-fast);
        }

        .table-row:last-child {
          border-bottom: none;
        }

        .table-row:hover {
          background-color: var(--color-surface);
        }

        .filename {
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .date {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}