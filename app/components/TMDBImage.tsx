'use client';

import Image from 'next/image';
import { useState } from 'react';

type TMDBImageProps = {
  src: string | null;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
  /** Accepted for call-site compatibility but ignored: TMDB serves the
   *  variant chosen by `tmdbSize`, so there is nothing left to re-encode. */
  quality?: number;
  tmdbSize?: string;
  fallback?: React.ReactNode;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
};

/**
 * TMDB image component built on next/image.
 *
 * Served straight from TMDB rather than through Next's image optimizer.
 * `tmdbSize` already selects a correctly-sized variant (w92/w342/w500/original)
 * from TMDB's own CDN, so re-fetching, decoding, resizing and re-encoding each
 * poster on our server is pure overhead — measured at ~2.3s for a single cold
 * poster, which is what made the first load of the day crawl.
 *
 * It was also failing outright: Next 16 only permits qualities listed in
 * `images.qualities` (default `[75]`), so the 80 used here and the 90 used by
 * the hero were rejected with HTTP 400 and every card and banner fell back to
 * its placeholder.
 *
 * next/image is kept for its lazy loading, layout and sizing behaviour.
 *
 * @param tmdbSize - TMDB image size prefix, e.g. 'w500', 'w342', 'w92', 'original'
 */
export default function TMDBImage({
  src,
  alt,
  fill = false,
  width,
  height,
  sizes,
  className = '',
  priority = false,
  tmdbSize = 'w500',
  fallback,
  onLoad,
}: TMDBImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return fallback ? <>{fallback}</> : null;
  }

  const fullSrc = src.startsWith('http')
    ? src
    : `https://image.tmdb.org/t/p/${tmdbSize}${src}`;

  if (fill) {
    return (
      <Image
        src={fullSrc}
        alt={alt}
        fill
        sizes={sizes || '(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw'}
        className={className}
        priority={priority}
        unoptimized
        onError={() => setError(true)}
        onLoad={onLoad}
      />
    );
  }

  return (
    <Image
      src={fullSrc}
      alt={alt}
      width={width || 500}
      height={height || 750}
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized
      onError={() => setError(true)}
      onLoad={onLoad}
    />
  );
}
