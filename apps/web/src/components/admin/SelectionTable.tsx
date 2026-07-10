import React, { useState, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';

interface SelectionTableProps {
  selections: Selection[];
  onReplySaved?: () => void;
}

export function SelectionTable({ selections, onReplySaved }: SelectionTableProps) {
  const shouldReduceMotion = useReducedMotion();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const handleSaveReply = useCallback(async (selectionId: string) => {
    setIsSaving(true);
    setReplyError(null);
    try {
      const response = await fetch(`/api/admin/selections/${selectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photographerReply: replyText }),
      });
      if (!response.ok) throw new Error('Failed to save reply');
      setReplyingTo(null);
      setReplyText('');
      onReplySaved?.();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [replyText, onReplySaved]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: shouldReduceMotion ? 0 : 0.04 } },
  };

  const rowVariants = {
    hidden: { opacity: 0, x: shouldReduceMotion ? 0 : -12 },
    show: { opacity: 1, x: 0 },
  };

  if (selections.length === 0) {
    return (
      <div className="state-container">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="No photos selected">
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
        <span className="col-thumb" role="columnheader" aria-label="Preview" />
        <span className="col-filename" role="columnheader">Filename</span>
        <span className="col-notes" role="columnheader">Notes</span>
        <span className="col-date" role="columnheader">Selected</span>
      </div>

      <motion.div className="table-body" role="rowgroup" variants={containerVariants} initial="hidden" animate="show">
        {selections.map((selection) => {
          const thumbnailUrl = selection.photo.thumbnailUrl;
          const isReplying = replyingTo === selection.id;
          return (
            <motion.div
              key={selection.id}
              className="table-row"
              role="row"
              variants={rowVariants}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <span className="col-thumb" role="cell">
                {thumbnailUrl ? (
                  <img className="thumb" src={thumbnailUrl} alt="" loading="lazy" draggable={false} />
                ) : (
                  <span className="thumb thumb-placeholder" aria-hidden="true" />
                )}
              </span>
              <span className="col-filename filename" role="cell">{selection.photo.filename}</span>
              <span className="col-notes notes-cell" role="cell">
                {selection.notes && (
                  <div className="note-line">
                    <span className="note-label">Client:</span> {selection.notes}
                  </div>
                )}
                {selection.photographerReply && (
                  <div className="note-line reply-line">
                    <span className="note-label">You:</span> {selection.photographerReply}
                  </div>
                )}
                {!selection.photographerReply && !isReplying && (
                  <button
                    className="reply-btn"
                    onClick={() => {
                      setReplyingTo(selection.id);
                      setReplyText('');
                    }}
                  >
                    Reply
                  </button>
                )}
                {isReplying && (
                  <div className="reply-form">
                    <input
                      className="reply-input"
                      type="text"
                      placeholder="Your reply…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={isSaving}
                    />
                    <button
                      className="reply-save"
                      onClick={() => void handleSaveReply(selection.id)}
                      disabled={isSaving || !replyText.trim()}
                    >
                      {isSaving ? '…' : 'Save'}
                    </button>
                    <button
                      className="reply-cancel"
                      onClick={() => { setReplyingTo(null); setReplyText(''); setReplyError(null); }}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                    {replyError && (
                      <span className="reply-error" role="alert">{replyError}</span>
                    )}
                  </div>
                )}
              </span>
              <span className="col-date date" role="cell">{formatDate(selection.selectedAt)}</span>
            </motion.div>
          );
        })}
      </motion.div>

      <style>{`
        .selection-table-container {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        @media (max-width: 480px) {
          .selection-table-container {
            overflow-x: auto;
          }

          .table-header,
          .table-row {
            min-width: 320px;
            padding-left: var(--space-3);
            padding-right: var(--space-3);
          }
        }

        .table-header,
        .table-row {
          display: grid;
          grid-template-columns: 44px 1fr 1fr minmax(92px, 132px);
          gap: var(--space-3);
          align-items: center;
          padding: var(--space-2) var(--space-4);
        }

        .table-header {
          background-color: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
          padding-top: var(--space-3);
          padding-bottom: var(--space-3);
        }

        .table-header span {
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .table-body {
          max-height: 420px;
          overflow-y: auto;
        }

        .table-row {
          border-bottom: 1px solid var(--color-border);
          transition: background-color var(--transition-fast);
        }

        .table-row:last-child { border-bottom: none; }
        .table-row:hover { background-color: var(--color-surface); }

        .thumb {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          object-fit: cover;
          display: block;
          background-color: var(--color-surface-elevated);
          border: 1px solid var(--color-border);
        }

        .thumb-placeholder { background-color: var(--color-surface-elevated); }

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

        .notes-cell {
          font-size: var(--text-sm);
          color: var(--color-text);
          min-width: 0;
        }

        .note-line {
          margin-bottom: var(--space-1);
          line-height: 1.4;
        }

        .note-label {
          font-weight: var(--font-medium);
          color: var(--color-text-muted);
        }

        .reply-line {
          color: var(--color-accent);
        }

        .reply-btn {
          min-height: 32px;
          padding: var(--space-1) var(--space-2);
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text-muted);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .reply-btn:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }

        .reply-form {
          display: flex;
          gap: var(--space-1);
          flex-wrap: wrap;
        }

        .reply-input {
          flex: 1;
          min-width: 100px;
          min-height: 32px;
          padding: var(--space-1) var(--space-2);
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text);
          font-size: var(--text-sm);
          outline: none;
        }

        .reply-input:focus {
          border-color: var(--color-accent);
        }

        .reply-save,
        .reply-cancel {
          min-height: 32px;
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          cursor: pointer;
          border: 1px solid var(--color-border);
        }

        .reply-error {
          display: block;
          font-size: var(--text-xs);
          color: var(--color-error);
          margin-top: var(--space-1);
        }

        .reply-save {
          background-color: var(--color-accent);
          color: var(--color-bg);
          border-color: var(--color-accent);
        }

        .reply-save:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .reply-cancel {
          background: none;
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
