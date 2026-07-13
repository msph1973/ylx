import React, { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import type { Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';
import { MAX_TEXT_LENGTH } from '@ylx/sanity/lib/constants';

interface SelectionRowProps {
  selection: Selection;
  variants: Variants;
  /** Throws on failure; row-local error/saving state is derived from this. */
  onSaveReply: (selectionId: string, replyText: string) => Promise<void>;
}

// Local reply-draft state lives here (per row) instead of in the parent
// table, so starting a reply on one row no longer silently discards an
// unsaved draft being typed into a different row.
export function SelectionRow({ selection, variants, onSaveReply }: SelectionRowProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const handleStartReply = () => {
    setIsReplying(true);
    setReplyText('');
    setReplyError(null);
  };

  const handleCancelReply = () => {
    setIsReplying(false);
    setReplyText('');
    setReplyError(null);
  };

  const handleSaveReply = async () => {
    setIsSaving(true);
    setReplyError(null);
    try {
      await onSaveReply(selection.id, replyText);
      setIsReplying(false);
      setReplyText('');
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

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
          <button className="reply-btn" onClick={handleStartReply}>
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
              maxLength={MAX_TEXT_LENGTH}
            />
            <button
              className="reply-save"
              onClick={() => void handleSaveReply()}
              disabled={isSaving || !replyText.trim()}
            >
              {isSaving ? '…' : 'Save'}
            </button>
            <button className="reply-cancel" onClick={handleCancelReply} disabled={isSaving}>
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
