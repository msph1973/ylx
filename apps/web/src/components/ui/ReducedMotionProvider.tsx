import { MotionConfig } from 'framer-motion';
import { useEffect, useState } from 'react';

export function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      {children}
    </MotionConfig>
  );
}
