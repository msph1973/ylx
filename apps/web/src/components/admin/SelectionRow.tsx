import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';

// Kept in sync with the `Rule.max(500)` validation on
// `selection.photographerReply` in packages/sanity/schemas/selection.ts.
const MAX_REPLY_LENGTH = 500;

interface SelectionRowProps {
  selection: Selection;
  variants: Variants;
  isReplying: boolean;
  replyText: string;
  isSaving: boolean;
  replyError: string | null;
  onStartReply: () => void;
  onReplyTextChange: (value: string) => void;
  onSaveReply: () => void;
  onCancelReply: () => void;
}

export function SelectionRow({
  selection,
  variants,
  isReplying,
  replyText,
  isSaving,
  replyError,
  onStartReply,
  onReplyTextChange,
  onSaveReply,
  onCancelReply,
}: SelectionRowProps) {
  const thumbnailUrl = selection.photo.thumbnailUrl;

  return (
    <motion.div
      className="table-row"
      role="row"
      variants={variants}
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
          <button className="reply-btn" onClick={onStartReply}>
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
              onChange={(e) => onReplyTextChange(e.target.value)}
              disabled={isSaving}
              maxLength={MAX_REPLY_LENGTH}
            />
            <button
              className="reply-save"
              onClick={onSaveReply}
              disabled={isSaving || !replyText.trim()}
            >
              {isSaving ? '…' : 'Save'}
            </button>
            <button className="reply-cancel" onClick={onCancelReply} disabled={isSaving}>
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
}
