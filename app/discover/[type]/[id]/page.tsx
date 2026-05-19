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

type TMDBResult = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  imdbRating?: number | null;
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

function getEpisodeVideoLabel(video: TrailerData): string {
  return ['Trailer', 'Teaser', 'Clip', 'Featurette'].includes(video.type) ? video.type : 'Trailer';
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
  const [episodeTrailers, setEpisodeTrailers] = useState<Record<string, TrailerData | null>>({});

  const [streamModal, setStreamModal] = useState<{ tmdbId: number; type: 'movie' | 'tv'; title: string; season?: number; episode?: number } | null>(null);
  const [downloadModal, setDownloadModal] = useState<{ title: string; year?: string | null; mediaType: 'movie' | 'tv'; posterPath?: string | null } | null>(null);
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
            return [key, data.key ? data : null] as const;
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

  return (
    <div className="min-h-screen bg-black text-white">
      <DetailTabNav activeTab="discover" />
      <section className="relative min-h-screen overflow-hidden border-b border-neutral-900 flex flex-col">
        <div className="absolute inset-0 bg-black" />

        <button
          onClick={() => router.back()}
          className="absolute left-4 top-20 z-40 h-10 w-10 rounded-full bg-black/45 text-white border border-neutral-500/60 hover:bg-black/70 transition inline-flex items-center justify-center backdrop-blur-md md:left-6 md:top-28"
          title="Back to Discover"
          aria-label="Back to Discover"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {heroTrailerUrl ? (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/2 h-[145%] w-[290%] -translate-x-1/2 -translate-y-1/2 sm:w-[240%] md:w-[190%] lg:w-[170%]">
              <iframe
                src={heroTrailerUrl}
                title={`${pageTitle} Trailer Background`}
                className="h-full w-full pointer-events-none opacity-72"
                allow="autoplay; encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        ) : backdropPath ? (
          <img
            src={`https://image.tmdb.org/t/p/original${backdropPath}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-74 animate-heroFade"
          />
        ) : null}

        <div className="absolute inset-0 bg-gradient-to-r from-black/62 via-black/22 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/35 to-transparent" />

        <div className="relative z-20 flex-1 px-4 sm:px-6 md:px-10 lg:px-12 pt-24 sm:pt-28 md:pt-44 flex flex-col items-start justify-start pb-10 sm:pb-14 md:pb-20">
          {loadingDetails ? (
            <div className="flex items-center gap-3 text-neutral-300 pb-12">
              <Loader2 className="w-6 h-6 animate-spin" />
              Loading details...
            </div>
          ) : (
            <div className="w-full max-w-5xl rounded-2xl bg-black/16 backdrop-blur-[4px] p-4 sm:p-6 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5 mb-3 text-xs sm:text-sm md:text-base font-semibold">
                <span className="px-2.5 py-1 rounded-md bg-[#F5C518] text-black font-bold shadow-sm">{activeRatingSource} {activeRating?.toFixed(1) || 'N/A'}</span>
                {activeDetails?.year && <span className="text-neutral-200">{activeDetails.year}</span>}
                {mediaType === 'movie' && movieDetails?.runtime && <span className="text-neutral-200">{Math.floor(movieDetails.runtime / 60)}h {movieDetails.runtime % 60}m</span>}
                {mediaType === 'tv' && tvDetails?.status && <span className="text-neutral-200">{tvDetails.status}</span>}
                {mediaType === 'tv' && tvSeasonCount !== null && tvSeasonCount > 0 && (
                  <span className="text-neutral-200">{tvSeasonCount} Season{tvSeasonCount > 1 ? 's' : ''}</span>
                )}
                {mediaType === 'tv' && totalEpisodeCount !== null && (
                  <span className="text-neutral-200">{totalEpisodeCount} Episode{totalEpisodeCount > 1 ? 's' : ''}</span>
                )}
              </div>

              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={pageTitle}
                  className="h-14 sm:h-20 md:h-24 lg:h-28 w-auto max-w-[96%] object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]"
                />
              ) : (
                <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[0.95] tracking-tight uppercase text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.6)]">
                  {pageTitle}
                </h1>
              )}

              {pageOverview && (
                <p className="mt-4 text-base sm:text-lg md:text-xl text-neutral-100 max-w-2xl leading-relaxed line-clamp-5">
                  {pageOverview}
                </p>
              )}

              {genreList.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {genreList.map((genre) => (
                    <span key={genre} className="text-xs sm:text-sm px-3 py-1.5 rounded-md bg-black/50 border border-neutral-600 text-neutral-100">
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {heroCast.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs sm:text-sm font-semibold tracking-wide uppercase text-neutral-300 mb-2">Cast & Crew</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {heroCast.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => openPerson(member.id)}
                        className="w-full flex items-center gap-3 rounded-xl bg-black/35 border border-neutral-700/70 px-3 py-2.5 hover:bg-black/55 transition"
                      >
                        {member.profilePath ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${member.profilePath}`}
                            alt={member.name}
                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-neutral-800 flex items-center justify-center">
                            <User className="w-5 h-5 text-neutral-500" />
                          </div>
                        )}
                        <div className="text-left">
                          <p className="text-sm sm:text-base font-medium text-neutral-100 leading-tight">{member.name}</p>
                          <p className="text-xs sm:text-sm text-neutral-400 leading-tight">{member.character}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2.5">
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
                  className="px-5 py-3.5 rounded-xl bg-white text-black hover:bg-neutral-200 font-bold text-sm sm:text-base inline-flex items-center gap-2 transition"
                >
                  <Play className="w-4 h-4 fill-black" /> Watch Now
                </button>

                <button
                  onClick={() => setTrailerModal({ title: pageTitle })}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-black/45 border border-neutral-500/60 hover:bg-black/70 inline-flex items-center justify-center backdrop-blur-md"
                  title="Watch trailer"
                >
                  <Play className="w-4 h-4" />
                </button>

                <button
                  onClick={handleWatchlistToggle}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl border inline-flex items-center justify-center backdrop-blur-md transition ${
                    isInWatchlist
                      ? 'bg-[#e4e078]/90 text-black border-[#e4e078]/60 hover:bg-[#f0ea8f]'
                      : 'bg-black/45 border-neutral-500/60 hover:bg-black/70'
                  } ${watchlistBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
                  title={isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                  disabled={watchlistBusy}
                >
                  {watchlistBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : isInWatchlist ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setDownloadModal({
                    title: pageTitle,
                    year: activeDetails?.year || null,
                    mediaType,
                    posterPath: activeDetails?.posterPath || null,
                  })}
                  className="px-4 py-3.5 rounded-xl bg-neutral-700/80 hover:bg-neutral-600 text-white font-semibold text-sm sm:text-base inline-flex items-center gap-2 transition"
                >
                  <Download className="w-4 h-4" /> Download
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

        <div className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
          <button
            onClick={() => setHeroPaused((prev) => !prev)}
            className="w-11 h-11 rounded-full bg-black/50 hover:bg-black/75 border border-neutral-500/60 inline-flex items-center justify-center backdrop-blur-md"
            title={heroPaused ? 'Play background' : 'Pause background'}
          >
            {heroPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setHeroMuted((prev) => !prev)}
            className="w-11 h-11 rounded-full bg-black/50 hover:bg-black/75 border border-neutral-500/60 inline-flex items-center justify-center backdrop-blur-md"
            title={heroMuted ? 'Unmute background' : 'Mute background'}
          >
            {heroMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

      </section>

      <main className="px-6 md:px-12 py-6 md:py-8 space-y-10">
        {mediaType === 'tv' && tvDetails && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold">Seasons & Episodes</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {tvDetails.seasons.map((season) => (
                <button
                  key={season.seasonNumber}
                  onClick={() => setSelectedSeason(season.seasonNumber)}
                  className={`px-4 py-2 rounded-full border text-sm font-semibold whitespace-nowrap transition ${
                    selectedSeason === season.seasonNumber
                      ? 'bg-white/15 border-white/40 text-white'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {season.name} ({season.episodeCount})
                </button>
              ))}
            </div>

            {loadingEpisodes ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
              </div>
            ) : episodes.length > 0 ? (
              <div className="space-y-2">
                {episodes.map((ep) => {
                  const seasonNumber = selectedSeason || 1;
                  const trailerKey = `${tmdbId}:${seasonNumber}:${ep.episodeNumber}`;
                  const episodeTrailer = episodeTrailers[trailerKey];
                  const episodeVideoLabel = episodeTrailer ? getEpisodeVideoLabel(episodeTrailer) : 'Trailer';

                  return (
                    <div key={ep.episodeNumber} className="flex flex-col md:flex-row gap-3 p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl">
                      {ep.stillPath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w300${ep.stillPath}`}
                          alt=""
                          className="w-full md:w-40 h-24 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full md:w-40 h-24 bg-neutral-800 rounded-lg flex items-center justify-center text-neutral-600 font-bold">
                          E{ep.episodeNumber}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">E{ep.episodeNumber} · {ep.title}</p>
                          {ep.rating != null && ep.rating > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
                              TMDB {ep.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {ep.overview && <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{ep.overview}</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            onClick={() => setStreamModal({
                              tmdbId,
                              type: 'tv',
                              title: `${pageTitle} - S${selectedSeason || 1}E${ep.episodeNumber}`,
                              season: selectedSeason || 1,
                              episode: ep.episodeNumber,
                            })}
                            className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Play className="w-3 h-3 fill-black" /> Watch
                          </button>
                          {episodeTrailer && (
                            <button
                              onClick={() => setTrailerModal({
                                title: `${pageTitle} - S${seasonNumber}E${ep.episodeNumber} · ${ep.title}`,
                                season: seasonNumber,
                                episode: ep.episodeNumber,
                              })}
                              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-200 text-xs font-semibold inline-flex items-center gap-1"
                              title={`Watch ${ep.title} trailer`}
                            >
                              <PlayCircle className="w-3 h-3" /> {episodeVideoLabel}
                            </button>
                          )}
                          <button
                            onClick={() => setDownloadModal({
                              title: `${pageTitle} S${String(selectedSeason || 1).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
                              mediaType: 'tv',
                              posterPath: ep.stillPath || activeDetails?.posterPath,
                            })}
                            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> Download
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
        <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPersonModalOpen(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Cast Filmography</h3>
                {personData && <p className="text-xs text-neutral-400 mt-1">{personData.name}</p>}
              </div>
              <button
                onClick={() => setPersonModalOpen(false)}
                className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {loadingPerson && (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-7 h-7 animate-spin text-neutral-500" />
                </div>
              )}

              {!loadingPerson && personData && (
                <>
                  <div className="flex gap-4 mb-5">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center">
                      {personData.profilePath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${personData.profilePath}`}
                          alt={personData.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-8 h-8 text-neutral-600" />
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
                      <h5 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Movies & TV Shows</h5>
                      <p className="mt-1 text-[11px] text-neutral-500">{filteredPersonCredits.length} credits</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950/50 p-1">
                        {personCreditFilters.map((filter) => {
                          const count = filter.value === 'all'
                            ? personData.credits.length
                            : personData.credits.filter((credit) => credit.mediaType === filter.value).length;

                          return (
                            <button
                              key={filter.value}
                              type="button"
                              onClick={() => setPersonCreditFilter(filter.value)}
                              className={`min-h-8 px-3 text-xs font-semibold rounded-md transition whitespace-nowrap ${
                                personCreditFilter === filter.value
                                  ? 'bg-white text-black'
                                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                              }`}
                              aria-pressed={personCreditFilter === filter.value}
                            >
                              {filter.label} ({count})
                            </button>
                          );
                        })}
                      </div>

                      <select
                        value={personCreditSort}
                        onChange={(event) => setPersonCreditSort(event.target.value as PersonCreditSort)}
                        className="min-h-10 bg-neutral-950/50 text-neutral-200 text-xs font-semibold rounded-lg px-3 border border-neutral-800 focus:outline-none focus:border-neutral-500"
                        aria-label="Sort cast credits"
                      >
                        <option value="date">Sort: Date</option>
                        <option value="rating">Sort: Rating</option>
                        <option value="popular">Sort: Popular</option>
                      </select>
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
                            className="w-full text-left bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden transition"
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
