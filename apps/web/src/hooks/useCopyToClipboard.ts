import { useState, useRef, useCallback } from 'react';

export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const copy = useCallback(async (text: string) => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), resetMs);
    } catch {
      // clipboard write failed silently
    }
  }, [resetMs]);

  return { copied, copy };
}
