'use client';

import type React from 'react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { X, Play, Clock, Film, Tv, Loader2, PlayCircle, Globe, User, BellRing, BellOff, Sparkles } from 'lucide-react';
import TrailerModal from './TrailerModal';
import StreamServerModal from './StreamServerModal';
import ContentCard, { type ContentItem as DiscoverContentCardItem } from './ContentCard';
import TMDBImage from './TMDBImage';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';
import LiquidDropdown from './LiquidDropdown';
import { triggerHaptic } from '@/lib/haptics';

const QUALITY_OPTIONS = [
    { id: 'best', name: 'Best Available' },
    { id: '2160p', name: '4K / 2160p' },
    { id: '1080p', name: '1080p' },
    { id: '720p', name: '720p' },
    { id: 'any', name: 'Fallback (Any)' },
];

const PERSON_SORT_OPTIONS = [
    { id: 'date', name: 'Sort: Date' },
    { id: 'rating', name: 'Sort: Rating' },
    { id: 'popular', name: 'Sort: Popular' },
];

type ContentItem = {
    id: number;
    tmdbId?: number | null;
    type: 'movie' | 'show';
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    genres?: string | null;
    language?: string | null;
    year?: number;
    firstAirDate?: string | null;
    rating: number | null;
    imdbRating?: number | null;
    isHDR?: boolean;
    resolution?: string | null;
    videoCodec?: string | null;
    audioCodec?: string | null;
    audioChannels?: string | null;
    filePath?: string;
    watchProgress?: {
        progress: number;
        duration: number;
        completed: number;
    };
};

type Props = {
    item: ContentItem;
    onClose: () => void;
    onPlay: () => void;
    onViewEpisodes?: () => void;
    onFixMatch?: () => void;
    onOpenOnline?: (item: {
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
    }) => void;
};

type TmdbCast = {
    id: number;
    name: string;
    character: string;
    profilePath: string | null;
};

type TmdbMovieDetails = {
    overview: string | null;
    tagline: string | null;
    genres: string;
    runtime: number | null;
    collection: {
        id: number;
        name: string;
        posterPath: string | null;
        backdropPath: string | null;
    } | null;
    cast: TmdbCast[];
};

type TmdbTvDetails = {
    overview: string | null;
    tagline: string | null;
    genres: string;
    status: string | null;
    cast: TmdbCast[];
};

