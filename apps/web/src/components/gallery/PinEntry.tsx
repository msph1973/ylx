import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PinEntryProps {
  onSubmit: (pin: string) => void;
  error?: string | null;
  isLoading?: boolean;
}

export function PinEntry({ onSubmit, error, isLoading = false }: PinEntryProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const submittedRef = useRef(false);

  useEffect(() => {
    if (digits.every((d) => d !== '') && !submittedRef.current) {
      submittedRef.current = true;
      onSubmitRef.current(digits.join(''));
    }
    if (digits.some((d) => d === '')) {
      submittedRef.current = false;
    }
  }, [digits]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;

      setDigits((prev) => {
        const newDigits = [...prev];
        newDigits[index] = value.slice(-1);
        return newDigits;
      });

      if (value && index < 3) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    []
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  return (
    <div className="pin-entry">
      <motion.div
        className="pin-inputs"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {digits.map((digit, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
          >
            <input
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={isLoading}
              className="pin-digit"
              aria-label={`Digit ${index + 1}`}
            />
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            className="pin-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading && (
        <motion.div
          className="pin-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Verifying...
        </motion.div>
      )}

      <style>{`
        .pin-entry {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-4);
        }

        .pin-inputs {
          display: flex;
          gap: var(--space-3);
        }

        .pin-digit {
          width: 56px;
          height: 64px;
          text-align: center;
          font-size: var(--text-2xl);
          font-weight: var(--font-semibold);
          background-color: var(--color-surface);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-lg);
          color: var(--color-text);
          outline: none;
          transition: border-color var(--transition-fast);
        }

        .pin-digit:focus {
          border-color: var(--color-accent);
        }

        .pin-digit:disabled {
          opacity: 0.5;
        }

        .pin-error {
          color: var(--color-error);
          font-size: var(--text-sm);
          text-align: center;
          overflow: hidden;
        }

        .pin-loading {
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }

        @media (min-width: 768px) {
          .pin-digit {
            width: 64px;
            height: 72px;
            font-size: var(--text-3xl);
          }
        }
      `}</style>
    </div>
  );
}
