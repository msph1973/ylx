import { useState, useRef, useCallback, useEffect } from 'react';

export function useCopyToClipboard(resetMs = 2000): { copied: boolean; error: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(async (text: string) => {
    if (typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(false);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), resetMs);
    } catch {
      setError(true);
      setCopied(false);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setError(false), resetMs);
    }
  }, [resetMs]);

  return { copied, error, copy };
}
