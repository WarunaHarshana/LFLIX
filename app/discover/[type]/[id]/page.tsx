'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Check,
  ArrowLeft,
  Download,
  Film,
  Loader2,
  Pause,
  Play,
  Plus,
  User,
  Tv,
  Volume2,
  VolumeX,
  X,
  PlayCircle,
} from 'lucide-react';
import StreamServerModal from '../../../components/StreamServerModal';
import DownloadModal from '../../../components/DownloadModal';
import TrailerModal from '../../../components/TrailerModal';
import ContentCard, { type ContentItem as DiscoverContentCardItem } from '../../../components/ContentCard';
import DetailTabNav from '../../../components/DetailTabNav';
import { useAppStore } from '@/app/store/useAppStore';
import LiquidDropdown from '../../../components/LiquidDropdown';
import RottenTomatoesIcon from '../../../components/RottenTomatoesIcon';

const PERSON_SORT_OPTIONS = [
  { id: 'date', name: 'Sort: Date' },
  { id: 'rating', name: 'Sort: Rating' },
  { id: 'popular', name: 'Sort: Popular' },
];

type TMDBResult = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  imdbRating?: number | null;
  rottenTomatoes?: string | null;
  year: string | null;
  popularity: number;
};

type MovieDetails = {
  id: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number | null;
  imdbRating?: number | null;
  rottenTomatoes?: string | null;
  year: string | null;
  runtime: number | null;
  tagline: string | null;
  genres: string;
  logoPath: string | null;
  collection: {
    id: number;
    name: string;
    posterPath: string | null;
    backdropPath: string | null;
  } | null;
  cast: { id: number; name: string; character: string; profilePath: string | null }[];
};

type CollectionData = {
  id: number;
  name: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  parts: {
    tmdbId: number;
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    rating: number | null;
    imdbRating?: number | null;
    rottenTomatoes?: string | null;
    year: string | null;
    releaseDate: string | null;
  }[];
};

type TVDetails = {
  id: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number | null;
  imdbRating?: number | null;
  rottenTomatoes?: string | null;
  year: string | null;
  status: string | null;
  tagline: string | null;
  genres: string;
  logoPath: string | null;
  numberOfSeasons: number;
  seasons: { seasonNumber: number; name: string; episodeCount: number; posterPath: string | null; airDate: string | null }[];
  cast: { id: number; name: string; character: string; profilePath: string | null }[];
};

type EpisodeInfo = {
  episodeNumber: number;
  title: string;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  rating: number | null;
  runtime: number | null;
};

type PersonCredit = TMDBResult & {
  character: string | null;
};

type PersonDetails = {
  id: number;
  name: string;
  profilePath: string | null;
  biography: string | null;
  credits: PersonCredit[];
};

type PersonCreditFilter = 'all' | 'movie' | 'tv';
type PersonCreditSort = 'date' | 'rating' | 'popular';

const personCreditFilters: { value: PersonCreditFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
];

function getCreditYearValue(credit: PersonCredit): number {
  const year = parseInt(credit.year || '0', 10);
  return Number.isFinite(year) ? year : 0;
}

type TrailerData = {
  key: string;
  name: string;
  site: string;
  type: string;
};

function isTrailerVideo(video: TrailerData | null | undefined): video is TrailerData {
  return Boolean(video?.key && video.type === 'Trailer');
}

type TrailerModalState = {
  title: string;
  season?: number;
  episode?: number;
} | null;

type WatchlistItem = {
  id: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
};

function toDiscoverContentCardItem(item: TMDBResult): DiscoverContentCardItem {
  return {
    id: item.tmdbId,
    type: item.mediaType === 'movie' ? 'movie' : 'show',
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    overview: item.overview,
    rating: item.rating,
    imdbRating: item.imdbRating,
    year: item.year ? parseInt(item.year, 10) : undefined,
  };
}

