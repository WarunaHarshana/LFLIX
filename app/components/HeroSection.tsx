'use client';

import { Play } from 'lucide-react';
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
    <div className="relative h-[80vh] w-full overflow-hidden">
      <div className="absolute inset-0" key={`hero-${heroIndex}`}>
        {(featured.backdropPath || featured.posterPath) ? (
          <TMDBImage
            src={featured.backdropPath || featured.posterPath}
            alt="Hero"
            tmdbSize="original"
            fill
            priority
            quality={90}
            sizes="100vw"
            className="w-full h-full object-cover opacity-60 animate-heroFade"
          />
        ) : (
          <div className="w-full h-full bg-neutral-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
      </div>

      <div className="absolute bottom-0 left-0 p-12 pb-24 space-y-6 max-w-2xl z-10 animate-slideUp" key={`hero-info-${heroIndex}`}>
        {featuredLogoUrl ? (
          <TMDBImage
            src={featuredLogoUrl}
            alt={featured.title}
            width={400}
            height={120}
            priority
            className="h-16 sm:h-20 md:h-24 lg:h-28 max-w-[90%] w-auto object-contain drop-shadow-2xl"
          />
        ) : (
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-extrabold drop-shadow-2xl leading-tight">{featured.title}</h2>
        )}
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span className="px-2 py-0.5 bg-neutral-800 rounded border border-neutral-600 uppercase tracking-wide text-neutral-300">
            {featured.type}
          </span>
          {displayRating != null && displayRating > 0 && (
            <span
              className="inline-flex items-center overflow-hidden rounded-md border border-[#F5C518]/70 bg-black/60 shadow-sm"
              aria-label={`${displayRatingSource} rating ${displayRating.toFixed(1)}`}
            >
              <span className="bg-[#F5C518] px-2 py-1 text-xs font-black tracking-wide text-black">{displayRatingSource}</span>
              <span className="px-2 py-1 text-xs font-bold text-white">{displayRating.toFixed(1)}</span>
            </span>
          )}
          <span className="text-neutral-300">{featured.year || (featured.firstAirDate ? featured.firstAirDate.substring(0, 4) : '')}</span>
          {featured.isHDR && (
            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded font-bold tracking-wide border border-yellow-500/40">
              HDR
            </span>
          )}
          {featured.resolution && (
            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded font-bold tracking-wide border border-blue-500/40">
              {featured.resolution === '2160p' ? '4K' : featured.resolution}
            </span>
          )}
          {featured.videoCodec && (
            <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-300 text-xs rounded font-bold tracking-wide border border-violet-500/40">{featured.videoCodec}</span>
          )}
          {featured.audioChannels && (
            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-xs rounded font-bold tracking-wide border border-amber-500/40">{featured.audioChannels}</span>
          )}
          {featured.genres && (
            <span className="text-neutral-400">{featured.genres.split(',').slice(0, 2).join(' • ')}</span>
          )}
        </div>
        {featured.overview && (
          <p className="text-lg text-neutral-200 line-clamp-3 drop-shadow-md leading-relaxed">{featured.overview}</p>
        )}
        <div className="flex gap-4 pt-2">
          {featured.type === 'movie' ? (
            <>
              <button
                onClick={onPlay}
                className="px-8 py-3 bg-white text-black font-bold rounded flex items-center gap-2 hover:bg-neutral-200 transition"
              >
                <Play className="w-6 h-6 fill-black" /> Play
              </button>
              <button
                onClick={onMoreInfo}
                className="px-8 py-3 bg-neutral-700/80 text-white font-bold rounded flex items-center gap-2 hover:bg-neutral-600 transition"
              >
                More Info
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onViewEpisodes}
                className="px-8 py-3 bg-white text-black font-bold rounded flex items-center gap-2 hover:bg-neutral-200 transition"
              >
                <Play className="w-6 h-6 fill-black" /> View Episodes
              </button>
              <button
                onClick={onMoreInfo}
                className="px-8 py-3 bg-neutral-700/80 text-white font-bold rounded flex items-center gap-2 hover:bg-neutral-600 transition"
              >
                More Info
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hero indicator dots */}
      {heroCandidates.length > 1 && (
        <div className="absolute bottom-6 right-12 flex gap-2 z-10">
          {heroCandidates.map((_, i) => (
            <button
              key={i}
              onClick={() => onSetHeroIndex(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                (heroIndex % heroCandidates.length) === i
                  ? 'bg-white scale-125 hero-dot-active'
                  : 'bg-white/30 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
