import React, { useState, useRef, useEffect } from 'react';
import { motion, type Variants } from 'framer-motion';
import type { Selection } from '@ylx/shared';
import { formatDate } from '@ylx/shared';
import { MAX_TEXT_LENGTH } from '@ylx/sanity/lib/constants';

// Notes can be up to MAX_TEXT_LENGTH (500) chars — unclamped they blow the
// row height apart. Clamp to 2 lines and only offer the expand toggle when
// the text actually overflows the clamp.
function NoteText({ label, text, className }: { label: string; text: string; className?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => {
      if (!isExpanded) {
        setIsClamped(el.scrollHeight > el.clientHeight + 1);
      } else {
        // Expanded: compare against the collapsed 2-line budget so shrinking
        // the column (or rotating the phone) keeps the toggle available.
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
        setIsClamped(el.scrollHeight > lineHeight * 2 + 1);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, isExpanded]);

  return (
    <div className={`note-line${className ? ` ${className}` : ''}`}>
      <span ref={textRef} className={`note-text${isExpanded ? '' : ' is-clamped'}`}>
        <span className="note-label">{label}:</span> {text}
      </span>
      {(isClamped || isExpanded) && (
        <button
          type="button"
          className="note-expand-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

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
          <NoteText label="Client" text={selection.notes} />
        )}
        {selection.photographerReply && (
          <NoteText label="You" text={selection.photographerReply} className="reply-line" />
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