export default function DiscoverDetailPage() {
  const router = useRouter();
  const params = useParams<{ type: string; id: string }>();

  const mediaType = params?.type === 'tv' ? 'tv' : 'movie';
  const tmdbId = Number.parseInt(params?.id || '', 10);

  const [loadingDetails, setLoadingDetails] = useState(true);
  const [loadingSimilar, setLoadingSimilar] = useState(true);
  const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
  const [tvDetails, setTVDetails] = useState<TVDetails | null>(null);
  const [similarItems, setSimilarItems] = useState<TMDBResult[]>([]);
  const [collectionData, setCollectionData] = useState<CollectionData | null>(null);
  const [loadingCollection, setLoadingCollection] = useState(false);

  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailer, setTrailer] = useState<TrailerData | null>(null);
  const [heroMuted, setHeroMuted] = useState(true);
  const [heroPaused, setHeroPaused] = useState(false);

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [seasonTrailers, setSeasonTrailers] = useState<Record<string, TrailerData | null>>({});
  const [episodeTrailers, setEpisodeTrailers] = useState<Record<string, TrailerData | null>>({});

  const [streamModal, setStreamModal] = useState<{ tmdbId: number; type: 'movie' | 'tv'; title: string; season?: number; episode?: number } | null>(null);
  const [downloadModal, setDownloadModal] = useState<{ title: string; year?: string | null; mediaType: 'movie' | 'tv'; posterPath?: string | null; tmdbId?: number; season?: number; episode?: number } | null>(null);
  const [trailerModal, setTrailerModal] = useState<TrailerModalState>(null);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [watchlistItemId, setWatchlistItemId] = useState<number | null>(null);
  const [watchlistBusy, setWatchlistBusy] = useState(false);

  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [personData, setPersonData] = useState<PersonDetails | null>(null);
  const [loadingPerson, setLoadingPerson] = useState(false);
  const [visiblePersonCredits, setVisiblePersonCredits] = useState(8);
  const [personCreditFilter, setPersonCreditFilter] = useState<PersonCreditFilter>('all');
  const [personCreditSort, setPersonCreditSort] = useState<PersonCreditSort>('date');

  const activeDetails = mediaType === 'movie' ? movieDetails : tvDetails;
  const activeRating = activeDetails?.imdbRating ?? activeDetails?.rating ?? null;
  const activeRatingSource = activeDetails?.imdbRating != null ? 'IMDb' : 'TMDB';

  const filteredPersonCredits = useMemo(() => {
    const credits = personData?.credits || [];
    const filtered = personCreditFilter === 'all'
      ? credits
      : credits.filter((credit) => credit.mediaType === personCreditFilter);

    return [...filtered].sort((a, b) => {
      if (personCreditSort === 'rating') {
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
      } else if (personCreditSort === 'popular') {
        const popularityDiff = (b.popularity || 0) - (a.popularity || 0);
        if (popularityDiff !== 0) return popularityDiff;
      } else {
        const yearDiff = getCreditYearValue(b) - getCreditYearValue(a);
        if (yearDiff !== 0) return yearDiff;
      }

      const fallbackYearDiff = getCreditYearValue(b) - getCreditYearValue(a);
      if (fallbackYearDiff !== 0) return fallbackYearDiff;
      return (b.popularity || 0) - (a.popularity || 0);
    });
  }, [personCreditFilter, personCreditSort, personData]);

  useEffect(() => {
    setVisiblePersonCredits(8);
  }, [personCreditFilter, personCreditSort]);

  useEffect(() => {
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return;
    }

    let cancelled = false;

    const fetchDetails = async () => {
      setLoadingDetails(true);
      setLoadingSimilar(true);
      setMovieDetails(null);
      setTVDetails(null);
      setSimilarItems([]);
      setCollectionData(null);
      setSelectedSeason(null);
      setEpisodes([]);

      try {
        const [detailsResp, similarResp] = await Promise.allSettled([
          fetch(`/api/tmdb-details?id=${tmdbId}&type=${mediaType}`),
          fetch(`/api/tmdb-similar?id=${tmdbId}&type=${mediaType}`),
        ]);

        if (!cancelled && detailsResp.status === 'fulfilled' && detailsResp.value.ok) {
          const detailsData = await detailsResp.value.json();
          if (mediaType === 'movie') {
            const movieObj = detailsData as MovieDetails;
            setMovieDetails(movieObj);
            
            // If it belongs to a collection, fetch collection details
            if (movieObj.collection?.id) {
              setLoadingCollection(true);
              try {
                const collectionResp = await fetch(`/api/tmdb-collection?id=${movieObj.collection.id}`);
                if (!cancelled && collectionResp.ok) {
                  const collData = await collectionResp.json();
                  setCollectionData(collData as CollectionData);
                }
              } catch (e) {
                console.error('Failed to fetch collection data', e);
              } finally {
                if (!cancelled) setLoadingCollection(false);
              }
            }
          } else {
            const tvData = detailsData as TVDetails;
            setTVDetails(tvData);
            if (tvData.seasons?.length > 0) {
              setSelectedSeason(tvData.seasons[0].seasonNumber);
            }
          }
        }

        if (!cancelled && similarResp.status === 'fulfilled' && similarResp.value.ok) {
          const similarData = await similarResp.value.json();
          const filtered = (similarData.results || []).filter((item: TMDBResult) => item.tmdbId !== tmdbId);
          setSimilarItems(filtered.slice(0, 12));
        }
      } catch (error) {
        console.error('Failed to fetch discover detail page data', error);
      } finally {
        if (!cancelled) {
          setLoadingDetails(false);
          setLoadingSimilar(false);
        }
      }
    };

    const fetchTrailer = async () => {
      setTrailerLoading(true);
      setTrailer(null);
      try {
        const res = await fetch(`/api/trailer?tmdbId=${tmdbId}&mediaType=${mediaType}`);
        if (!cancelled && res.ok) {
          const data = (await res.json()) as TrailerData;
          setTrailer(data);
        }
      } catch (error) {
        console.error('Trailer background fetch failed', error);
      } finally {
        if (!cancelled) {
          setTrailerLoading(false);
        }
      }
    };

    void Promise.all([fetchDetails(), fetchTrailer()]);

    return () => {
      cancelled = true;
    };
  }, [mediaType, tmdbId]);

  useEffect(() => {
    if (mediaType !== 'tv' || !selectedSeason || !tmdbId) {
      return;
    }

    let cancelled = false;

    const loadSeason = async () => {
      setLoadingEpisodes(true);
      setEpisodes([]);
      try {
        const res = await fetch(`/api/tmdb-details?id=${tmdbId}&type=tv&season=${selectedSeason}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setEpisodes(data.episodes || []);
        }
      } catch (error) {
        console.error('Failed to load season', error);
      } finally {
        if (!cancelled) {
          setLoadingEpisodes(false);
        }
      }
    };

    void loadSeason();

    return () => {
      cancelled = true;
    };
  }, [mediaType, selectedSeason, tmdbId]);

  useEffect(() => {
    if (mediaType !== 'tv' || !selectedSeason || !tmdbId) {
      return;
    }

    const key = `${tmdbId}:${selectedSeason}`;
    if (seasonTrailers[key] !== undefined) {
      return;
    }

    let cancelled = false;

    const loadSeasonTrailer = async () => {
      try {
        const params = new URLSearchParams({
          tmdbId: String(tmdbId),
          mediaType: 'tv',
          season: String(selectedSeason),
        });
        const res = await fetch(`/api/trailer?${params}`);
        if (!res.ok) {
          if (!cancelled) {
            setSeasonTrailers((prev) => ({ ...prev, [key]: null }));
          }
          return;
        }

        const data = (await res.json()) as TrailerData;
        if (!cancelled) {
          setSeasonTrailers((prev) => ({ ...prev, [key]: isTrailerVideo(data) ? data : null }));
        }
      } catch {
        if (!cancelled) {
          setSeasonTrailers((prev) => ({ ...prev, [key]: null }));
        }
      }
    };

    void loadSeasonTrailer();

    return () => {
      cancelled = true;
    };
  }, [mediaType, seasonTrailers, selectedSeason, tmdbId]);

  useEffect(() => {
    if (mediaType !== 'tv' || !selectedSeason || episodes.length === 0 || !tmdbId) {
      return;
    }

    const missingEpisodes = episodes.filter((episode) => {
      const key = `${tmdbId}:${selectedSeason}:${episode.episodeNumber}`;
      return episodeTrailers[key] === undefined;
    });

    if (missingEpisodes.length === 0) {
      return;
    }

    let cancelled = false;

    const loadEpisodeTrailers = async () => {
      const entries = await Promise.all(
        missingEpisodes.map(async (episode) => {
          const key = `${tmdbId}:${selectedSeason}:${episode.episodeNumber}`;
          try {
            const params = new URLSearchParams({
              tmdbId: String(tmdbId),
              mediaType: 'tv',
              season: String(selectedSeason),
              episode: String(episode.episodeNumber),
            });
            const res = await fetch(`/api/trailer?${params}`);
            if (!res.ok) {
              return [key, null] as const;
            }
            const data = (await res.json()) as TrailerData;
            return [key, isTrailerVideo(data) ? data : null] as const;
          } catch {
            return [key, null] as const;
          }
        })
      );

      if (!cancelled) {
        setEpisodeTrailers((prev) => ({
          ...prev,
          ...Object.fromEntries(entries),
        }));
      }
    };

    void loadEpisodeTrailers();

    return () => {
      cancelled = true;
    };
  }, [episodeTrailers, episodes, mediaType, selectedSeason, tmdbId]);

  const openPerson = async (personId: number) => {
    if (!personId) {
      return;
    }

    setPersonModalOpen(true);
    setPersonData(null);
    setLoadingPerson(true);
    setVisiblePersonCredits(8);
    setPersonCreditFilter('all');
    setPersonCreditSort('date');

    try {
      const res = await fetch(`/api/tmdb-person?id=${personId}`);
      if (!res.ok) {
        throw new Error('Failed to load person details');
      }
      const data = await res.json();
      setPersonData(data);
    } catch (error) {
      console.error('Failed to fetch person details', error);
    } finally {
      setLoadingPerson(false);
    }
  };

  const loadMorePersonCredits = () => {
    setVisiblePersonCredits((prev) => prev + 12);
  };

  const syncWatchlistState = async () => {
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return;
    }

    try {
      const res = await fetch('/api/watchlist');
      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const items: WatchlistItem[] = data.items || [];
      const found = items.find((item) => Number(item.tmdbId) === tmdbId && item.mediaType === mediaType);

      if (found) {
        setIsInWatchlist(true);
        setWatchlistItemId(Number(found.id));
      } else {
        setIsInWatchlist(false);
        setWatchlistItemId(null);
      }
    } catch {
      // Keep UI usable even if lookup fails.
    }
  };

  useEffect(() => {
    void syncWatchlistState();
  }, [mediaType, tmdbId]);

  const handleWatchlistToggle = async () => {
    if (!activeDetails || watchlistBusy) {
      return;
    }

    setWatchlistBusy(true);

    try {
      if (isInWatchlist && watchlistItemId) {
        await fetch(`/api/watchlist?id=${watchlistItemId}`, { method: 'DELETE' });
      } else {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdbId,
            mediaType,
            title: activeDetails.title,
            posterPath: activeDetails.posterPath,
            backdropPath: activeDetails.backdropPath,
            overview: activeDetails.overview,
            rating: activeDetails.rating,
            imdbRating: activeDetails.imdbRating,
            year: activeDetails.year,
            genres: activeDetails.genres,
          }),
        });
      }

      await syncWatchlistState();
    } catch (error) {
      console.error('Failed to update watchlist:', error);
    } finally {
      setWatchlistBusy(false);
    }
  };

  const pageTitle = useMemo(() => {
    return activeDetails?.title || (mediaType === 'movie' ? 'Movie Details' : 'TV Show Details');
  }, [activeDetails, mediaType]);

  const pageOverview = activeDetails?.overview || '';
  const backdropPath = activeDetails?.backdropPath || activeDetails?.posterPath;

  const normalizedTrailerKey = useMemo(() => {
    if (!trailer?.key) {
      return null;
    }

    const rawKey = trailer.key.trim();
    const watchMatch = rawKey.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    const shortMatch = rawKey.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
    const embedMatch = rawKey.match(/embed\/([A-Za-z0-9_-]{6,})/);
    const extracted = watchMatch?.[1] || shortMatch?.[1] || embedMatch?.[1] || rawKey;
    const cleaned = extracted.replace(/[^A-Za-z0-9_-]/g, '');

    return cleaned || null;
  }, [trailer?.key]);

  const heroTrailerUrl = trailer?.site === 'YouTube' && normalizedTrailerKey && !heroPaused
    ? `https://www.youtube.com/embed/${normalizedTrailerKey}?autoplay=1&mute=${heroMuted ? 1 : 0}&loop=1&playlist=${normalizedTrailerKey}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`
    : null;

  const tvFirstPlayableEpisode = selectedSeason && episodes.length > 0 ? episodes[0].episodeNumber : 1;
  const selectedSeasonTrailerKey = mediaType === 'tv' && selectedSeason ? `${tmdbId}:${selectedSeason}` : null;
  const selectedSeasonTrailer = selectedSeasonTrailerKey ? seasonTrailers[selectedSeasonTrailerKey] : null;
  const genreList = (activeDetails?.genres || '').split(',').map((g) => g.trim()).filter(Boolean);
  const logoUrl = activeDetails?.logoPath ? `https://image.tmdb.org/t/p/w500${activeDetails.logoPath}` : null;
  const heroCast = activeDetails?.cast?.slice(0, 8) || [];
  const tvSeasonCount = tvDetails?.numberOfSeasons ?? null;
  const totalEpisodeCount = useMemo(() => {
    if (!tvDetails?.seasons?.length) {
      return null;
    }

    const total = tvDetails.seasons.reduce((sum, season) => sum + (season.episodeCount || 0), 0);
    return total > 0 ? total : null;
  }, [tvDetails?.seasons]);

  const handleBack = () => {
    useAppStore.getState().setActiveTab('discover');
    useAppStore.getState().setDiscoverMode('online');
    router.push('/?tab=discover');
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-white">
      <DetailTabNav activeTab="discover" />
      <section className="relative min-h-screen overflow-hidden border-b border-neutral-900 flex flex-col">
        <div className="absolute inset-0 bg-black" />

        <button
          onClick={handleBack}
          className="absolute left-4 top-20 z-40 h-11 w-11 rounded-2xl liquid-glass-pill border border-white/20 hover:border-white/40 text-neutral-200 hover:text-white hover:scale-105 transition-all inline-flex items-center justify-center shadow-xl backdrop-blur-xl md:left-6 md:top-26 cursor-pointer"
          title="Back to Discover"
          aria-label="Back to Discover"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {heroTrailerUrl ? (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 h-[145%] w-[290%] -translate-x-1/2 -translate-y-1/2 sm:w-[240%] md:w-[190%] lg:w-[170%]">
              <iframe
                src={heroTrailerUrl}
                title={`${pageTitle} Trailer Background`}
                className="h-full w-full pointer-events-none opacity-88"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen *"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        ) : backdropPath ? (
          <img
            src={`https://image.tmdb.org/t/p/original${backdropPath}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-88 animate-heroFade"
          />
        ) : null}

        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/20 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/25 to-transparent pointer-events-none" />

        <div className="relative z-20 flex-1 px-6 sm:px-10 md:px-14 lg:px-16 pt-36 sm:pt-42 md:pt-48 lg:pt-52 flex flex-col items-start justify-start pb-12 sm:pb-16 md:pb-20 max-w-4xl">
          {loadingDetails ? (
            <div className="flex items-center gap-3 text-neutral-300 pb-12">
              <Loader2 className="w-6 h-6 animate-spin" />
              Loading details...
            </div>
          ) : (
            <div className="w-full">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={pageTitle}
                  className="h-14 sm:h-20 md:h-24 lg:h-28 w-auto max-w-[92%] object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.8)]"
                />
              ) : (
                <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[0.95] tracking-tight uppercase text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.8)]">
                  {pageTitle}
                </h1>
              )}

              {pageOverview && (
                <p className="mt-4 text-base sm:text-lg md:text-xl text-neutral-100 max-w-2xl leading-relaxed line-clamp-4 drop-shadow-md">
                  {pageOverview}
                </p>
              )}

              {/* Metadata Row: Ratings, Year, Duration under Title and Description */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 mt-4 text-xs sm:text-sm md:text-base font-semibold">
                {activeRating != null && activeRating > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-pill font-bold text-amber-300 border border-amber-400/30 text-xs sm:text-sm shadow-sm">
                    {activeDetails?.imdbRating ? (
                      <span className="px-1.5 py-0.5 bg-[#F5C518] text-black font-black text-[10px] rounded-md tracking-tight leading-none">IMDb</span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 font-bold text-[10px] rounded-md tracking-tight border border-amber-400/40 leading-none">TMDB</span>
                    )}
                    <span>{activeRating.toFixed(1)}</span>
                  </span>
                )}

                {activeDetails?.rottenTomatoes && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-pill text-neutral-100 font-bold border border-white/15 text-xs sm:text-sm shadow-sm">
                    <RottenTomatoesIcon
                      score={parseInt(activeDetails.rottenTomatoes.replace('%', ''), 10) || 100}
                      className="w-4 h-4 shrink-0"
                    />
                    <span>{activeDetails.rottenTomatoes}</span>
                  </span>
                )}

                {activeDetails?.year && (
                  <span className="px-3 py-1.5 rounded-xl liquid-glass-pill text-neutral-200 border border-white/10 text-xs sm:text-sm font-medium">
                    {activeDetails.year}
                  </span>
                )}

                {mediaType === 'movie' && movieDetails?.runtime && (
                  <span className="px-3 py-1.5 rounded-xl liquid-glass-pill text-neutral-200 border border-white/10 text-xs sm:text-sm font-medium">
                    {Math.floor(movieDetails.runtime / 60)}h {movieDetails.runtime % 60}m
                  </span>
                )}

                {mediaType === 'tv' && tvDetails?.status && (
                  <span className="px-3 py-1.5 rounded-xl liquid-glass-pill text-neutral-200 border border-white/10 text-xs sm:text-sm font-medium">
                    {tvDetails.status}
                  </span>
                )}

                {mediaType === 'tv' && tvSeasonCount !== null && tvSeasonCount > 0 && (
                  <span className="px-3 py-1.5 rounded-xl liquid-glass-pill text-neutral-200 border border-white/10 text-xs sm:text-sm font-medium">
                    {tvSeasonCount} Season{tvSeasonCount > 1 ? 's' : ''}
                  </span>
                )}

                {mediaType === 'tv' && totalEpisodeCount !== null && (
                  <span className="px-3 py-1.5 rounded-xl liquid-glass-pill text-neutral-200 border border-white/10 text-xs sm:text-sm font-medium">
                    {totalEpisodeCount} Episode{totalEpisodeCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {genreList.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {genreList.map((genre) => (
                    <span key={genre} className="text-xs sm:text-sm px-3.5 py-1.5 rounded-xl liquid-glass-pill border border-white/15 text-neutral-200 font-medium shadow-sm">
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {heroCast.length > 0 && (
                <div className="mt-5 w-full max-w-3xl">
                  <p className="text-xs sm:text-sm font-bold tracking-wider uppercase text-neutral-300 mb-2.5 drop-shadow-sm">Cast & Crew</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {heroCast.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => openPerson(member.id)}
                        className="w-full flex items-center gap-3 rounded-2xl liquid-glass-card border border-white/10 hover:border-white/25 px-3.5 py-2.5 transition-all duration-200 hover:scale-[1.02] shadow-md cursor-pointer group text-left"
                      >
                        {member.profilePath ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${member.profilePath}`}
                            alt={member.name}
                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover ring-1 ring-white/20 group-hover:ring-white/40 transition shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 flex items-center justify-center ring-1 ring-white/20 shrink-0">
                            <User className="w-5 h-5 text-neutral-400" />
                          </div>
                        )}
                        <div className="text-left min-w-0">
                          <p className="text-sm sm:text-base font-semibold text-neutral-100 group-hover:text-white leading-tight truncate">{member.name}</p>
                          <p className="text-xs sm:text-sm text-neutral-400 leading-tight truncate mt-0.5">{member.character}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    if (!tmdbId || !activeDetails) return;
                    if (mediaType === 'movie') {
                      setStreamModal({ tmdbId, type: 'movie', title: activeDetails.title });
                    } else {
                      setStreamModal({
                        tmdbId,
                        type: 'tv',
                        title: `${activeDetails.title} - S${selectedSeason || 1}E${tvFirstPlayableEpisode}`,
                        season: selectedSeason || 1,
                        episode: tvFirstPlayableEpisode,
                      });
                    }
                  }}
                  className="liquid-btn-primary px-6 py-3.5 rounded-2xl text-sm sm:text-base font-bold inline-flex items-center gap-2.5 shadow-xl hover:scale-105 transition-all cursor-pointer"
                >
                  <Play className="w-4.5 h-4.5 fill-black" /> Watch Now
                </button>

                <button aria-label="Watch trailer"
                  onClick={() => setTrailerModal({ title: pageTitle })}
                  className="w-12 h-12 rounded-2xl liquid-glass-pill border border-white/20 hover:border-white/40 hover:scale-105 inline-flex items-center justify-center shadow-lg transition-all text-neutral-200 hover:text-white cursor-pointer"
                  title="Watch trailer"
                >
                  <Play className="w-4.5 h-4.5" />
                </button>

                <button aria-label={isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                  onClick={handleWatchlistToggle}
                  className={`w-12 h-12 rounded-2xl border transition-all inline-flex items-center justify-center shadow-lg cursor-pointer ${
                    isInWatchlist
                      ? 'liquid-glass-pill-active border-white/40 text-white font-bold'
                      : 'liquid-glass-pill border-white/20 text-neutral-200 hover:text-white hover:scale-105'
                  } ${watchlistBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
                  title={isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                  disabled={watchlistBusy}
                >
                  {watchlistBusy ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : isInWatchlist ? <Check className="w-4.5 h-4.5" /> : <Plus className="w-4.5 h-4.5" />}
                </button>

                <button
                  onClick={() => setDownloadModal({
                    title: pageTitle,
                    year: activeDetails?.year || null,
                    mediaType,
                    posterPath: activeDetails?.posterPath || null,
                    tmdbId: activeDetails?.id || tmdbId || undefined,
                  })}
                  className="liquid-glass-pill px-5 py-3.5 rounded-2xl border border-white/20 hover:border-white/40 hover:scale-105 text-white font-semibold text-sm sm:text-base inline-flex items-center gap-2.5 shadow-lg transition-all cursor-pointer"
                >
                  <Download className="w-4.5 h-4.5" /> Download
                </button>

              </div>

              {trailerLoading && !heroTrailerUrl && (
                <p className="mt-4 text-xs text-neutral-400 inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing cinematic background...
                </p>
              )}
            </div>
          )}
        </div>

        <div className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2.5">
          <button aria-label={heroPaused ? 'Play background' : 'Pause background'}
            onClick={() => setHeroPaused((prev) => !prev)}
            className="w-11 h-11 rounded-2xl liquid-glass-pill border border-white/20 hover:border-white/40 hover:scale-105 inline-flex items-center justify-center shadow-xl text-neutral-200 hover:text-white transition-all cursor-pointer"
            title={heroPaused ? 'Play background' : 'Pause background'}
          >
            {heroPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button aria-label={heroMuted ? 'Unmute background' : 'Mute background'}
            onClick={() => setHeroMuted((prev) => !prev)}
            className="w-11 h-11 rounded-2xl liquid-glass-pill border border-white/20 hover:border-white/40 hover:scale-105 inline-flex items-center justify-center shadow-xl text-neutral-200 hover:text-white transition-all cursor-pointer"
            title={heroMuted ? 'Unmute background' : 'Mute background'}
          >
            {heroMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

      </section>

      <main className="px-6 md:px-12 py-6 md:py-8 space-y-10">
        {mediaType === 'tv' && tvDetails && (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold">Seasons & Episodes</h2>
              {isTrailerVideo(selectedSeasonTrailer) && (
                <button aria-label={`Watch ${pageTitle} season ${selectedSeason} trailer`}
                  onClick={() => setTrailerModal({
                    title: `${pageTitle} - Season ${selectedSeason} Trailer`,
                    season: selectedSeason || undefined,
                  })}
                  className="w-fit px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5"
                  title={`Watch ${pageTitle} season ${selectedSeason} trailer`}
                >
                  <PlayCircle className="w-3.5 h-3.5" /> Season Trailer
                </button>
              )}
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
              {tvDetails.seasons.map((season) => (
                <button
                  key={season.seasonNumber}
                  onClick={() => setSelectedSeason(season.seasonNumber)}
                  className={`px-4.5 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedSeason === season.seasonNumber
                      ? 'liquid-glass-pill-active font-bold border-white/40 text-white shadow-md'
                      : 'liquid-glass-pill border border-white/10 text-neutral-300 hover:text-white'
                  }`}
                >
                  {season.name} ({season.episodeCount})
                </button>
              ))}
            </div>

            {loadingEpisodes ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-neutral-400" />
              </div>
            ) : episodes.length > 0 ? (
              <div className="space-y-3">
                {episodes.map((ep) => {
                  const seasonNumber = selectedSeason || 1;
                  const trailerKey = `${tmdbId}:${seasonNumber}:${ep.episodeNumber}`;
                  const episodeTrailer = episodeTrailers[trailerKey];
                  const hasEpisodeTrailer = isTrailerVideo(episodeTrailer);

                  return (
                    <div key={ep.episodeNumber} className="flex flex-col md:flex-row gap-3.5 p-3.5 liquid-glass-card border border-white/10 rounded-2xl shadow-md transition-all hover:border-white/25">
                      {ep.stillPath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w300${ep.stillPath}`}
                          alt=""
                          className="w-full md:w-44 h-26 object-cover rounded-xl border border-white/10 shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-full md:w-44 h-26 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-neutral-500 font-bold shrink-0">
                          E{ep.episodeNumber}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm sm:text-base font-semibold text-neutral-100">E{ep.episodeNumber} · {ep.title}</p>
                          {ep.rating != null && ep.rating > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg liquid-glass-pill border border-amber-400/30 text-amber-300 text-[10px] font-bold">
                              TMDB {ep.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {ep.overview && <p className="text-xs sm:text-sm text-neutral-400 mt-1 line-clamp-2">{ep.overview}</p>}
                        <div className="mt-3 flex flex-wrap gap-2.5">
                          <button
                            onClick={() => setStreamModal({
                              tmdbId,
                              type: 'tv',
                              title: `${pageTitle} - S${selectedSeason || 1}E${ep.episodeNumber}`,
                              season: selectedSeason || 1,
                              episode: ep.episodeNumber,
                            })}
                            className="liquid-btn-primary px-4 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-md hover:scale-105 transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-black" /> Watch
                          </button>
                          {hasEpisodeTrailer && (
                            <button aria-label={`Watch ${ep.title} trailer`}
                              onClick={() => setTrailerModal({
                                title: `${pageTitle} - S${seasonNumber}E${ep.episodeNumber} · ${ep.title}`,
                                season: seasonNumber,
                                episode: ep.episodeNumber,
                              })}
                              className="liquid-glass-pill px-4 py-2 rounded-xl border border-white/15 text-neutral-200 hover:text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-md hover:scale-105 transition-all cursor-pointer"
                              title={`Watch ${ep.title} trailer`}
                            >
                              <PlayCircle className="w-3.5 h-3.5" /> Trailer
                            </button>
                          )}
                          <button
                            onClick={() => setDownloadModal({
                              title: `${pageTitle} S${String(selectedSeason || 1).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
                              mediaType: 'tv',
                              posterPath: ep.stillPath || activeDetails?.posterPath,
                              tmdbId: activeDetails?.id || tmdbId || undefined,
                              season: selectedSeason || 1,
                              episode: ep.episodeNumber,
                            })}
                            className="liquid-glass-pill px-4 py-2 rounded-xl border border-white/15 text-neutral-200 hover:text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-md hover:scale-105 transition-all cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> Download
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No episodes available for this season.</p>
            )}
          </section>
        )}

        {(loadingCollection || collectionData) && (
          <section className="mb-10">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Film className="w-5 h-5 text-blue-500" />
              {collectionData ? `Part of ${collectionData.name}` : 'Loading Collection...'}
            </h2>
            {loadingCollection ? (
              <div className="flex gap-3 overflow-x-auto pt-2 px-1 -mx-1 pb-4 custom-scrollbar">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="w-36 sm:w-44 shrink-0 rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900/60 animate-pulse">
                    <div className="aspect-[2/3] bg-neutral-800" />
                  </div>
                ))}
              </div>
            ) : collectionData && (
              <div className="flex gap-3 overflow-x-auto pt-2 px-1 -mx-1 pb-4 custom-scrollbar">
                {collectionData.parts.map((part) => {
                  const isCurrent = part.tmdbId === tmdbId;
                  return (
                    <div key={part.tmdbId} className={`w-36 sm:w-44 shrink-0 ${isCurrent ? 'ring-2 ring-blue-500 rounded-xl scale-[1.02] transition-transform' : ''}`}>
                      <ContentCard
                        item={{
                          id: part.tmdbId,
                          type: 'movie',
                          title: part.title,
                          posterPath: part.posterPath,
                          backdropPath: part.backdropPath,
                          overview: part.overview,
                          rating: part.rating,
                          year: part.year ? parseInt(part.year, 10) : undefined,
                        }}
                        onClick={() => {
                          if (!isCurrent) router.push(`/discover/movie/${part.tmdbId}`);
                        }}
                        showProgress={false}
                        showRating
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold mb-3">More Like This</h2>
          {loadingSimilar ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900/60 animate-pulse">
                  <div className="aspect-[2/3] bg-neutral-800" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {similarItems.map((item, idx) => (
                <div key={`${item.mediaType}-${item.tmdbId}-${idx}`}>
                  <ContentCard
                    item={toDiscoverContentCardItem(item)}
                    onClick={() => router.push(`/discover/${item.mediaType}/${item.tmdbId}`)}
                    showProgress={false}
                    showRating
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {personModalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setPersonModalOpen(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] liquid-glass-menu border border-white/15 rounded-3xl overflow-hidden flex flex-col shadow-2xl backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between sticky top-0 bg-neutral-900/90 backdrop-blur-xl z-10">
              <div>
                <h3 className="text-xl font-bold">Cast Filmography</h3>
                {personData && <p className="text-xs text-neutral-400 mt-1">{personData.name}</p>}
              </div>
              <button
                onClick={() => setPersonModalOpen(false)}
                className="p-2.5 liquid-glass-pill hover:scale-105 border border-white/15 rounded-full text-neutral-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
              {loadingPerson && (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-7 h-7 animate-spin text-neutral-400" />
                </div>
              )}

              {!loadingPerson && personData && (
                <>
                  <div className="flex gap-4 mb-5">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 flex items-center justify-center shadow-md">
                      {personData.profilePath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${personData.profilePath}`}
                          alt={personData.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-8 h-8 text-neutral-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-lg font-semibold">{personData.name}</h4>
                      {personData.biography && (
                        <p className="text-sm text-neutral-400 mt-1 line-clamp-4">{personData.biography}</p>
                      )}
                    </div>
                  </div>

                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h5 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Movies & TV Shows</h5>
                      <p className="mt-1 text-[11px] text-neutral-400">{filteredPersonCredits.length} credits</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-xl border border-white/10 liquid-glass-pill p-1 gap-1">
                        {personCreditFilters.map((filter) => {
                          const count = filter.value === 'all'
                            ? personData.credits.length
                            : personData.credits.filter((credit) => credit.mediaType === filter.value).length;

                          return (
                            <button
                              key={filter.value}
                              type="button"
                              onClick={() => setPersonCreditFilter(filter.value)}
                              className={`min-h-[42px] px-4 text-sm font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                                personCreditFilter === filter.value
                                  ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                  : 'text-neutral-300 hover:text-white hover:bg-white/5'
                              }`}
                              aria-pressed={personCreditFilter === filter.value}
                            >
                              {filter.label} ({count})
                            </button>
                          );
                        })}
                      </div>

                      <LiquidDropdown
                        label="Sort: Date"
                        title="Sort By"
                        options={PERSON_SORT_OPTIONS}
                        value={personCreditSort}
                        onChange={(val) => setPersonCreditSort(val as PersonCreditSort)}
                        align="right"
                        className="min-w-[140px]"
                      />
                    </div>
                  </div>
                  {personData.credits.length > 0 ? (
                    filteredPersonCredits.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {filteredPersonCredits.slice(0, visiblePersonCredits).map((credit, idx) => (
                          <button
                            key={`${credit.mediaType}-${credit.tmdbId}-${idx}`}
                            onClick={() => {
                              setPersonModalOpen(false);
                              router.push(`/discover/${credit.mediaType}/${credit.tmdbId}`);
                            }}
                            className="w-full text-left liquid-glass-card hover:border-white/30 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] shadow-md group cursor-pointer"
                          >
                            <div className="aspect-[2/3] bg-neutral-800">
                              {credit.posterPath ? (
                                <img
                                  src={`https://image.tmdb.org/t/p/w342${credit.posterPath}`}
                                  alt={credit.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  {credit.mediaType === 'movie' ? (
                                    <Film className="w-8 h-8 text-neutral-700" />
                                  ) : (
                                    <Tv className="w-8 h-8 text-neutral-700" />
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <div className="text-xs font-medium line-clamp-2">{credit.title}</div>
                              <div className="text-[10px] text-neutral-500 mt-0.5">{credit.year || 'Unknown year'}</div>
                              {credit.character && <div className="text-[10px] text-neutral-400 line-clamp-1 mt-1">as {credit.character}</div>}
                            </div>
                          </button>
                        ))}
                      </div>

                      {filteredPersonCredits.length > visiblePersonCredits && (
                        <div className="flex justify-center mt-4">
                          <button
                            onClick={loadMorePersonCredits}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition"
                          >
                            See All ({filteredPersonCredits.length - visiblePersonCredits} more)
                          </button>
                        </div>
                      )}
                    </>
                    ) : (
                      <p className="text-sm text-neutral-500">No credits match this filter.</p>
                    )
                  ) : (
                    <p className="text-sm text-neutral-500">No credits available.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {streamModal && (
        <StreamServerModal
          tmdbId={streamModal.tmdbId}
          type={streamModal.type}
          title={streamModal.title}
          season={streamModal.season}
          episode={streamModal.episode}
          onClose={() => setStreamModal(null)}
        />
      )}

      <DownloadModal
        isOpen={downloadModal !== null}
        title={downloadModal?.title || ''}
        year={downloadModal?.year}
        mediaType={downloadModal?.mediaType || 'movie'}
        posterPath={downloadModal?.posterPath}
        tmdbId={downloadModal?.tmdbId}
        season={downloadModal?.season}
        episode={downloadModal?.episode}
        onClose={() => setDownloadModal(null)}
      />

      <TrailerModal
        isOpen={trailerModal !== null}
        tmdbId={tmdbId || 0}
        mediaType={mediaType}
        title={trailerModal?.title || pageTitle}
        season={trailerModal?.season}
        episode={trailerModal?.episode}
        onClose={() => setTrailerModal(null)}
      />
    </div>
  );
}
