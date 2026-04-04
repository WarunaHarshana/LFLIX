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
  quality?: number;
  tmdbSize?: string;
  fallback?: React.ReactNode;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
};

/**
 * Optimized TMDB image component using Next.js Image.
 * Handles null src, loading states, and error fallbacks automatically.
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
  quality = 80,
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
        quality={quality}
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
      quality={quality}
      onError={() => setError(true)}
      onLoad={onLoad}
    />
  );
}
