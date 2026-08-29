import React, { useRef, useState, useEffect, useCallback } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';

interface PinEntryProps {
  onSubmit: (pin: string) => void;
  error?: string | null;
  isLoading?: boolean;
}

export function PinEntry({ onSubmit, error, isLoading = false }: PinEntryProps) {
  const shouldReduceMotion = useReducedMotion();
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // A rejected PIN otherwise leaves all 4 boxes filled — the user has to
  // notice the error text and manually backspace every digit before they
  // can retry. Clear the boxes and refocus automatically instead.
  useEffect(() => {
    if (error) {
      setDigits(['', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  }, [error]);

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

      // OTP autofill can deliver the whole code through a single change event;
      // spread it across the boxes instead of keeping only the last digit.
      if (value.length > 1) {
        const digitsToPlace = value.replace(/\D/g, '').slice(0, 4 - index);
        if (!digitsToPlace) return;
        setDigits((prev) => {
          const next = [...prev];
          for (let i = 0; i < digitsToPlace.length; i++) {
            next[index + i] = digitsToPlace[i];
          }
          return next;
        });
        const focusIndex = Math.min(index + digitsToPlace.length, 3);
        inputRefs.current[focusIndex]?.focus();
        return;
      }

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

  // Splits a pasted/autofilled code (e.g. from an SMS suggestion) across all
  // 4 boxes instead of dropping everything but the first digit into one box.
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;
    e.preventDefault();

    setDigits(() => {
      const next = ['', '', '', ''];
      for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
      return next;
    });

    const focusIndex = Math.min(pasted.length, 3);
    inputRefs.current[focusIndex]?.focus();
  }, []);

  return (
    <div className="pin-entry">
      <m.div
        className="pin-inputs"
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.4 }}
      >
        {digits.map((digit, index) => (
          <m.div
            key={index}
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: shouldReduceMotion ? 0 : index * 0.1 }}
          >
            <input
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={isLoading}
              className="pin-digit"
              aria-label={`Digit ${index + 1}`}
            />
          </m.div>
        ))}
      </m.div>

      <AnimatePresence>
        {error && (
          <m.div
            className="pin-error"
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          >
            {error}
          </m.div>
        )}
      </AnimatePresence>

      {isLoading && (
        <m.div
          className="pin-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        >
          Verifying...
        </m.div>
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
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }

        @media (max-width: 360px) {
          .pin-digit {
            width: 48px;
            height: 56px;
            font-size: var(--text-xl);
          }
        }

        .pin-digit:focus-visible {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px var(--color-accent-ring);
          outline: none;
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