type TmdbResult = {
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

type PersonCredit = TmdbResult & {
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

type AutoTrackEntry = {
    showId: number;
    enabled: number;
    qualityPreference: string;
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
        year: string | null;
        releaseDate: string | null;
    }[];
};

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function toDiscoverContentCardItem(item: TmdbResult): DiscoverContentCardItem {
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

export default function ContentDetailModal({ item, onClose, onPlay, onViewEpisodes, onOpenOnline, onFixMatch }: Props) {
    const modalRef = useModalBehavior(true, onClose, { trapFocus: true });

    const [imgLoaded, setImgLoaded] = useState(false);
    const [showTrailer, setShowTrailer] = useState(false);
    const [showStreamServers, setShowStreamServers] = useState(false);
    const [tmdbMovieDetails, setTmdbMovieDetails] = useState<TmdbMovieDetails | null>(null);
    const [tmdbTvDetails, setTmdbTvDetails] = useState<TmdbTvDetails | null>(null);
    const [loadingTmdbDetails, setLoadingTmdbDetails] = useState(false);
    const [similarItems, setSimilarItems] = useState<TmdbResult[]>([]);
    const [loadingSimilar, setLoadingSimilar] = useState(false);
    const [collectionData, setCollectionData] = useState<CollectionData | null>(null);
    const [loadingCollection, setLoadingCollection] = useState(false);

    const [personModalOpen, setPersonModalOpen] = useState(false);
    const [personData, setPersonData] = useState<PersonDetails | null>(null);
    const [loadingPerson, setLoadingPerson] = useState(false);
    const [visiblePersonCredits, setVisiblePersonCredits] = useState(8);
    const [personCreditFilter, setPersonCreditFilter] = useState<PersonCreditFilter>('all');
    const [personCreditSort, setPersonCreditSort] = useState<PersonCreditSort>('date');

    const year = item.year || (item.firstAirDate ? item.firstAirDate.substring(0, 4) : '');
    const displayRating = item.imdbRating ?? item.rating;
    const displayRatingSource = item.imdbRating != null ? 'IMDb' : 'TMDB';
    const progressPercent = item.watchProgress && item.watchProgress.duration > 0
        ? (item.watchProgress.progress / item.watchProgress.duration) * 100
        : 0;
    const mediaType = item.type === 'show' ? 'tv' : 'movie';

    // Auto-track state (TV shows only)
    const [isTracking, setIsTracking] = useState(false);
    const [trackLoading, setTrackLoading] = useState(false);
    const [qualityPref, setQualityPref] = useState('best');

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

    // Check if show is being tracked
    const checkTrackingStatus = useCallback(async () => {
        if (item.type !== 'show' || !item.tmdbId) return;
        try {
            const res = await fetch('/api/auto-track');
            if (!res.ok) return;
            const data = await res.json();
            const tracked = ((data.tracked || []) as AutoTrackEntry[]).find((t) => t.showId === item.id);
            if (tracked) {
                setIsTracking(!!tracked.enabled);
                setQualityPref(tracked.qualityPreference || 'best');
            } else {
                setIsTracking(false);
            }
        } catch { /* ignore */ }
    }, [item.id, item.type, item.tmdbId]);

    useEffect(() => {
        checkTrackingStatus();
    }, [checkTrackingStatus]);

    const toggleTracking = async () => {
        if (!item.tmdbId) return;
        setTrackLoading(true);
        try {
            if (isTracking) {
                // Remove tracking
                await fetch(`/api/auto-track?showId=${item.id}`, { method: 'DELETE' });
                setIsTracking(false);
            } else {
                // Add tracking
                await fetch('/api/auto-track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        showId: item.id,
                        tmdbId: item.tmdbId,
                        title: item.title,
                        qualityPreference: qualityPref,
                    }),
                });
                setIsTracking(true);
            }
        } catch { /* ignore */ }
        setTrackLoading(false);
    };

    const updateQualityPref = async (quality: string) => {
        setQualityPref(quality);
        if (isTracking) {
            try {
                await fetch('/api/auto-track', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ showId: item.id, qualityPreference: quality }),
                });
            } catch { /* ignore */ }
        }
    };

    const activeDetails = mediaType === 'movie' ? tmdbMovieDetails : tmdbTvDetails;
    const displayOverview = activeDetails?.overview || item.overview;
    const displayGenres = activeDetails?.genres || item.genres;

    useEffect(() => {
        let cancelled = false;

        const fetchTmdbDetails = async () => {
            if (!item.tmdbId) {
                setTmdbMovieDetails(null);
                setTmdbTvDetails(null);
                setSimilarItems([]);
                setCollectionData(null);
                setLoadingTmdbDetails(false);
                setLoadingSimilar(false);
                setLoadingCollection(false);
                return;
            }

            setLoadingTmdbDetails(true);
            setLoadingSimilar(true);
            setTmdbMovieDetails(null);
            setTmdbTvDetails(null);
            setSimilarItems([]);
            setCollectionData(null);

            try {
                const [detailsResp, similarResp] = await Promise.allSettled([
                    fetch(`/api/tmdb-details?id=${item.tmdbId}&type=${mediaType}`),
                    fetch(`/api/tmdb-similar?id=${item.tmdbId}&type=${mediaType}`),
                ]);

                if (!cancelled && detailsResp.status === 'fulfilled' && detailsResp.value.ok) {
                    const detailsData = await detailsResp.value.json();
                    if (mediaType === 'movie') {
                        setTmdbMovieDetails(detailsData);
                        if (detailsData.collection?.id) {
                            setLoadingCollection(true);
                            fetch(`/api/tmdb-collection?id=${detailsData.collection.id}`)
                                .then(res => res.json())
                                .then(collData => {
                                    if (!cancelled) setCollectionData(collData as CollectionData);
                                })
                                .catch(e => console.error('Failed to fetch modal collection data', e))
                                .finally(() => {
                                    if (!cancelled) setLoadingCollection(false);
                                });
                        }
                    } else {
                        setTmdbTvDetails(detailsData);
                    }
                }

                if (!cancelled && similarResp.status === 'fulfilled' && similarResp.value.ok) {
                    const similarData = await similarResp.value.json();
                    const filtered = (similarData.results || []).filter((s: TmdbResult) => s.tmdbId !== item.tmdbId);
                    setSimilarItems(filtered.slice(0, 8));
                }
            } catch (e) {
                console.error('Failed to fetch modal TMDB details', e);
            } finally {
                if (!cancelled) {
                    setLoadingTmdbDetails(false);
                    setLoadingSimilar(false);
                }
            }
        };

        void fetchTmdbDetails();

        return () => {
            cancelled = true;
        };
    }, [item.tmdbId, mediaType]);

    const openPerson = async (personId: number) => {
        if (!personId) return;

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
        } catch (e) {
            console.error('Failed to fetch person details', e);
        } finally {
            setLoadingPerson(false);
        }
    };

    const loadMorePersonCredits = () => {
        setVisiblePersonCredits((prev) => prev + 8);
    };

    const openOnlineResult = (result: TmdbResult) => {
        if (!onOpenOnline) return;
        onOpenOnline(result);
        setPersonModalOpen(false);
        onClose();
    };

    return (
        <div ref={modalRef as React.RefObject<HTMLDivElement>} role="dialog" aria-modal="true" aria-label="Title details" className="fixed inset-0 z-[100] bg-neutral-950 sm:bg-black/80 sm:backdrop-blur-xl sm:flex sm:items-center sm:justify-center p-0 sm:p-4 overflow-y-auto sm:overflow-hidden" onClick={(e) => { if (e.target === e.currentTarget) { triggerHaptic('light'); onClose(); } }}>
            {/* Ambient Backdrop Glow Aura (Apple Vision Pro dynamic color bleed) */}
            {(item.backdropPath || item.posterPath) && (
                <div className="hidden sm:block absolute -inset-10 -z-10 rounded-3xl overflow-hidden opacity-35 ambient-glow-aura pointer-events-none transition-opacity duration-700">
                    <img
                        src={`https://image.tmdb.org/t/p/w300${item.backdropPath || item.posterPath}`}
                        alt=""
                        className="w-full h-full object-cover scale-125"
                    />
                </div>
            )}

            <div
                className="relative w-full min-h-[100dvh] sm:min-h-0 sm:max-w-4xl sm:max-h-[90vh] bg-neutral-950 sm:liquid-glass-base rounded-none sm:rounded-3xl overflow-hidden sm:shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(255,255,255,0.08)] animate-in zoom-in-95 duration-200 flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Backdrop Header */}
                <div className="relative min-h-[300px] sm:min-h-0 sm:h-72 md:h-80 shrink-0">
                    {/* Mobile Sheet Grab Handle */}
                    <div className="sm:hidden absolute top-2 left-0 right-0 z-30 flex justify-center pointer-events-none">
                        <div className="w-10 h-1 rounded-full bg-white/35 backdrop-blur-md shadow-sm" />
                    </div>

                    {(item.backdropPath || item.posterPath) ? (
                        <TMDBImage
                            src={item.backdropPath || item.posterPath}
                            alt=""
                            tmdbSize="original"
                            fill
                            sizes="(max-width: 768px) 100vw, 1200px"
                            className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-75' : 'opacity-0'}`}
                            onLoad={() => setImgLoaded(true)}
                        />
                    ) : (
                        <div className="w-full h-full bg-neutral-800" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,14,0.95)] via-[rgba(10,10,14,0.4)] to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[rgba(10,10,14,0.75)] via-[rgba(10,10,14,0.2)] to-transparent" />

                    {/* Single Close button (Top-Right) */}
                    <button
                        onClick={() => {
                            triggerHaptic('light');
                            onClose();
                        }}
                        aria-label="Close"
                        className="absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:top-4 right-4 p-2.5 sm:p-2 liquid-orb bg-black/60 sm:bg-black/40 border border-white/20 sm:border-white/10 text-white transition z-30 hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    {/* Title + Actions overlaid on backdrop */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 flex gap-4 sm:gap-6">
                        {/* Poster thumbnail */}
                        {item.posterPath && (
                            <div className="hidden sm:block shrink-0 w-28 sm:w-32 h-40 sm:h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-white/15 -mb-12 relative z-10">
                                <TMDBImage
                                    src={item.posterPath}
                                    alt={item.title}
                                    tmdbSize="w300"
                                    fill
                                    sizes="160px"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl sm:text-3xl font-extrabold text-white drop-shadow-lg leading-tight tracking-tight">
                                {item.title}
                            </h2>

                            {/* Metadata Row */}
                            <div className="flex items-center gap-2 mt-2 flex-wrap text-xs sm:text-sm">
                                {displayRating != null && displayRating > 0 && (
                                    <span className="bg-[#F5C518] px-2 py-0.5 rounded-md shadow-sm">
                                        <span className="text-xs sm:text-sm font-bold text-black">{displayRatingSource} {displayRating.toFixed(1)}</span>
                                    </span>
                                )}
                                {year && (
                                    <span className="text-neutral-200 font-medium">{year}</span>
                                )}
                                <span className="px-2 py-0.5 liquid-glass-pill rounded-md border border-white/15 text-neutral-200 uppercase tracking-wide text-xs font-semibold">
                                    {item.type === 'movie' ? 'Movie' : 'TV Show'}
                                </span>
                                {(() => {
                                    const tags: { label: string; cls: string }[] = [];
                                    const fp = item.filePath?.toUpperCase() || '';
                                    if (item.resolution)
                                        tags.push({ label: item.resolution === '2160p' ? '4K' : item.resolution, cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/40' });
                                    if (item.isHDR || /\bHDR\b/.test(fp))
                                        tags.push({ label: /HDR10\+|HDR10PLUS/.test(fp) ? 'HDR10+' : /HDR10/.test(fp) ? 'HDR10' : 'HDR', cls: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40' });
                                    else
                                        tags.push({ label: 'SDR', cls: 'bg-neutral-600/40 text-neutral-300 border border-neutral-600/40' });
                                    if (/\bDOVI\b|\bDV\b|DOLBY.?VISION/.test(fp))
                                        tags.push({ label: 'DV', cls: 'bg-fuchsia-500/90 text-white' });
                                    if (/\bIMAX\b/.test(fp))
                                        tags.push({ label: 'IMAX', cls: 'bg-cyan-500/90 text-black' });
                                    if (/\bREMUX\b/.test(fp))
                                        tags.push({ label: 'Remux', cls: 'bg-emerald-500/90 text-black' });
                                    if (/\bATMOS\b/.test(fp))
                                        tags.push({ label: 'Atmos', cls: 'bg-indigo-500/90 text-white' });
                                    if (/\bDTS[\s.-]?HD/.test(fp))
                                        tags.push({ label: 'DTS-HD', cls: 'bg-sky-500/80 text-white' });
                                    if (/\bTRUEHD\b|\bTRUE[\s.-]?HD/.test(fp))
                                        tags.push({ label: 'TrueHD', cls: 'bg-sky-500/80 text-white' });
                                    if (item.videoCodec)
                                        tags.push({ label: item.videoCodec.toUpperCase(), cls: 'bg-violet-500/20 text-violet-300 border border-violet-500/40' });
                                    if (item.audioCodec)
                                        tags.push({ label: item.audioCodec.toUpperCase(), cls: 'bg-teal-500/20 text-teal-300 border border-teal-500/40' });
                                    if (item.audioChannels)
                                        tags.push({ label: item.audioChannels, cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/40' });
                                    if (item.language)
                                        tags.push({ label: item.language, cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/40' });
                                    return tags.map((t, i) => (
                                        <span key={i} className={`px-2 py-0.5 text-xs rounded font-bold tracking-wide ${t.cls}`}>{t.label}</span>
                                    ));
                                })()}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 sm:gap-3 mt-3 flex-wrap">
                                {item.type === 'movie' ? (
                                    <button
                                        onClick={() => {
                                            triggerHaptic('medium');
                                            onPlay();
                                        }}
                                        className="liquid-btn-primary px-5 sm:px-6 py-2.5 font-bold rounded-xl flex items-center gap-2 text-xs sm:text-sm shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer"
                                    >
                                        <Play className="w-4 h-4 fill-black" />
                                        {progressPercent > 0 && progressPercent < 95 ? 'Resume' : 'Play'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            triggerHaptic('medium');
                                            if (onViewEpisodes) onViewEpisodes();
                                        }}
                                        className="liquid-btn-primary px-5 sm:px-6 py-2.5 font-bold rounded-xl flex items-center gap-2 text-xs sm:text-sm shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer"
                                    >
                                        <Play className="w-4 h-4 fill-black" /> View Episodes
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        triggerHaptic('light');
                                        setShowTrailer(true);
                                    }}
                                    className="liquid-btn-secondary px-4 sm:px-5 py-2.5 font-semibold rounded-xl flex items-center gap-2 text-xs sm:text-sm hover:scale-105 active:scale-95 transition cursor-pointer"
                                >
                                    <PlayCircle className="w-4 h-4 text-white" /> Trailer
                                </button>
                                {item.tmdbId && (
                                    <button
                                        onClick={() => {
                                            triggerHaptic('light');
                                            setShowStreamServers(true);
                                        }}
                                        className="liquid-btn-secondary px-4 sm:px-5 py-2.5 font-semibold rounded-xl flex items-center gap-2 text-xs sm:text-sm hover:scale-105 active:scale-95 transition text-sky-300 border-sky-500/30 cursor-pointer"
                                    >
                                        <Globe className="w-4 h-4 text-sky-400" /> Watch Online
                                    </button>
                                )}
                                {onFixMatch && (
                                    <button
                                        onClick={onFixMatch}
                                        className="liquid-glass-pill px-4 sm:px-5 py-2.5 text-amber-300 font-semibold rounded-xl flex items-center gap-2 text-xs sm:text-sm border-amber-500/30 hover:border-amber-400/60 bg-amber-500/10 hover:scale-105 transition"
                                        title="Fix incorrect movie info or search TMDB"
                                    >
                                        <Sparkles className="w-4 h-4 text-amber-400" /> Fix Match
                                    </button>
                                )}
                            </div>

                            {/* Auto-Track Toggle (TV Shows only) */}
                            {item.type === 'show' && item.tmdbId && (
                                <div className="flex items-center gap-2 mt-3">
                                    <button aria-label={isTracking ? 'Stop tracking new episodes' : 'Auto-track new episodes & download'}
                                        onClick={toggleTracking}
                                        disabled={trackLoading}
                                        className={`px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-semibold transition-all ${
                                            isTracking
                                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30'
                                                : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                        } ${trackLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        title={isTracking ? 'Stop tracking new episodes' : 'Auto-track new episodes & download'}
                                        id="auto-track-toggle"
                                    >
                                        {isTracking ? <BellRing className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                                        {isTracking ? 'Tracking' : 'Auto-Track'}
                                    </button>
                                    {isTracking && (
                                        <LiquidDropdown
                                            label="Quality"
                                            title="Preferred Quality"
                                            options={QUALITY_OPTIONS}
                                            value={qualityPref}
                                            onChange={(val) => updateQualityPref(val)}
                                            align="left"
                                            className="min-w-[130px]"
                                            pillClassName="liquid-glass-pill px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-neutral-200 hover:text-white cursor-pointer"
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="p-4 sm:p-6 pt-3 sm:pl-44 overflow-y-auto flex-1 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:pb-6">
                    {/* Watch Progress */}
                    {item.type === 'movie' && progressPercent > 0 && progressPercent < 95 && item.watchProgress && (
                        <div className="mb-5">
                            <div className="flex items-center gap-2 text-xs text-neutral-300 mb-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{formatDuration(item.watchProgress.progress)} / {formatDuration(item.watchProgress.duration)}</span>
                            </div>
                            <div className="h-1.5 w-full max-w-md bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-white rounded-full transition-all shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Overview */}
                    {displayOverview && (
                        <div className="mb-5">
                            {activeDetails?.tagline && (
                                <p className="text-neutral-300 italic text-xs sm:text-sm mb-2 leading-relaxed">&quot;{activeDetails.tagline}&quot;</p>
                            )}
                            <p className="text-neutral-100 text-xs sm:text-sm leading-relaxed">{displayOverview}</p>
                        </div>
                    )}

                    {/* Genres */}
                    {displayGenres && (
                        <div className="mb-5">
                            <div className="flex flex-wrap gap-1.5">
                                {displayGenres.split(',').map((genre, i) => (
                                    <span key={i} className="px-3 py-1 liquid-glass-pill text-neutral-200 text-xs sm:text-sm rounded-full font-medium">
                                        {genre.trim()}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Runtime / Status */}
                    {(tmdbMovieDetails?.runtime || tmdbTvDetails?.status) && (
                        <div className="mb-5 flex flex-wrap gap-5 text-xs sm:text-sm text-neutral-300">
                            {tmdbMovieDetails?.runtime && (
                                <div>
                                    <span className="text-neutral-400 text-xs uppercase tracking-wider font-semibold">Runtime</span>
                                    <p className="text-white font-medium mt-0.5">{Math.floor(tmdbMovieDetails.runtime / 60)}h {tmdbMovieDetails.runtime % 60}m</p>
                                </div>
                            )}
                            {tmdbTvDetails?.status && (
                                <div>
                                    <span className="text-neutral-400 text-xs uppercase tracking-wider font-semibold">Status</span>
                                    <p className="text-white font-medium mt-0.5">{tmdbTvDetails.status}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Cast */}
                    {activeDetails?.cast && activeDetails.cast.length > 0 && (
                        <div className="mb-5">
                            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Cast</h3>
                            <div className="flex gap-2 overflow-x-auto pb-2 sm:flex-wrap mask-fade-right scroll-snap-x scrollbar-none">
                                {activeDetails.cast.map((c, i) => (
                                    <button
                                        key={`${c.id}-${i}`}
                                        onClick={() => {
                                            triggerHaptic('light');
                                            openPerson(c.id);
                                        }}
                                        className="flex items-center gap-2.5 liquid-glass-pill hover:bg-white/15 rounded-xl px-3 py-1.5 transition shrink-0 scroll-snap-align-start cursor-pointer active:scale-95"
                                    >
                                        {c.profilePath && (
                                             <TMDBImage src={c.profilePath} alt="" tmdbSize="w45" width={28} height={28} className="w-7 h-7 rounded-full object-cover shadow-sm" />
                                        )}
                                        <div className="text-left">
                                            <div className="text-xs sm:text-sm font-semibold text-white">{c.name}</div>
                                            <div className="text-[11px] sm:text-xs text-neutral-300 font-medium">{c.character}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Collection */}
                    {(loadingCollection || collectionData) && (
                        <div className="mb-6">
                            <h3 className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Film className="w-4 h-4" />
                                {collectionData ? `Part of ${collectionData.name}` : 'Loading Collection...'}
                            </h3>
                            {loadingCollection ? (
                                <div className="flex gap-2.5 overflow-x-auto pt-2 px-1 -mx-1 pb-4 custom-scrollbar mask-fade-right scroll-snap-x">
                                    {Array.from({ length: 4 }).map((_, idx) => (
                                        <div key={idx} className="w-28 sm:w-36 shrink-0 rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900/60 animate-pulse scroll-snap-align-start">
                                            <div className="aspect-[2/3] bg-neutral-800" />
                                        </div>
                                    ))}
                                </div>
                            ) : collectionData && (
                                <div className="flex gap-2.5 overflow-x-auto pt-2 px-1 -mx-1 pb-4 custom-scrollbar mask-fade-right scroll-snap-x">
                                    {collectionData.parts.map((part) => {
                                        const isCurrent = part.tmdbId === item.tmdbId;
                                        return (
                                            <div key={part.tmdbId} className={`w-28 sm:w-36 shrink-0 scroll-snap-align-start ${isCurrent ? 'ring-2 ring-blue-500 rounded-xl scale-[1.02] transition-transform' : ''}`}>
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
                                                        if (!isCurrent && onOpenOnline) {
                                                            onOpenOnline({
                                                                tmdbId: part.tmdbId,
                                                                mediaType: 'movie',
                                                                title: part.title,
                                                                posterPath: part.posterPath,
                                                                backdropPath: part.backdropPath,
                                                                overview: part.overview,
                                                                rating: part.rating,
                                                                year: part.year,
                                                                popularity: 0,
                                                            });
                                                        }
                                                    }}
                                                    showProgress={false}
                                                    showRating
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Similar */}
                    {item.tmdbId && (loadingSimilar || similarItems.length > 0) && (
                        <div className="mb-6">
                            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                                {mediaType === 'movie' ? 'Similar Movies' : 'Similar TV Shows'}
                            </h3>
                            {loadingSimilar ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {Array.from({ length: 8 }).map((_, idx) => (
                                        <div key={idx} className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900/60 animate-pulse">
                                            <div className="aspect-[2/3] bg-neutral-800" />
                                            <div className="p-2 space-y-2">
                                                <div className="h-3 bg-neutral-700 rounded" />
                                                <div className="h-3 w-2/3 bg-neutral-800 rounded" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 animate-in fade-in duration-200">
                                    {similarItems.map((similar, idx) => (
                                        <div
                                            key={`${similar.mediaType}-${similar.tmdbId}-${idx}`}
                                            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                                            style={{ animationDelay: `${idx * 45}ms`, animationFillMode: 'both' }}
                                        >
                                            <ContentCard
                                                item={toDiscoverContentCardItem(similar)}
                                                onClick={() => openOnlineResult(similar)}
                                                showProgress={false}
                                                showRating={true}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {item.tmdbId && loadingTmdbDetails && !activeDetails && (
                        <div className="flex justify-center py-6">
                            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                        </div>
                    )}


                </div>
            </div>

            {/* Trailer Modal */}
            <TrailerModal
                isOpen={showTrailer}
                tmdbId={(item.tmdbId || item.id) as number}
                mediaType={item.type === 'show' ? 'tv' : 'movie'}
                title={item.title}
                onClose={() => setShowTrailer(false)}
            />

            {/* Stream Server Modal */}
            {showStreamServers && item.tmdbId && (
                <StreamServerModal
                    tmdbId={item.tmdbId}
                    type={item.type === 'show' ? 'tv' : 'movie'}
                    title={item.title}
                    onClose={() => setShowStreamServers(false)}
                />
            )}

            {/* Person Modal */}
            {personModalOpen && (
                <div role="dialog" aria-modal="true" aria-label="Cast member details" className="fixed inset-0 z-[110] bg-neutral-950 sm:bg-black/80 sm:backdrop-blur-md sm:flex sm:items-center sm:justify-center p-0 sm:p-4 overflow-y-auto sm:overflow-hidden" onClick={() => setPersonModalOpen(false)}>
                    <div
                        className="w-full min-h-[100dvh] sm:min-h-0 sm:max-w-4xl sm:max-h-[90vh] bg-neutral-950 sm:liquid-glass-base sm:border sm:border-white/15 rounded-none sm:rounded-3xl overflow-hidden flex flex-col shadow-[0_25px_70px_rgba(0,0,0,0.85)] animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pt-5">
                            <div>
                                <h3 className="text-xl font-bold tracking-tight text-white">Cast Filmography</h3>
                                {personData && <p className="text-xs text-neutral-400 mt-1">{personData.name}</p>}
                            </div>
                            <button
                                onClick={() => {
                                    triggerHaptic('light');
                                    setPersonModalOpen(false);
                                }}
                                aria-label="Close"
                                className="p-2.5 sm:p-2 liquid-orb bg-black/60 sm:bg-black/40 border border-white/20 sm:border-white/10 text-white transition hover:scale-105 active:scale-95 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 overflow-y-auto flex-1 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:pb-5">
                            {loadingPerson && (
                                <div>
                                    <div className="flex gap-4 mb-5 animate-pulse">
                                        <div className="w-20 h-20 rounded-2xl bg-neutral-800 shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-5 w-48 bg-neutral-800 rounded-lg" />
                                            <div className="h-3 w-full bg-neutral-800 rounded" />
                                            <div className="h-3 w-5/6 bg-neutral-800 rounded" />
                                            <div className="h-3 w-3/4 bg-neutral-800 rounded" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {Array.from({ length: 8 }).map((_, idx) => (
                                            <div key={idx} className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] animate-pulse">
                                                <div className="aspect-[2/3] bg-neutral-800" />
                                                <div className="p-2.5 space-y-2">
                                                    <div className="h-3 bg-neutral-700 rounded" />
                                                    <div className="h-3 w-2/3 bg-neutral-800 rounded" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!loadingPerson && personData && (
                                <>
                                    <div className="flex gap-4 mb-5">
                                        <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center border border-white/10 shadow-inner">
                                            {personData.profilePath ? (
                                                <TMDBImage
                                                    src={personData.profilePath}
                                                    alt={personData.name}
                                                    tmdbSize="w185"
                                                    fill
                                                    sizes="80px"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <User className="w-8 h-8 text-neutral-600" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-lg font-bold text-white tracking-tight">{personData.name}</h4>
                                            {personData.biography && (
                                                <p className="text-sm text-neutral-300/90 mt-1 line-clamp-4 leading-relaxed">{personData.biography}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <h5 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Movies & TV Shows</h5>
                                            <p className="mt-1 text-[11px] text-neutral-500 font-medium">{filteredPersonCredits.length} credits</p>
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
                                                title="Sort Filmography"
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
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in duration-200">
                                                {filteredPersonCredits.slice(0, visiblePersonCredits).map((credit, idx) => (
                                                    <div
                                                        key={`${credit.mediaType}-${credit.tmdbId}-${idx}`}
                                                        className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                                                        style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
                                                    >
                                                        <button
                                                            onClick={() => openOnlineResult(credit)}
                                                            className="w-full text-left liquid-glass-card hover:border-white/30 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] shadow-md group block cursor-pointer"
                                                        >
                                                            <div className="relative aspect-[2/3] bg-neutral-800">
                                                                {credit.posterPath ? (
                                                                    <TMDBImage
                                                                        src={credit.posterPath}
                                                                        alt={credit.title}
                                                                        tmdbSize="w342"
                                                                        fill
                                                                        sizes="(max-width: 640px) 50vw, 25vw"
                                                                        className="w-full h-full object-cover"
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
                                                    </div>
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

                            {!loadingPerson && !personData && (
                                <p className="text-sm text-neutral-500 text-center py-8">Unable to load cast details.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
