import { useState, useRef, useCallback, useEffect } from 'react';

export function useCopyToClipboard(resetMs = 2000): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
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
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), resetMs);
    } catch {
      // clipboard write failed silently
    }
  }, [resetMs]);

  return { copied, copy };
}
