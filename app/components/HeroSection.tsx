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
    <div className="relative h-[85vh] min-h-[600px] w-full overflow-hidden">
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
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--background)]/80 via-[var(--background)]/25 to-transparent" />
      </div>

      <div className="absolute bottom-0 left-0 p-5 sm:p-10 md:p-16 pb-16 sm:pb-20 space-y-3.5 sm:space-y-5 max-w-3xl z-10 animate-slideUp" key={`hero-info-${heroIndex}`}>
        {featuredLogoUrl ? (
          <TMDBImage
            src={featuredLogoUrl}
            alt={featured.title}
            width={440}
            height={140}
            priority
            className="h-16 sm:h-20 md:h-24 lg:h-28 max-w-[90%] w-auto object-contain drop-shadow-2xl"
          />
        ) : (
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black drop-shadow-2xl leading-tight tracking-tight text-white">{featured.title}</h2>
        )}
        <div className="flex items-center gap-2 sm:gap-2.5 text-xs sm:text-base font-semibold flex-wrap">
          <span className="liquid-glass-pill px-3 py-1 rounded-lg uppercase tracking-wider text-xs sm:text-sm text-neutral-200 font-bold border border-white/10">
            {featured.type}
          </span>
          {displayRating != null && displayRating > 0 && (
            <span
              className="inline-flex items-center overflow-hidden rounded-lg border border-[#F5C518]/70 bg-black/60 shadow-sm"
              aria-label={`${displayRatingSource} rating ${displayRating.toFixed(1)}`}
            >
              <span className="bg-[#F5C518] px-2.5 py-1 text-xs sm:text-sm font-black tracking-wide text-black">{displayRatingSource}</span>
              <span className="px-2.5 py-1 text-xs sm:text-sm font-bold text-white">{displayRating.toFixed(1)}</span>
            </span>
          )}
          <span className="text-neutral-200 drop-shadow text-xs sm:text-base">{featured.year || (featured.firstAirDate ? featured.firstAirDate.substring(0, 4) : '')}</span>
          {featured.isHDR && (
            <span className="liquid-glass-pill px-2.5 py-1 bg-yellow-500/15 text-yellow-300 text-xs sm:text-sm rounded-lg font-bold tracking-wide border border-yellow-500/40 shadow-[0_0_12px_rgba(234,179,8,0.2)]">
              HDR
            </span>
          )}
          {featured.resolution && (
            <span className="liquid-glass-pill px-2.5 py-1 bg-blue-500/15 text-blue-300 text-xs sm:text-sm rounded-lg font-bold tracking-wide border border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.2)]">
              {featured.resolution === '2160p' ? '4K' : featured.resolution}
            </span>
          )}
          {featured.videoCodec && (
            <span className="liquid-glass-pill px-2.5 py-1 bg-violet-500/15 text-violet-300 text-xs sm:text-sm rounded-lg font-bold tracking-wide border border-violet-500/40">{featured.videoCodec}</span>
          )}
          {featured.audioChannels && (
            <span className="liquid-glass-pill px-2.5 py-1 bg-amber-500/15 text-amber-300 text-xs sm:text-sm rounded-lg font-bold tracking-wide border border-amber-500/40">{featured.audioChannels}</span>
          )}
          {featured.genres && (
            <span className="text-neutral-200/90 drop-shadow text-xs sm:text-base">{featured.genres.split(',').slice(0, 2).join(' • ')}</span>
          )}
        </div>
        {featured.overview && (
          <p className="text-sm sm:text-lg md:text-xl text-neutral-100 drop-shadow-md leading-relaxed line-clamp-3 max-w-2xl">{featured.overview}</p>
        )}
        <div className="flex flex-wrap sm:flex-nowrap gap-3 sm:gap-4 pt-1 sm:pt-2">
          {featured.type === 'movie' ? (
            <>
              <button
                onClick={onPlay}
                className="liquid-btn-primary px-6 py-3 sm:px-9 sm:py-4 font-extrabold rounded-2xl flex items-center gap-2.5 sm:gap-3 text-base sm:text-xl tracking-tight shadow-xl hover:scale-105 transition cursor-pointer"
              >
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-black" /> Play
              </button>
              <button
                onClick={onMoreInfo}
                className="liquid-btn-secondary px-5 py-3 sm:px-8 sm:py-4 font-bold rounded-2xl flex items-center gap-2 sm:gap-2.5 text-base sm:text-xl tracking-tight hover:scale-105 transition cursor-pointer"
              >
                More Info
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onViewEpisodes}
                className="liquid-btn-primary px-6 py-3 sm:px-9 sm:py-4 font-extrabold rounded-2xl flex items-center gap-2.5 sm:gap-3 text-base sm:text-xl tracking-tight shadow-xl hover:scale-105 transition cursor-pointer"
              >
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-black" /> View Episodes
              </button>
              <button
                onClick={onMoreInfo}
                className="liquid-btn-secondary px-5 py-3 sm:px-8 sm:py-4 font-bold rounded-2xl flex items-center gap-2 sm:gap-2.5 text-base sm:text-xl tracking-tight hover:scale-105 transition cursor-pointer"
              >
                More Info
              </button>
            </>
          )}
        </div>
      </div>

      {/* Liquid indicator dots */}
      {heroCandidates.length > 1 && (
        <div className="absolute bottom-6 sm:bottom-8 right-4 sm:right-10 md:right-14 flex items-center gap-1.5 sm:gap-2 z-10 p-1.5 sm:p-2 rounded-full liquid-glass-dock">
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
                    ? 'w-7 h-2.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]'
                    : 'w-2.5 h-2.5 bg-white/30 hover:bg-white/60'
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
