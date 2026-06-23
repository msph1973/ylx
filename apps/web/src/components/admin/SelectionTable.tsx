import React from 'react';
import { motion } from 'framer-motion';
import type { Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';

interface SelectionTableProps {
  selections: Selection[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const rowVariants = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0 },
};

export function SelectionTable({ selections }: SelectionTableProps) {
  if (selections.length === 0) {
    return (
      <div className="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <p>No selections yet</p>
        <p className="empty-hint">Selected photos will appear here</p>

        <style>{`
          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-12);
            gap: var(--space-3);
            color: var(--color-text-muted);
          }

          .empty-state p {
            margin: 0;
            font-size: var(--text-base);
          }

          .empty-hint {
            font-size: var(--text-sm);
            opacity: 0.7;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="selection-table-container">
      <div className="table-header">
        <span className="col-filename">Filename</span>
        <span className="col-date">Selected</span>
      </div>

      <motion.div
        className="table-body"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {selections.map((selection) => (
          <motion.div
            key={selection.id}
            className="table-row"
            variants={rowVariants}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <span className="col-filename filename">
              {selection.photo.filename}
            </span>
            <span className="col-date date">
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
          grid-template-columns: 1fr 140px;
          gap: var(--space-4);
          padding: var(--space-3) var(--space-4);
          background-color: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
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
          grid-template-columns: 1fr 140px;
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
          font-family: var(--font-mono, monospace);
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