'use client';

import { Play } from 'lucide-react';
import clsx from 'clsx';
import type { ContentItem } from '@/app/types';
import TMDBImage from './TMDBImage';

type HeroSectionProps = {
  featured: ContentItem;
  featuredLogoUrl: string | null;
  heroCandidates: ContentItem[];
  heroIndex: number;
  onSetHeroIndex: (index: number) => void;
  onPlay: () => void;
  onMoreInfo: () => void;
  onViewEpisodes: () => void;
};

export default function HeroSection({
  featured,
  featuredLogoUrl,
  heroCandidates,
  heroIndex,
  onSetHeroIndex,
  onPlay,
  onMoreInfo,
  onViewEpisodes,
}: HeroSectionProps) {
  const displayRating = featured.imdbRating ?? featured.rating;
  const displayRatingSource = featured.imdbRating != null ? 'IMDb' : 'TMDB';

  return (
    <div className="relative h-screen min-h-[640px] md:min-h-[720px] w-full overflow-hidden">
      <div className="absolute inset-0" key={`hero-${heroIndex}`}>
        {(featured.backdropPath || featured.posterPath) ? (
          <TMDBImage
            src={featured.backdropPath || featured.posterPath}
            alt="Hero"
            tmdbSize="w1280"
            fill
            priority
            quality={90}
            sizes="100vw"
            className="w-full h-full object-cover opacity-80 animate-heroFade"
          />
        ) : (
          <div className="w-full h-full bg-neutral-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/35 via-30% to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--background)]/85 via-[var(--background)]/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-36 sm:h-48 md:h-56 bg-gradient-to-t from-[var(--background)] to-transparent pointer-events-none" />
      </div>

      <div className="absolute bottom-0 left-0 p-6 sm:p-12 md:p-16 lg:p-20 pb-28 sm:pb-36 md:pb-44 lg:pb-52 space-y-4 sm:space-y-5 md:space-y-6 max-w-4xl lg:max-w-5xl z-10 animate-slideUp" key={`hero-info-${heroIndex}`}>
        {featuredLogoUrl ? (
          <TMDBImage
            src={featuredLogoUrl}
            alt={featured.title}
            width={600}
            height={200}
            priority
            className="h-20 sm:h-28 md:h-36 lg:h-48 xl:h-52 max-w-[85%] sm:max-w-[75%] md:max-w-[65%] w-auto object-contain drop-shadow-2xl"
          />
        ) : (
          <h2 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black drop-shadow-2xl leading-[1.05] tracking-tight text-white max-w-3xl lg:max-w-4xl">
            {featured.title}
          </h2>
        )}
        <div className="flex items-center gap-2.5 sm:gap-3 md:gap-3.5 text-xs sm:text-base md:text-lg font-semibold flex-wrap">
          <span className="liquid-glass-pill px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-xl uppercase tracking-wider text-xs sm:text-sm text-neutral-100 font-bold border border-white/20 shadow-md">
            {featured.type}
          </span>
          {displayRating != null && displayRating > 0 && (
            <span
              className="inline-flex items-center overflow-hidden rounded-xl border border-[#F5C518]/80 bg-black/70 shadow-lg"
              aria-label={`${displayRatingSource} rating ${displayRating.toFixed(1)}`}
            >
              <span className="bg-[#F5C518] px-2.5 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm font-black tracking-wide text-black">{displayRatingSource}</span>
              <span className="px-2.5 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm font-bold text-white">{displayRating.toFixed(1)}</span>
            </span>
          )}
          <span className="text-neutral-200 drop-shadow text-xs sm:text-base md:text-lg font-medium">
            {featured.year || (featured.firstAirDate ? featured.firstAirDate.substring(0, 4) : '')}
          </span>
          {featured.isHDR && (
            <span className="liquid-glass-pill px-2.5 py-1 sm:px-3 sm:py-1.5 bg-yellow-500/20 text-yellow-300 text-xs sm:text-sm rounded-xl font-bold tracking-wide border border-yellow-500/50 shadow-[0_0_14px_rgba(234,179,8,0.25)]">
              HDR
            </span>
          )}
          {featured.resolution && (
            <span className="liquid-glass-pill px-2.5 py-1 sm:px-3 sm:py-1.5 bg-blue-500/20 text-blue-300 text-xs sm:text-sm rounded-xl font-bold tracking-wide border border-blue-500/50 shadow-[0_0_14px_rgba(59,130,246,0.25)]">
              {featured.resolution === '2160p' ? '4K' : featured.resolution}
            </span>
          )}
          {featured.videoCodec && (
            <span className="liquid-glass-pill px-2.5 py-1 sm:px-3 sm:py-1.5 bg-violet-500/20 text-violet-300 text-xs sm:text-sm rounded-xl font-bold tracking-wide border border-violet-500/50">{featured.videoCodec}</span>
          )}
          {featured.audioChannels && (
            <span className="liquid-glass-pill px-2.5 py-1 sm:px-3 sm:py-1.5 bg-amber-500/20 text-amber-300 text-xs sm:text-sm rounded-xl font-bold tracking-wide border border-amber-500/50">{featured.audioChannels}</span>
          )}
          {featured.genres && (
            <span className="text-neutral-200/90 drop-shadow text-xs sm:text-base md:text-lg font-medium">
              {featured.genres.split(',').slice(0, 3).join(' • ')}
            </span>
          )}
        </div>
        {featured.overview && (
          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-neutral-100 drop-shadow-md leading-relaxed line-clamp-3 md:line-clamp-4 max-w-2xl lg:max-w-3xl font-normal">
            {featured.overview}
          </p>
        )}
        <div className="flex flex-wrap sm:flex-nowrap gap-3.5 sm:gap-4 pt-1.5 sm:pt-2.5">
          {featured.type === 'movie' ? (
            <>
              <button
                onClick={onPlay}
                className="liquid-btn-primary px-7 py-3.5 sm:px-9 sm:py-4 md:px-10 md:py-4.5 font-extrabold rounded-2xl flex items-center gap-3 text-base sm:text-lg md:text-xl tracking-tight shadow-2xl hover:scale-105 active:scale-95 transition cursor-pointer"
              >
                <Play className="w-5 h-5 sm:w-6 sm:h-6 md:w-6.5 md:h-6.5 fill-black" /> Play
              </button>
              <button
                onClick={onMoreInfo}
                className="liquid-btn-secondary px-6 py-3.5 sm:px-8 sm:py-4 md:px-9 md:py-4.5 font-bold rounded-2xl flex items-center gap-3 text-base sm:text-lg md:text-xl tracking-tight shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer"
              >
                More Info
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onViewEpisodes}
                className="liquid-btn-primary px-7 py-3.5 sm:px-9 sm:py-4 md:px-10 md:py-4.5 font-extrabold rounded-2xl flex items-center gap-3 text-base sm:text-lg md:text-xl tracking-tight shadow-2xl hover:scale-105 active:scale-95 transition cursor-pointer"
              >
                <Play className="w-5 h-5 sm:w-6 sm:h-6 md:w-6.5 md:h-6.5 fill-black" /> View Episodes
              </button>
              <button
                onClick={onMoreInfo}
                className="liquid-btn-secondary px-6 py-3.5 sm:px-8 sm:py-4 md:px-9 md:py-4.5 font-bold rounded-2xl flex items-center gap-3 text-base sm:text-lg md:text-xl tracking-tight hover:scale-105 active:scale-95 transition cursor-pointer"
              >
                More Info
              </button>
            </>
          )}
        </div>
      </div>

      {/* Liquid indicator dots */}
      {heroCandidates.length > 1 && (
        <div className="absolute bottom-10 sm:bottom-16 md:bottom-20 right-6 sm:right-12 md:right-16 flex items-center gap-2 sm:gap-2.5 z-10 p-2 sm:p-2.5 rounded-full liquid-glass-dock">
          {heroCandidates.map((_, i) => {
            const isActive = (heroIndex % heroCandidates.length) === i;
            return (
              <button
                key={i}
                onClick={() => onSetHeroIndex(i)}
                aria-label={`Featured item ${i + 1}`}
                className={clsx(
                  'transition-all duration-300 rounded-full cursor-pointer',
                  isActive
                    ? 'w-8 h-2.5 sm:w-10 sm:h-3 bg-white shadow-[0_0_14px_rgba(255,255,255,0.9)]'
                    : 'w-2.5 h-2.5 sm:w-3 sm:h-3 bg-white/30 hover:bg-white/60'
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
