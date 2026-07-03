import React, { useState, useRef, useEffect } from 'react';

interface BlurImageProps {
  src: string;
  alt: string;
  lqip?: string | null;
  className?: string;
  loading?: 'lazy' | 'eager';
}

/**
 * Progressive blur-up image. A wrapper holds the Sanity LQIP (base64 data-URI)
 * as a blurred background that stays visible while the real <img> fades in on
 * top of it. Keeping the placeholder and the fading image on separate elements
 * is what makes the blur-up actually show — an opacity:0 <img> would also hide
 * its own background. Falls back to a plain fade-in when no LQIP is present.
 */
export function BlurImage({ src, alt, lqip, className, loading = 'lazy' }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Reset on src change so the blur-up replays even when the instance is reused
  // without a remount. Cached images can finish before onLoad attaches, so
  // reveal them immediately when already complete.
  useEffect(() => {
    setLoaded(false);
    if (ref.current?.complete) setLoaded(true);
  }, [src]);

  return (
    <div
      className={`blur-wrap${className ? ` ${className}` : ''}`}
      style={!loaded && lqip ? { backgroundImage: `url(${lqip})` } : undefined}
    >
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={loading}
        className={`blur-img${loaded ? ' loaded' : ''}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
