'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Play, Star, Clock, Film, Tv, Loader2, PlayCircle, Globe, User, BellRing, BellOff } from 'lucide-react';
import TrailerModal from './TrailerModal';
import StreamServerModal from './StreamServerModal';
import ContentCard, { type ContentItem as DiscoverContentCardItem } from './ContentCard';
import TMDBImage from './TMDBImage';

type ContentItem = {
    id: number;
    tmdbId?: number | null;
    type: 'movie' | 'show';
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    genres?: string | null;
    year?: number;
    firstAirDate?: string | null;
    rating: number | null;
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
    onOpenOnline?: (item: {
        tmdbId: number;
        mediaType: 'movie' | 'tv';
        title: string;
        posterPath: string | null;
        backdropPath: string | null;
        overview: string | null;
        rating: number | null;
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
        year: item.year ? parseInt(item.year, 10) : undefined,
    };
}

export default function ContentDetailModal({ item, onClose, onPlay, onViewEpisodes, onOpenOnline }: Props) {
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

    const year = item.year || (item.firstAirDate ? item.firstAirDate.substring(0, 4) : '');
    const progressPercent = item.watchProgress && item.watchProgress.duration > 0
        ? (item.watchProgress.progress / item.watchProgress.duration) * 100
        : 0;
    const mediaType = item.type === 'show' ? 'tv' : 'movie';

    // Auto-track state (TV shows only)
    const [isTracking, setIsTracking] = useState(false);
    const [trackLoading, setTrackLoading] = useState(false);
    const [qualityPref, setQualityPref] = useState('best');

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
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="relative w-full max-w-4xl max-h-[90vh] bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Backdrop Header */}
                <div className="relative h-72 sm:h-96 shrink-0">
                    {(item.backdropPath || item.posterPath) ? (
                        <TMDBImage
                            src={item.backdropPath || item.posterPath}
                            alt=""
                            tmdbSize="original"
                            fill
                            sizes="(max-width: 768px) 100vw, 896px"
                            className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-60' : 'opacity-0'}`}
                            onLoad={() => setImgLoaded(true)}
                        />
                    ) : (
                        <div className="w-full h-full bg-neutral-800" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-neutral-900/60 to-transparent" />

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2.5 bg-black/50 hover:bg-black/80 rounded-full text-white transition z-10"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Title + Actions overlaid on backdrop */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8 flex gap-4 sm:gap-6">
                        {/* Poster thumbnail */}
                        {item.posterPath && (
                            <div className="hidden sm:block shrink-0 w-32 h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-neutral-700/50 -mb-16 relative z-10">
                                <TMDBImage
                                    src={item.posterPath}
                                    alt={item.title}
                                    tmdbSize="w300"
                                    fill
                                    sizes="128px"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-lg leading-tight">
                                {item.title}
                            </h2>

                            {/* Metadata Row */}
                            <div className="flex items-center gap-3 mt-3 flex-wrap text-sm">
                                {item.rating && item.rating > 0 && (
                                    <span className="flex items-center gap-1 text-green-400 font-semibold">
                                        <Star className="w-3.5 h-3.5 fill-green-400" />
                                        {item.rating.toFixed(1)}
                                    </span>
                                )}
                                {year && (
                                    <span className="text-neutral-300">{year}</span>
                                )}
                                <span className="px-2 py-0.5 bg-neutral-800 rounded border border-neutral-600 text-neutral-300 uppercase tracking-wide text-xs font-medium">
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
                                        tags.push({ label: 'SDR', cls: 'bg-neutral-600/40 text-neutral-400 border border-neutral-600/40' });
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
                                    return tags.map((t, i) => (
                                        <span key={i} className={`px-1.5 py-0.5 text-xs rounded font-bold tracking-wide ${t.cls}`}>{t.label}</span>
                                    ));
                                })()}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 sm:gap-3 mt-4 flex-wrap">
                                {item.type === 'movie' ? (
                                    <button
                                        onClick={onPlay}
                                        className="px-4 sm:px-6 py-2 sm:py-2.5 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-neutral-200 transition text-sm"
                                    >
                                        <Play className="w-5 h-5 fill-black" />
                                        {progressPercent > 0 && progressPercent < 95 ? 'Resume' : 'Play'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={onViewEpisodes}
                                        className="px-4 sm:px-6 py-2 sm:py-2.5 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-neutral-200 transition text-sm"
                                    >
                                        <Play className="w-5 h-5 fill-black" /> View Episodes
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowTrailer(true)}
                                    className="px-4 py-2 sm:px-5 sm:py-2.5 bg-neutral-700/80 text-white font-semibold rounded-lg flex items-center gap-2 hover:bg-neutral-600 transition text-sm border border-neutral-600"
                                >
                                    <PlayCircle className="w-4 h-4" /> Trailer
                                </button>
                                {item.tmdbId && (
                                    <button
                                        onClick={() => setShowStreamServers(true)}
                                        className="px-4 py-2 sm:px-5 sm:py-2.5 bg-white text-black font-semibold rounded-lg flex items-center gap-2 hover:bg-neutral-200 transition text-sm"
                                    >
                                        <Globe className="w-4 h-4" /> Watch Online
                                    </button>
                                )}
                            </div>

                            {/* Auto-Track Toggle (TV Shows only) */}
                            {item.type === 'show' && item.tmdbId && (
                                <div className="flex items-center gap-2 mt-3">
                                    <button
                                        onClick={toggleTracking}
                                        disabled={trackLoading}
                                        className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all ${
                                            isTracking
                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30'
                                                : 'bg-neutral-700/50 text-neutral-400 border border-neutral-600/50 hover:bg-neutral-700 hover:text-white'
                                        } ${trackLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        title={isTracking ? 'Stop tracking new episodes' : 'Auto-track new episodes & download'}
                                        id="auto-track-toggle"
                                    >
                                        {isTracking ? <BellRing className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                                        {isTracking ? 'Tracking' : 'Auto-Track'}
                                    </button>
                                    {isTracking && (
                                        <select
                                            value={qualityPref}
                                            onChange={(e) => updateQualityPref(e.target.value)}
                                            className="bg-neutral-800 text-neutral-300 text-xs rounded-lg px-2 py-1.5 border border-neutral-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                                            title="Preferred download quality"
                                            id="quality-preference-select"
                                        >
                                            <option value="best">Best Available Quality</option>
                                            <option value="2160p">4K / 2160p</option>
                                            <option value="1080p">1080p</option>
                                            <option value="720p">720p</option>
                                            <option value="any">Fallback (Any)</option>
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="p-4 sm:p-8 pt-4 sm:pl-48 overflow-y-auto flex-1">
                    {/* Watch Progress */}
                    {item.type === 'movie' && progressPercent > 0 && progressPercent < 95 && item.watchProgress && (
                        <div className="mb-6">
                            <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{formatDuration(item.watchProgress.progress)} / {formatDuration(item.watchProgress.duration)}</span>
                            </div>
                            <div className="h-1.5 w-full max-w-md bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-white rounded-full transition-all"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Overview */}
                    {displayOverview && (
                        <div className="mb-6">
                            {activeDetails?.tagline && (
                                <p className="text-neutral-400 italic text-sm mb-3">&quot;{activeDetails.tagline}&quot;</p>
                            )}
                            <p className="text-neutral-300 leading-relaxed">{displayOverview}</p>
                        </div>
                    )}

                    {/* Genres */}
                    {displayGenres && (
                        <div className="mb-6">
                            <div className="flex flex-wrap gap-2">
                                {displayGenres.split(',').map((genre, i) => (
                                    <span key={i} className="px-3 py-1 bg-neutral-800 text-neutral-300 text-sm rounded-full border border-neutral-700">
                                        {genre.trim()}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Runtime / Status */}
                    {(tmdbMovieDetails?.runtime || tmdbTvDetails?.status) && (
                        <div className="mb-6 flex flex-wrap gap-4 text-sm text-neutral-400">
                            {tmdbMovieDetails?.runtime && (
                                <div>
                                    <span className="text-neutral-500 text-xs uppercase tracking-wider">Runtime</span>
                                    <p className="text-neutral-200">{Math.floor(tmdbMovieDetails.runtime / 60)}h {tmdbMovieDetails.runtime % 60}m</p>
                                </div>
                            )}
                            {tmdbTvDetails?.status && (
                                <div>
                                    <span className="text-neutral-500 text-xs uppercase tracking-wider">Status</span>
                                    <p className="text-neutral-200">{tmdbTvDetails.status}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Cast */}
                    {activeDetails?.cast && activeDetails.cast.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Cast</h3>
                            <div className="flex flex-wrap gap-2">
                                {activeDetails.cast.map((c, i) => (
                                    <button
                                        key={`${c.id}-${i}`}
                                        onClick={() => openPerson(c.id)}
                                        className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg px-3 py-1.5 transition"
                                    >
                                        {c.profilePath && (
                                            <TMDBImage src={c.profilePath} alt="" tmdbSize="w45" width={24} height={24} className="w-6 h-6 rounded-full object-cover" />
                                        )}
                                        <div>
                                            <div className="text-xs font-medium">{c.name}</div>
                                            <div className="text-[10px] text-neutral-500">{c.character}</div>
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
                                <div className="flex gap-2 overflow-x-auto pt-2 px-1 -mx-1 pb-4 custom-scrollbar">
                                    {Array.from({ length: 4 }).map((_, idx) => (
                                        <div key={idx} className="w-28 sm:w-36 shrink-0 rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900/60 animate-pulse">
                                            <div className="aspect-[2/3] bg-neutral-800" />
                                        </div>
                                    ))}
                                </div>
                            ) : collectionData && (
                                <div className="flex gap-2 overflow-x-auto pt-2 px-1 -mx-1 pb-4 custom-scrollbar">
                                    {collectionData.parts.map((part) => {
                                        const isCurrent = part.tmdbId === item.tmdbId;
                                        return (
                                            <div key={part.tmdbId} className={`w-28 sm:w-36 shrink-0 ${isCurrent ? 'ring-2 ring-blue-500 rounded-xl scale-[1.02] transition-transform' : ''}`}>
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
                <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPersonModalOpen(false)}>
                    <div
                        className="w-full max-w-4xl max-h-[90vh] bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
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
                                <div>
                                    <div className="flex gap-4 mb-5 animate-pulse">
                                        <div className="w-20 h-20 rounded-xl bg-neutral-800 shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-5 w-48 bg-neutral-800 rounded" />
                                            <div className="h-3 w-full bg-neutral-800 rounded" />
                                            <div className="h-3 w-5/6 bg-neutral-800 rounded" />
                                            <div className="h-3 w-3/4 bg-neutral-800 rounded" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                                </div>
                            )}

                            {!loadingPerson && personData && (
                                <>
                                    <div className="flex gap-4 mb-5">
                                        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center">
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
                                            <h4 className="text-lg font-semibold">{personData.name}</h4>
                                            {personData.biography && (
                                                <p className="text-sm text-neutral-400 mt-1 line-clamp-4">{personData.biography}</p>
                                            )}
                                        </div>
                                    </div>

                                    <h5 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Movies & TV Shows</h5>
                                    {personData.credits.length > 0 ? (
                                        <>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in duration-200">
                                                {personData.credits.slice(0, visiblePersonCredits).map((credit, idx) => (
                                                    <div
                                                        key={`${credit.mediaType}-${credit.tmdbId}-${idx}`}
                                                        className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                                                        style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
                                                    >
                                                        <button
                                                            onClick={() => openOnlineResult(credit)}
                                                            className="w-full text-left bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden transition"
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
                                            {personData.credits.length > visiblePersonCredits && (
                                                <div className="flex justify-center mt-4">
                                                    <button
                                                        onClick={loadMorePersonCredits}
                                                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition"
                                                    >
                                                        See All ({personData.credits.length - visiblePersonCredits} more)
                                                    </button>
                                                </div>
                                            )}
                                        </>
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
