import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { AlbumCardData } from './AlbumCard';

interface AlbumFormData {
  title: string;
  clientName: string;
  eventDate: string;
  pin: string;
  maxSelections: number;
}

interface AlbumFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** If provided, modal is in edit mode; otherwise create mode */
  album?: AlbumCardData & { maxSelections?: number };
}

const DEFAULT_FORM: AlbumFormData = {
  title: '',
  clientName: '',
  eventDate: '',
  pin: '',
  maxSelections: 20,
};

export function AlbumFormModal({ isOpen, onClose, onSuccess, album }: AlbumFormModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const isEdit = Boolean(album);

  const [form, setForm] = useState<AlbumFormData>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    if (album) {
      setForm({
        title: album.title,
        clientName: album.clientName,
        eventDate: album.eventDate ? album.eventDate.slice(0, 10) : '',
        pin: album.pin ?? '',
        maxSelections: album.maxSelections ?? 20,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setError(null);
  }, [album]);

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'maxSelections' ? parseInt(value, 10) || 1 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!/^\d{4}$/.test(form.pin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    if (form.maxSelections < 1) {
      setError('Max selections must be at least 1');
      return;
    }

    setIsSubmitting(true);

    try {
      const url = isEdit && album
        ? `/api/admin/albums/${album.id}`
        : '/api/admin/albums';

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Network error — please try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.95, y: shouldReduceMotion ? 0 : 16 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.95, y: shouldReduceMotion ? 0 : 8 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-backdrop"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          role="dialog"
          aria-modal="true"
          aria-label={isEdit ? 'Edit Album' : 'Create Album'}
        >
          <motion.div
            className="modal"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'spring', stiffness: 400, damping: 30, duration: shouldReduceMotion ? 0 : undefined }}
          >
            <div className="modal-header">
              <h2 className="modal-title">{isEdit ? 'Edit Album' : 'New Album'}</h2>
              <button
                className="modal-close"
                onClick={onClose}
                aria-label="Close modal"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form className="modal-form" onSubmit={handleSubmit} noValidate>
              {error && (
                <div className="form-error" role="alert">{error}</div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="album-title">Album Title</label>
                <input
                  id="album-title"
                  className="form-input"
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="e.g. Sarah & James Wedding"
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="album-clientName">Client Name</label>
                <input
                  id="album-clientName"
                  className="form-input"
                  type="text"
                  name="clientName"
                  value={form.clientName}
                  onChange={handleChange}
                  placeholder="e.g. Sarah Johnson"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="album-eventDate">Event Date</label>
                <input
                  id="album-eventDate"
                  className="form-input"
                  type="date"
                  name="eventDate"
                  value={form.eventDate}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="album-pin">
                    PIN
                    <span className="form-hint">4 digits</span>
                  </label>
                  <input
                    id="album-pin"
                    className="form-input form-input-mono"
                    type="text"
                    name="pin"
                    value={form.pin}
                    onChange={handleChange}
                    placeholder="1234"
                    maxLength={4}
                    pattern="\d{4}"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="album-maxSelections">
                    Max Selections
                  </label>
                  <input
                    id="album-maxSelections"
                    className="form-input"
                    type="number"
                    name="maxSelections"
                    value={form.maxSelections}
                    onChange={handleChange}
                    min={1}
                    max={500}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? (isEdit ? 'Saving…' : 'Creating…')
                    : (isEdit ? 'Save Changes' : 'Create Album')}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
      <style>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          z-index: 50;
        }

        .modal {
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-2xl);
          width: 100%;
          max-width: 480px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-6) var(--space-6) var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .modal-title {
          font-size: var(--text-xl);
          font-weight: var(--font-semibold);
          color: var(--color-text);
        }

        .modal-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: var(--color-text-muted);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background-color var(--transition-fast), color var(--transition-fast);
        }

        .modal-close:hover {
          background-color: var(--color-bg);
          color: var(--color-text);
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          padding: var(--space-6);
        }

        .form-error {
          padding: var(--space-3) var(--space-4);
          background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          color: var(--color-error);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-1-5);
          flex: 1;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
        }

        .form-label {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text);
        }

        .form-hint {
          font-size: var(--text-xs);
          font-weight: var(--font-normal);
          color: var(--color-text-muted);
        }

        .form-input {
          padding: var(--space-2-5) var(--space-3);
          background-color: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          color: var(--color-text);
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
          width: 100%;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
        }

        .form-input-mono {
          font-family: var(--font-mono, monospace);
          letter-spacing: 0.15em;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          padding-top: var(--space-2);
          border-top: 1px solid var(--color-border);
          margin-top: var(--space-2);
        }

        .btn-primary {
          padding: var(--space-2-5) var(--space-5);
          background-color: var(--color-accent);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: opacity var(--transition-fast);
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.88;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          padding: var(--space-2-5) var(--space-5);
          background-color: transparent;
          color: var(--color-text-muted);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: background-color var(--transition-fast), color var(--transition-fast);
        }

        .btn-secondary:hover:not(:disabled) {
          background-color: var(--color-bg);
          color: var(--color-text);
        }

        .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </AnimatePresence>
  );
}
