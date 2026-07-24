import React, { useState, useRef, useEffect } from 'react';

interface BlurImageProps {
  src: string;
  alt: string;
  lqip?: string | null;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** Responsive candidates (e.g. "url400 1x, url800 2x"). When set, the browser
   *  picks the right density/width so retina screens aren't served a soft image. */
  srcSet?: string;
  sizes?: string;
  draggable?: boolean;
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  onTouchCancel?: React.TouchEventHandler<HTMLDivElement>;
}

/**
 * Progressive blur-up image. A wrapper holds the Sanity LQIP (base64 data-URI)
 * as a blurred background that stays visible while the real <img> fades in on
 * top of it. Keeping the placeholder and the fading image on separate elements
 * is what makes the blur-up actually show — an opacity:0 <img> would also hide
 * its own background. Falls back to a plain fade-in when no LQIP is present.
 */
export const BlurImage = React.memo(function BlurImage({ src, alt, lqip, className, loading = 'lazy', srcSet, sizes, draggable, onTouchStart, onTouchEnd, onTouchCancel }: BlurImageProps) {
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
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <img
        ref={ref}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        loading={loading}
        decoding="async"
        draggable={draggable}
        className={`blur-img${loaded ? ' loaded' : ''}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
});
