'use client';

import { useState, useEffect } from 'react';
import { X, Play, RefreshCw, ChevronDown, ChevronLeft, Trash2, BookmarkMinus, Clock, Star, Globe, BarChart3, SkipForward, Eye, EyeOff, DownloadCloud, Download, Check } from 'lucide-react';
import StreamServerModal from './StreamServerModal';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';
import ToastNotification from './ToastNotification';
import { useToast } from '@/app/hooks/useToast';
import { triggerHaptic } from '@/lib/haptics';

type Episode = {
    id: number;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    filePath: string;
    overview?: string | null;
    stillPath?: string | null;
    rating?: number | null;
    voteCount?: number | null;
    imdbRating?: number | null;
    isHDR?: boolean;
    resolution?: string | null;
    videoCodec?: string | null;
    audioCodec?: string | null;
    audioChannels?: string | null;
    watchProgress?: {
        progress: number;
        duration: number;
        completed: number;
    };
};

type Season = {
    season: number;
    episodes: Episode[];
};

type Show = {
    id: number;
    tmdbId?: number | null;
    title: string;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    rating: number | null;
    imdbRating?: number | null;
};

type Props = {
    show: Show;
    seasons: Season[];
    loading: boolean;
    onClose: () => void;
    onPlayEpisode: (episodeId: number, startTime?: number) => void;
    onDeleteEpisode?: (episodeId: number) => void;
    onRemoveEpisodeFromLibrary?: (episodeId: number) => void;
    onMarkWatched?: (episode: Episode, watched: boolean) => void;
};

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/**
 * A TMDB episode score is only meaningful once enough people have voted. A
 * just-aired episode routinely reads 1.0 or 2.8 off three or four votes, which
 * looks like a damning review rather than the noise it is — so hide it until
 * the sample is large enough.
 */
const MIN_EPISODE_VOTES = 10;

type EpisodeScore = { value: number; source: 'IMDb' | 'TMDB' };

/**
 * IMDb is preferred wherever it exists — it is what people actually quote, and
 * it matches how show and movie ratings are already displayed. TMDB is the
 * fallback, and only once enough people have voted.
 */
function episodeScore(
    imdbRating?: number | null,
    rating?: number | null,
    voteCount?: number | null
): EpisodeScore | null {
    if (imdbRating != null && imdbRating > 0) return { value: imdbRating, source: 'IMDb' };
    if (rating == null || rating <= 0) return null;
    // Older rows predate vote tracking; show those rather than blank the UI.
    if (voteCount != null && voteCount < MIN_EPISODE_VOTES) return null;
    return { value: rating, source: 'TMDB' };
}

