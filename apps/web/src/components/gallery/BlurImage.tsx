import React, { useState, useRef, useEffect } from 'react';

interface BlurImageProps {
  src: string;
  alt: string;
  lqip?: string | null;
  className?: string;
  loading?: 'lazy' | 'eager';
}

/**
 * Progressive blur-up image. Shows the Sanity LQIP (base64 data-URI) as a
 * blurred background, then crossfades to the real image once it decodes.
 * Falls back to a plain fade from the surface color when no LQIP is present.
 */
export function BlurImage({ src, alt, lqip, className, loading = 'lazy' }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Cached images can finish before onLoad attaches — reveal them immediately.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, [src]);

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading={loading}
      className={`blur-img${loaded ? ' loaded' : ''}${className ? ` ${className}` : ''}`}
      style={!loaded && lqip ? { backgroundImage: `url(${lqip})` } : undefined}
      onLoad={() => setLoaded(true)}
    />
  );
}