export default function EpisodeModal({ show, seasons, loading, onClose, onPlayEpisode, onDeleteEpisode, onRemoveEpisodeFromLibrary, onMarkWatched }: Props) {
    const modalRef = useModalBehavior(true, onClose);

    const [activeSeason, setActiveSeason] = useState(seasons[0]?.season || 1);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; episode: Episode } | null>(null);
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
    const [showStreamServers, setShowStreamServers] = useState(false);
    const [showRatingGrid, setShowRatingGrid] = useState(true);
    const [hoveredRating, setHoveredRating] = useState<{ season: number; episode: number; rating: number | null; voteCount: number | null; imdbRating: number | null; x: number; y: number } | null>(null);
    const [isDownloadingMissing, setIsDownloadingMissing] = useState(false);
    
    const [isDownloadingNext, setIsDownloadingNext] = useState(false);
    const [downloadNextQuery, setDownloadNextQuery] = useState<string | null>(null);
    const [downloadTarget, setDownloadTarget] = useState<'local' | 'gdrive' | 'cloud'>('local');
    const [gdriveAvailable, setGdriveAvailable] = useState(false);
    const [cloudAvailable, setCloudAvailable] = useState(false);
    const { toast, showToast } = useToast();

    // Check tracking & global settings for destination preference
    useEffect(() => {
        let cancelled = false;
        const checkDestination = async () => {
            try {
                const [trackRes, settingsRes] = await Promise.all([
                    fetch('/api/auto-track'),
                    fetch('/api/settings').catch(() => null)
                ]);

                let target: 'local' | 'gdrive' | 'cloud' = 'local';
                if (settingsRes && settingsRes.ok) {
                    const s = await settingsRes.json();
                    if (s.gdriveEnabled === 'true' || s.gdriveRemote || s.gdriveMountDrive) {
                        if (!cancelled) setGdriveAvailable(true);
                    }
                    if (s.cloudEnabled === 'true' || s.cloudWorkerUrl) {
                        if (!cancelled) setCloudAvailable(true);
                    }
                    if (s.autoDownloadTarget && ['local', 'gdrive', 'cloud'].includes(s.autoDownloadTarget)) {
                        target = s.autoDownloadTarget;
                    }
                }

                if (trackRes && trackRes.ok) {
                    const data = await trackRes.json();
                    const tracked = ((data.tracked || []) as Array<{ showId: number; target?: string }>).find(t => t.showId === show.id);
                    if (tracked?.target && ['local', 'gdrive', 'cloud'].includes(tracked.target)) {
                        target = tracked.target as any;
                    }
                }
                if (!cancelled) {
                    setDownloadTarget(target);
                }
            } catch { /* ignore */ }
        };
        checkDestination();
        return () => { cancelled = true; };
    }, [show.id]);

    // Reset active season when seasons change (new show opened)
    useEffect(() => {
        setActiveSeason(seasons[0]?.season || 1);
        setSelectedEpisode(null);
    }, [seasons]);

    const currentSeason = seasons.find(s => s.season === activeSeason);

    // Neighbouring episodes within the loaded season, so the online player can
    // step through a season without closing and reopening.
    const adjacentEpisodes = (() => {
        const list = currentSeason?.episodes ?? [];
        if (!selectedEpisode) return { prev: null as Episode | null, next: null as Episode | null };
        const ordered = [...list].sort((a, b) => a.episodeNumber - b.episodeNumber);
        const at = ordered.findIndex(e => e.id === selectedEpisode.id);
        if (at === -1) return { prev: null as Episode | null, next: null as Episode | null };
        return { prev: ordered[at - 1] ?? null, next: ordered[at + 1] ?? null };
    })();
    const displayRating = show.imdbRating ?? show.rating;
    const displayRatingSource = show.imdbRating != null ? 'IMDb' : 'TMDB';

    const handleContextMenu = (e: React.MouseEvent, episode: Episode) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, episode });
    };

    const handleRemoveFromLibrary = () => {
        if (contextMenu && onRemoveEpisodeFromLibrary) {
            onRemoveEpisodeFromLibrary(contextMenu.episode.id);
        }
        setContextMenu(null);
    };

    const handleDelete = () => {
        if (contextMenu && onDeleteEpisode) {
            onDeleteEpisode(contextMenu.episode.id);
        }
        setContextMenu(null);
    };

    const handleDownloadMissing = async () => {
        if (!show.tmdbId) return;
        setIsDownloadingMissing(true);
        try {
            const res = await fetch('/api/auto-download/season', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    showId: show.id,
                    tmdbId: show.tmdbId,
                    seasonNumber: activeSeason,
                    target: downloadTarget,
                })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || 'Queued missing episodes for download', 'success');
            } else {
                showToast(data.error || 'Failed to fetch missing episodes', 'error');
            }
        } catch (e: any) {
            showToast(e?.message || 'Network error fetching missing episodes', 'error');
        } finally {
            setTimeout(() => setIsDownloadingMissing(false), 1000);
        }
    };

    const handleDownloadNext = async () => {
        if (!show.id) return;
        setIsDownloadingNext(true);
        try {
            const res = await fetch(`/api/episodes/next?showId=${show.id}&autoDownload=true&target=${downloadTarget}`);
            const data = await res.json();
            if (res.ok && data.queued) {
                showToast(data.message || 'Next episode download queued', 'success');
            } else {
                showToast(data.error || 'Failed to queue next episode download', 'error');
            }
        } catch (e: any) {
            showToast(e?.message || 'Network error queueing next episode', 'error');
        } finally {
            setIsDownloadingNext(false);
        }
    };

    return (
        <div
            ref={modalRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-label="Episodes"
            className="fixed inset-0 z-[100] bg-neutral-950 sm:bg-black/80 sm:backdrop-blur-xl sm:flex sm:items-center sm:justify-center p-0 sm:p-4 md:p-6 overflow-y-auto sm:overflow-hidden"
            onClick={(e) => { if (e.target === e.currentTarget) { triggerHaptic('light'); onClose(); } }}
        >
            {/* Ambient Backdrop Glow Aura (Apple Vision Pro dynamic color bleed) */}
            {(show.backdropPath || show.posterPath) && (
                <div className="hidden sm:block absolute -inset-10 -z-10 rounded-3xl overflow-hidden opacity-35 ambient-glow-aura pointer-events-none transition-opacity duration-700">
                    <img
                        src={`https://image.tmdb.org/t/p/w300${show.backdropPath || show.posterPath}`}
                        alt=""
                        className="w-full h-full object-cover scale-125"
                    />
                </div>
            )}

            <div
                className="relative w-full min-h-[100dvh] sm:min-h-0 sm:max-w-3xl xl:max-w-4xl sm:max-h-[90vh] bg-neutral-950 sm:liquid-glass-base rounded-none sm:rounded-3xl sm:border sm:border-white/15 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 sm:shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(255,255,255,0.08)]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with backdrop */}
                <div className="relative h-48 sm:h-64 md:h-72 shrink-0">
                    {/* Mobile Sheet Grab Handle */}
                    <div className="sm:hidden absolute top-2 left-0 right-0 z-30 flex justify-center pointer-events-none">
                        <div className="w-10 h-1 rounded-full bg-white/35 backdrop-blur-md shadow-sm" />
                    </div>

                    {/* Show the episode still if one is selected, otherwise show backdrop */}
                    {selectedEpisode?.stillPath ? (
                        <img
                            src={`https://image.tmdb.org/t/p/original${selectedEpisode.stillPath}`}
                            className="w-full h-full object-cover opacity-75 transition-all duration-300"
                            alt=""
                        />
                    ) : (show.backdropPath || show.posterPath) ? (
                        <img
                            src={`https://image.tmdb.org/t/p/original${show.backdropPath || show.posterPath}`}
                            className="w-full h-full object-cover opacity-70"
                            alt=""
                        />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-[rgba(16,16,22,0.95)] via-[rgba(16,16,22,0.4)] to-transparent" />

                    {/* Single Close button (Top-Right) */}
                    <button
                        onClick={() => {
                            triggerHaptic('light');
                            onClose();
                        }}
                        aria-label="Close"
                        className="absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:top-4 right-4 p-2.5 sm:p-2 liquid-orb bg-black/60 sm:bg-black/40 border border-white/20 sm:border-white/10 text-white transition z-30 hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="absolute bottom-4 sm:bottom-6 left-4 right-4 sm:left-8 sm:right-8">
                        {selectedEpisode ? (
                            <>
                                <button
                                    onClick={() => setSelectedEpisode(null)}
                                    className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition mb-2"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Back to episodes
                                </button>
                                <h2 className="text-2xl font-bold">{selectedEpisode.title}</h2>
                                <div className="flex items-center gap-2 mt-1.5 text-sm text-neutral-400">
                                    <span>{show.title}</span>
                                    <span>•</span>
                                    <span>S{selectedEpisode.seasonNumber} E{selectedEpisode.episodeNumber}</span>
                                    {(() => {
                                        const score = episodeScore(selectedEpisode.imdbRating, selectedEpisode.rating, selectedEpisode.voteCount);
                                        if (!score) return null;
                                        return (
                                            <>
                                                <span>•</span>
                                                <span className="inline-flex items-center gap-1 text-amber-400" title={`${score.source} rating`}>
                                                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                                                    {score.value.toFixed(1)}
                                                    <span className="text-[10px] text-neutral-400">{score.source}</span>
                                                </span>
                                            </>
                                        );
                                    })()}
                                </div>
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                    {selectedEpisode.resolution && (
                                        <span className="px-1.5 py-0.5 text-[10px] rounded font-bold tracking-wide bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                            {selectedEpisode.resolution === '2160p' ? '4K' : selectedEpisode.resolution}
                                        </span>
                                    )}
                                    {selectedEpisode.isHDR && (
                                        <span className="px-1.5 py-0.5 text-[10px] rounded font-bold tracking-wide bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                                            HDR
                                        </span>
                                    )}
                                    {selectedEpisode.videoCodec && (
                                        <span className="px-1.5 py-0.5 text-[10px] rounded font-bold tracking-wide bg-violet-500/20 text-violet-300 border border-violet-500/40">
                                            {selectedEpisode.videoCodec.toUpperCase()}
                                        </span>
                                    )}
                                    {selectedEpisode.audioCodec && (
                                        <span className="px-1.5 py-0.5 text-[10px] rounded font-bold tracking-wide bg-teal-500/20 text-teal-300 border border-teal-500/40">
                                            {selectedEpisode.audioCodec.toUpperCase()}
                                        </span>
                                    )}
                                    {selectedEpisode.audioChannels && (
                                        <span className="px-1.5 py-0.5 text-[10px] rounded font-bold tracking-wide bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                            {selectedEpisode.audioChannels}
                                        </span>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white drop-shadow-md">{show.title}</h2>
                                {displayRating != null && displayRating > 0 && (
                                    <div className="flex items-center gap-2 mt-2.5">
                                        <span className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/40 text-amber-300 px-3 py-1 rounded-xl text-xs font-bold shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                                            <Star className="w-3.5 h-3.5 fill-amber-300" />
                                            <span>{displayRatingSource} {displayRating.toFixed(1)}</span>
                                        </span>
                                    </div>
                                )}
                                <p className="text-neutral-300 text-xs sm:text-sm mt-2.5 line-clamp-2 leading-relaxed max-w-xl">{show.overview}</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Episode Detail View */}
                {selectedEpisode ? (
                    <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:pb-8">
                        {/* Play Button */}
                        <div className="flex gap-3 mb-6">
                            <button
                                onClick={() => onPlayEpisode(selectedEpisode.id, selectedEpisode.watchProgress?.progress)}
                                className="liquid-btn-primary px-5 sm:px-6 py-2.5 font-bold rounded-xl flex items-center gap-2 text-sm shadow-lg"
                            >
                                <Play className="w-4 h-4 fill-black" />
                                {selectedEpisode.watchProgress && selectedEpisode.watchProgress.progress > 0
                                    && (selectedEpisode.watchProgress.progress / selectedEpisode.watchProgress.duration) * 100 < 95
                                    ? 'Resume' : 'Play'}
                            </button>
                            {show.tmdbId && (
                                <button
                                    onClick={() => setShowStreamServers(true)}
                                    className="liquid-btn-primary px-4 py-2 sm:px-5 sm:py-2.5 font-semibold rounded-xl flex items-center gap-2 text-sm"
                                >
                                    <Globe className="w-4 h-4" /> Watch Online
                                </button>
                            )}
                        </div>

                        {/* Watch Progress */}
                        {selectedEpisode.watchProgress && selectedEpisode.watchProgress.progress > 0 && (
                            <div className="mb-6">
                                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1.5">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>{formatDuration(selectedEpisode.watchProgress.progress)} / {formatDuration(selectedEpisode.watchProgress.duration)}</span>
                                    {selectedEpisode.watchProgress.completed === 1 && (
                                        <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded ml-auto">
                                            Watched
                                        </span>
                                    )}
                                </div>
                                <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full accent-fill rounded-full transition-all"
                                        style={{ width: `${Math.min((selectedEpisode.watchProgress.progress / selectedEpisode.watchProgress.duration) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Episode Still */}
                        {selectedEpisode.stillPath && (
                            <div className="mb-6 rounded-xl overflow-hidden">
                                <img
                                    src={`https://image.tmdb.org/t/p/w780${selectedEpisode.stillPath}`}
                                    className="w-full object-cover rounded-xl"
                                    alt={selectedEpisode.title}
                                />
                            </div>
                        )}

                        {/* Overview */}
                        {selectedEpisode.overview && (
                            <div className="mb-6">
                                <p className="text-neutral-300 leading-relaxed">{selectedEpisode.overview}</p>
                            </div>
                        )}

                        {/* Up Next */}
                        {(() => {
                            // Find next episode: same season next ep, or first ep of next season
                            const currentSeasonData = seasons.find(s => s.season === selectedEpisode.seasonNumber);
                            const currentEpIdx = currentSeasonData?.episodes.findIndex(e => e.id === selectedEpisode.id) ?? -1;
                            let nextEp: Episode | null = null;
                            let nextSeasonNum: number | null = null;

                            if (currentSeasonData && currentEpIdx >= 0 && currentEpIdx < currentSeasonData.episodes.length - 1) {
                                nextEp = currentSeasonData.episodes[currentEpIdx + 1];
                                nextSeasonNum = selectedEpisode.seasonNumber;
                            } else {
                                // Try first episode of next season
                                const nextSeason = seasons.find(s => s.season === selectedEpisode.seasonNumber + 1);
                                if (nextSeason && nextSeason.episodes.length > 0) {
                                    nextEp = nextSeason.episodes[0];
                                    nextSeasonNum = nextSeason.season;
                                }
                            }

                            if (!nextEp) return null;

                            return (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <div className="flex items-center gap-2 mb-3">
                                        <SkipForward className="w-4 h-4 text-neutral-400" />
                                        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Up Next</span>
                                    </div>
                                    <div
                                        onClick={() => {
                                            if (nextSeasonNum && nextSeasonNum !== selectedEpisode.seasonNumber) {
                                                setActiveSeason(nextSeasonNum);
                                            }
                                            setSelectedEpisode(nextEp);
                                        }}
                                        className="flex items-center gap-4 p-4 rounded-2xl liquid-card bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-white/25 cursor-pointer group/next transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
                                    >
                                        {nextEp.stillPath ? (
                                            <div className="shrink-0 w-36 aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-white/15 relative shadow-md group-hover/next:border-white/30 transition-all">
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w300${nextEp.stillPath}`}
                                                    className="w-full h-full object-cover group-hover/next:scale-105 transition-transform duration-300"
                                                    alt={nextEp.title}
                                                    loading="lazy"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/next:opacity-100 transition">
                                                    <div className="w-8 h-8 liquid-orb bg-white/25 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg">
                                                        <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="shrink-0 w-36 aspect-video rounded-xl bg-neutral-900 border border-white/15 flex items-center justify-center shadow-md">
                                                <span className="text-xl font-black text-neutral-600 font-mono">E{nextEp.episodeNumber}</span>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-md bg-white/10 text-neutral-300 font-mono text-[11px] font-bold border border-white/10">
                                                    S{nextSeasonNum || nextEp.seasonNumber} E{nextEp.episodeNumber}
                                                </span>
                                            </div>
                                            <h5 className="text-sm font-bold text-white group-hover/next:text-red-400 transition truncate mt-1">{nextEp.title}</h5>
                                            {nextEp.overview && (
                                                <p className="text-xs text-neutral-300/80 line-clamp-1 mt-0.5">{nextEp.overview}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPlayEpisode(nextEp!.id, nextEp!.watchProgress?.progress);
                                            }}
                                            className="self-center px-4 py-2.5 liquid-btn-primary font-bold rounded-xl text-xs hover:scale-105 active:scale-95 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md"
                                        >
                                            <Play className="w-3.5 h-3.5 fill-black" /> Play
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                    </div>
                ) : (
                    <>
                        {/* Season Tabs */}
                        {seasons.length > 1 && (
                            <div className="px-4 sm:px-8 py-3.5 border-b border-white/10">
                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none mask-fade-right scroll-snap-x">
                                    {seasons.map(({ season }) => (
                                        <button
                                            key={season}
                                            onClick={() => {
                                                triggerHaptic('selection');
                                                setActiveSeason(season);
                                            }}
                                            className={`px-4 py-1.5 rounded-full text-sm transition-all whitespace-nowrap cursor-pointer select-none shrink-0 scroll-snap-align-start active:scale-95 ${activeSeason === season
                                                ? 'liquid-glass-pill-active font-bold shadow-sm'
                                                : 'liquid-glass-pill text-neutral-300 hover:text-white font-medium'
                                                }`}
                                        >
                                            Season {season}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Episode Rating Grid */}
                        {seasons.length > 0 && (
                            <div className="px-4 sm:px-8 py-4 border-b border-white/10">
                                <button
                                    onClick={() => setShowRatingGrid(!showRatingGrid)}
                                    className="flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-white transition mb-3 cursor-pointer"
                                >
                                    <BarChart3 className="w-4 h-4 text-amber-400" />
                                    Episode Grid
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showRatingGrid ? '' : '-rotate-90'}`} />
                                </button>
                                {showRatingGrid && (
                                    <div className="p-4 liquid-glass-pill bg-white/[0.02] border border-white/10 rounded-2xl space-y-2">
                                        {seasons.map(({ season, episodes }) => (
                                            <div key={season} className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-neutral-400 font-medium w-6 shrink-0">S{season}</span>
                                                <div className="flex gap-0.5 flex-wrap">
                                                    {episodes.map((ep) => {
                                                        const hasProgress = ep.watchProgress && ep.watchProgress.progress > 0;
                                                        const isCompleted = ep.watchProgress?.completed === 1;
                                                        let bgColor = 'bg-neutral-700/80'; // No data
                                                        if (isCompleted) bgColor = 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]';
                                                        else if (hasProgress) bgColor = 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]';

                                                        return (
                                                            <div
                                                                key={ep.id}
                                                                className={`w-4 h-4 rounded-sm ${bgColor} cursor-pointer transition-all hover:scale-150 hover:z-10 relative`}
                                                                onMouseEnter={(e) => {
                                                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                                                    setHoveredRating({
                                                                        season,
                                                                        episode: ep.episodeNumber,
                                                                        rating: ep.rating ?? null,
                                                                        voteCount: ep.voteCount ?? null,
                                                                        imdbRating: ep.imdbRating ?? null,
                                                                        x: rect.left + rect.width / 2,
                                                                        y: rect.top - 8
                                                                    });
                                                                }}
                                                                onMouseLeave={() => setHoveredRating(null)}
                                                                onClick={() => {
                                                                    setActiveSeason(season);
                                                                    setSelectedEpisode(ep);
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5 text-[10px] text-neutral-400">
                                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block shadow-[0_0_4px_rgba(16,185,129,0.5)]" /> Watched</span>
                                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block shadow-[0_0_4px_rgba(251,191,36,0.5)]" /> In Progress</span>
                                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-neutral-700/80 inline-block" /> Not Watched</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Episode List */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:pb-8">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                                    <span>{seasons.length > 1 ? `Season ${activeSeason}` : 'Episodes'}</span>
                                    <span className="text-xs px-2.5 py-0.5 rounded-full liquid-glass-pill text-neutral-300 border border-white/10 font-mono">
                                        {currentSeason?.episodes.length || 0} local
                                    </span>
                                </h3>
                                {show.tmdbId && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="flex items-center p-0.5 liquid-glass-pill rounded-xl border border-white/10 text-xs mr-1">
                                            <button
                                                type="button"
                                                onClick={() => setDownloadTarget('local')}
                                                className={`px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
                                                    downloadTarget === 'local'
                                                        ? 'bg-white/20 text-white shadow-sm font-semibold'
                                                        : 'text-neutral-400 hover:text-white'
                                                }`}
                                                title="Save to local drive"
                                            >
                                                <span>💻</span>
                                                <span className="hidden sm:inline">Local</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDownloadTarget('gdrive')}
                                                className={`px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
                                                    downloadTarget === 'gdrive'
                                                        ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40 shadow-sm font-semibold'
                                                        : 'text-neutral-400 hover:text-white'
                                                }`}
                                                title="Save to Google Drive"
                                            >
                                                <span>☁️</span>
                                                <span>Drive</span>
                                            </button>
                                            {cloudAvailable && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDownloadTarget('cloud')}
                                                    className={`px-2.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
                                                        downloadTarget === 'cloud'
                                                            ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40 shadow-sm font-semibold'
                                                            : 'text-neutral-400 hover:text-white'
                                                    }`}
                                                    title="Save via Cloud Worker"
                                                >
                                                    <span>⚡</span>
                                                    <span className="hidden sm:inline">Cloud</span>
                                                </button>
                                            )}
                                        </div>
                                        <button aria-label={`Download next episode globally across all seasons`}
                                            onClick={handleDownloadNext}
                                            disabled={isDownloadingNext}
                                            className="liquid-glass-pill flex items-center gap-2 px-3.5 py-2 disabled:opacity-50 text-xs font-semibold text-neutral-200 hover:text-white rounded-xl transition min-h-[38px] cursor-pointer"
                                            title={`Download next episode globally across all seasons`}
                                        >
                                            <Download className={`w-4 h-4 ${isDownloadingNext ? 'animate-bounce text-blue-400' : 'text-neutral-400'}`} />
                                            <span>{isDownloadingNext ? 'Resolving...' : 'Download Next Episode'}</span>
                                        </button>
                                        <button aria-label={`Download missing episodes in Season ${activeSeason}`}
                                            onClick={handleDownloadMissing}
                                            disabled={isDownloadingMissing}
                                            className="liquid-glass-pill flex items-center gap-2 px-3.5 py-2 disabled:opacity-50 text-xs font-semibold text-neutral-200 hover:text-white rounded-xl transition min-h-[38px] cursor-pointer"
                                            title={`Download missing episodes in Season ${activeSeason}`}
                                        >
                                            <DownloadCloud className={`w-4 h-4 ${isDownloadingMissing ? 'animate-pulse text-blue-400' : 'text-neutral-400'}`} />
                                            <span>{isDownloadingMissing ? 'Checking...' : 'Fetch Missing'}</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-12">
                                    <RefreshCw className="animate-spin text-neutral-400 w-6 h-6" />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {currentSeason?.episodes.map((ep) => {
                                        const progressPercent = ep.watchProgress && ep.watchProgress.duration > 0
                                            ? (ep.watchProgress.progress / ep.watchProgress.duration) * 100
                                            : 0;
                                        const score = episodeScore(ep.imdbRating, ep.rating, ep.voteCount);
                                        const isWatched = ep.watchProgress?.completed === 1;
                                        const isInProgress = progressPercent > 0 && !isWatched;

                                        return (
                                            <div
                                                key={ep.id}
                                                onClick={() => setSelectedEpisode(ep)}
                                                onContextMenu={(e) => handleContextMenu(e, ep)}
                                                className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3.5 sm:p-4 rounded-2xl liquid-card bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 cursor-pointer group transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_20px_rgba(255,255,255,0.04)]"
                                            >
                                                {/* Episode thumbnail */}
                                                {ep.stillPath ? (
                                                    <div className="shrink-0 w-full sm:w-44 aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-white/15 relative shadow-md group-hover:border-white/30 transition-all">
                                                        <img
                                                            src={`https://image.tmdb.org/t/p/w300${ep.stillPath}`}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                            alt={ep.title}
                                                            loading="lazy"
                                                        />
                                                        {/* Play overlay on thumbnail */}
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                            <div className="w-10 h-10 liquid-orb bg-white/25 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                                                                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                                                            </div>
                                                        </div>
                                                        {/* Integrated thumbnail progress bar */}
                                                        {progressPercent > 0 && (
                                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/80 overflow-hidden">
                                                                <div
                                                                    className={`h-full ${isWatched ? "bg-emerald-500" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"}`}
                                                                    style={{ width: `${Math.min(100, Math.max(5, progressPercent))}%` }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="shrink-0 w-full sm:w-44 aspect-video rounded-xl bg-neutral-900 border border-white/15 flex items-center justify-center shadow-md">
                                                        <span className="text-3xl font-black text-neutral-600 font-mono">E{ep.episodeNumber}</span>
                                                    </div>
                                                )}

                                                {/* Content info */}
                                                <div className="flex-1 min-w-0 w-full">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 rounded-md bg-white/10 text-neutral-300 font-mono text-xs font-bold border border-white/10 shrink-0">
                                                            E{ep.episodeNumber}
                                                        </span>
                                                        <h4 className="font-bold text-white group-hover:text-red-400 text-sm sm:text-base transition-colors truncate">
                                                            {ep.title}
                                                        </h4>
                                                        {score && (
                                                            <span
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] font-bold rounded-md shrink-0 shadow-sm"
                                                                title={`${score.source} rating`}
                                                            >
                                                                <Star className="w-3 h-3 fill-amber-300" />
                                                                {score.value.toFixed(1)}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className="text-xs sm:text-sm text-neutral-300/90 line-clamp-2 mt-1.5 leading-relaxed">
                                                        {ep.overview || 'No episode description available.'}
                                                    </p>

                                                    {/* Crystal format badges */}
                                                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                                                        {ep.resolution && (
                                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                                                {ep.resolution === '2160p' ? '4K UHD' : ep.resolution}
                                                            </span>
                                                        )}
                                                        {ep.isHDR && (
                                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
                                                                HDR
                                                            </span>
                                                        )}
                                                        {ep.videoCodec && (
                                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/30 uppercase">
                                                                {ep.videoCodec}
                                                            </span>
                                                        )}
                                                        {(ep.audioChannels || ep.audioCodec) && (
                                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-teal-500/15 text-teal-300 border border-teal-500/30 uppercase">
                                                                {ep.audioChannels || ep.audioCodec}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right status & action */}
                                                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 mt-2 sm:mt-0">
                                                    {isWatched && (
                                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                            Watched
                                                        </span>
                                                    )}
                                                    {isInProgress && (
                                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-500/35 text-amber-300 flex items-center gap-1.5 shadow-[0_0_12px_rgba(251,191,36,0.25)]">
                                                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                                                            {Math.round(progressPercent)}%
                                                        </span>
                                                    )}
                                                    <div className="w-8 h-8 rounded-full liquid-orb flex items-center justify-center text-neutral-400 group-hover:text-white group-hover:translate-x-0.5 transition-all">
                                                        <ChevronDown className="w-4 h-4 -rotate-90" />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {(!currentSeason || currentSeason.episodes.length === 0) && (
                                        <div className="text-center py-12 liquid-glass-pill rounded-2xl p-6 border border-white/10">
                                            <p className="text-neutral-400 font-medium">No local episodes found for this season.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <>
                    <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
                    <div
                        className="fixed z-[60] liquid-glass-dock rounded-2xl border border-white/15 shadow-[0_15px_40px_rgba(0,0,0,0.85)] overflow-hidden min-w-52 divide-y divide-white/10 backdrop-blur-2xl animate-in zoom-in-95 duration-150"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                    >
                        <div className="px-4 py-2.5 bg-white/[0.04]">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Episode Options</p>
                            <p className="text-sm font-semibold truncate max-w-48 text-white mt-0.5">{contextMenu.episode.title}</p>
                        </div>
                        <div className="p-1 space-y-0.5">
                            {contextMenu.episode.watchProgress?.completed === 1 ? (
                                <button
                                    onClick={() => {
                                        if (onMarkWatched) onMarkWatched(contextMenu.episode, false);
                                        setContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition w-full text-left text-neutral-200 text-sm cursor-pointer"
                                >
                                    <EyeOff className="w-4 h-4 text-neutral-400" />
                                    Mark as Unwatched
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        if (onMarkWatched) onMarkWatched(contextMenu.episode, true);
                                        setContextMenu(null);
                                    }}
                                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition w-full text-left text-neutral-200 text-sm cursor-pointer"
                                >
                                    <Eye className="w-4 h-4 text-emerald-400" />
                                    Mark as Watched
                                </button>
                            )}
                            <button
                                onClick={handleRemoveFromLibrary}
                                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition w-full text-left text-neutral-200 text-sm cursor-pointer"
                            >
                                <BookmarkMinus className="w-4 h-4 text-neutral-400" />
                                Remove from Library
                            </button>
                            <button
                                onClick={handleDelete}
                                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-500/20 text-rose-300 hover:text-rose-200 transition w-full text-left text-sm cursor-pointer"
                            >
                                <Trash2 className="w-4 h-4 text-rose-400" />
                                Delete Permanently
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Stream Server Modal */}
            {showStreamServers && show.tmdbId && selectedEpisode && (
                <StreamServerModal
                    tmdbId={show.tmdbId}
                    type="tv"
                    title={`${show.title} - S${selectedEpisode.seasonNumber}E${selectedEpisode.episodeNumber}`}
                    season={selectedEpisode.seasonNumber}
                    episode={selectedEpisode.episodeNumber}
                    onClose={() => setShowStreamServers(false)}
                    canGoPrevEpisode={!!adjacentEpisodes.prev}
                    canGoNextEpisode={!!adjacentEpisodes.next}
                    onNavigateEpisode={(direction) => {
                        const target = direction === 'prev' ? adjacentEpisodes.prev : adjacentEpisodes.next;
                        if (target) setSelectedEpisode(target);
                    }}
                />
            )}

            {hoveredRating && (
                <div
                    className="fixed z-[70] -translate-x-1/2 -translate-y-full px-2 py-1 rounded bg-black/90 border border-neutral-700 text-[11px] text-neutral-200 pointer-events-none"
                    style={{ left: hoveredRating.x, top: hoveredRating.y }}
                >
                    {(() => {
                        const score = episodeScore(hoveredRating.imdbRating, hoveredRating.rating, hoveredRating.voteCount);
                        const label = `S${hoveredRating.season}E${hoveredRating.episode}`;
                        return score
                            ? `${label} - ${score.value.toFixed(1)}★ ${score.source}`
                            : `${label} - Not rated yet`;
                    })()}
                </div>
            )}

            {toast && <ToastNotification toast={toast} />}
        </div>
    );
}
