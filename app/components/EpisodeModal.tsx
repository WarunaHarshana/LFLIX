'use client';

import { useState, useEffect } from 'react';
import { X, Play, RefreshCw, ChevronDown, ChevronLeft, Trash2, Clock, Star, Globe, BarChart3, SkipForward, Eye, EyeOff, DownloadCloud, Download } from 'lucide-react';
import StreamServerModal from './StreamServerModal';

type Episode = {
    id: number;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    filePath: string;
    overview?: string | null;
    stillPath?: string | null;
    rating?: number | null;
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
};

type Props = {
    show: Show;
    seasons: Season[];
    loading: boolean;
    onClose: () => void;
    onPlayEpisode: (episodeId: number, startTime?: number) => void;
    onDeleteEpisode?: (episodeId: number) => void;
    onMarkWatched?: (episode: Episode, watched: boolean) => void;
};

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export default function EpisodeModal({ show, seasons, loading, onClose, onPlayEpisode, onDeleteEpisode, onMarkWatched }: Props) {
    const [activeSeason, setActiveSeason] = useState(seasons[0]?.season || 1);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; episode: Episode } | null>(null);
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
    const [showStreamServers, setShowStreamServers] = useState(false);
    const [showRatingGrid, setShowRatingGrid] = useState(true);
    const [hoveredRating, setHoveredRating] = useState<{ season: number; episode: number; rating: number | null; x: number; y: number } | null>(null);
    const [isDownloadingMissing, setIsDownloadingMissing] = useState(false);
    
    const [isDownloadingNext, setIsDownloadingNext] = useState(false);
    const [downloadNextQuery, setDownloadNextQuery] = useState<string | null>(null);

    // Reset active season when seasons change (new show opened)
    useEffect(() => {
        setActiveSeason(seasons[0]?.season || 1);
        setSelectedEpisode(null);
    }, [seasons]);

    const currentSeason = seasons.find(s => s.season === activeSeason);

    const handleContextMenu = (e: React.MouseEvent, episode: Episode) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, episode });
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
                    seasonNumber: activeSeason
                })
            });
            const data = await res.json();
            if (res.ok) {
                // Could toast here if we had a toast system
                console.log(data.message);
            }
        } catch { /* ignore */ }
        
        // Brief timeout so button doesn't flash immediately on quick resolves
        setTimeout(() => setIsDownloadingMissing(false), 1000);
    };

    const handleDownloadNext = async () => {
        if (!show.id) return;
        setIsDownloadingNext(true);
        try {
            const res = await fetch(`/api/episodes/next?showId=${show.id}&autoDownload=true`);
            const data = await res.json();
            if (res.ok && data.queued) {
                // Success: autoDownloader will handle it and add it to downloads tab
                console.log('Download queued automatically');
            } else {
                console.error('Failed to queue next episode download', data.error);
            }
        } catch(e) {
            console.error('Network error queueing next episode', e);
        }
        setIsDownloadingNext(false);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/95 flex justify-end" onClick={onClose}>
            <div
                className="w-full max-w-2xl bg-neutral-900 h-full border-l border-neutral-800 flex flex-col animate-in slide-in-from-right duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with backdrop */}
                <div className="relative h-64 shrink-0">
                    {/* Show the episode still if one is selected, otherwise show backdrop */}
                    {selectedEpisode?.stillPath ? (
                        <img
                            src={`https://image.tmdb.org/t/p/original${selectedEpisode.stillPath}`}
                            className="w-full h-full object-cover opacity-50 transition-all duration-300"
                            alt=""
                        />
                    ) : (show.backdropPath || show.posterPath) ? (
                        <img
                            src={`https://image.tmdb.org/t/p/original${show.backdropPath || show.posterPath}`}
                            className="w-full h-full object-cover opacity-40"
                            alt=""
                        />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent" />

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black rounded-full text-white transition"
                    >
                        <X className="w-6 h-6" />
                    </button>

                    <div className="absolute bottom-6 left-8 right-8">
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
                                    {selectedEpisode.rating != null && selectedEpisode.rating > 0 && (
                                        <>
                                            <span>•</span>
                                            <span className="inline-flex items-center gap-1 text-amber-400">
                                                <Star className="w-3.5 h-3.5 fill-amber-400" />
                                                {selectedEpisode.rating.toFixed(1)}
                                            </span>
                                        </>
                                    )}
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
                                <h2 className="text-3xl font-bold">{show.title}</h2>
                                {show.rating != null && show.rating > 0 && (
                                    <span className="inline-flex mt-2 bg-[#F5C518] px-2.5 py-1 rounded-md shadow-sm">
                                        <span className="text-sm font-bold text-black">TMDB {show.rating.toFixed(1)}</span>
                                    </span>
                                )}
                                <p className="text-neutral-400 mt-2 line-clamp-2">{show.overview}</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Episode Detail View */}
                {selectedEpisode ? (
                    <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                        {/* Play Button */}
                        <div className="flex gap-3 mb-6">
                            <button
                                onClick={() => onPlayEpisode(selectedEpisode.id, selectedEpisode.watchProgress?.progress)}
                                className="px-4 sm:px-6 py-2 sm:py-2.5 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-neutral-200 transition text-sm"
                            >
                                <Play className="w-5 h-5 fill-black" />
                                {selectedEpisode.watchProgress && selectedEpisode.watchProgress.progress > 0
                                    && (selectedEpisode.watchProgress.progress / selectedEpisode.watchProgress.duration) * 100 < 95
                                    ? 'Resume' : 'Play'}
                            </button>
                            {show.tmdbId && (
                                <button
                                    onClick={() => setShowStreamServers(true)}
                                    className="px-4 py-2 sm:px-5 sm:py-2.5 bg-blue-600/80 text-white font-semibold rounded-lg flex items-center gap-2 hover:bg-blue-500 transition text-sm border border-blue-500/50"
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
                                        className="h-full bg-red-600 rounded-full transition-all"
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
                                <div className="mt-4 pt-4 border-t border-neutral-800">
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
                                        className="flex gap-3 p-3 rounded-xl bg-neutral-800/50 hover:bg-neutral-800 cursor-pointer group/next transition-all border border-transparent hover:border-neutral-700"
                                    >
                                        {nextEp.stillPath ? (
                                            <div className="shrink-0 w-28 h-16 rounded-lg overflow-hidden bg-neutral-700 relative">
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w300${nextEp.stillPath}`}
                                                    className="w-full h-full object-cover"
                                                    alt={nextEp.title}
                                                    loading="lazy"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/next:opacity-100 transition">
                                                    <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-full">
                                                        <Play className="w-3.5 h-3.5 text-white fill-white" />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="shrink-0 w-28 h-16 rounded-lg bg-neutral-700 flex items-center justify-center">
                                                <span className="text-lg font-bold text-neutral-500">{nextEp.episodeNumber}</span>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-neutral-500 font-medium">
                                                    S{nextSeasonNum || nextEp.seasonNumber} E{nextEp.episodeNumber}
                                                </span>
                                            </div>
                                            <h5 className="text-sm font-medium text-neutral-200 group-hover/next:text-white transition truncate">{nextEp.title}</h5>
                                            {nextEp.overview && (
                                                <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">{nextEp.overview}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPlayEpisode(nextEp!.id, nextEp!.watchProgress?.progress);
                                            }}
                                            className="self-center px-3 py-1.5 bg-white text-black font-bold rounded-md text-xs hover:bg-neutral-200 transition flex items-center gap-1.5 shrink-0"
                                        >
                                            <Play className="w-3 h-3 fill-black" /> Play
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
                            <div className="px-4 sm:px-8 py-4 border-b border-neutral-800">
                                <div className="flex gap-2 overflow-x-auto">
                                    {seasons.map(({ season }) => (
                                        <button
                                            key={season}
                                            onClick={() => setActiveSeason(season)}
                                            className={`px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap ${activeSeason === season
                                                ? 'bg-white text-black'
                                                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
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
                            <div className="px-4 sm:px-8 py-4 border-b border-neutral-800">
                                <button
                                    onClick={() => setShowRatingGrid(!showRatingGrid)}
                                    className="flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-white transition mb-3"
                                >
                                    <BarChart3 className="w-4 h-4" />
                                    Episode Grid
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showRatingGrid ? '' : '-rotate-90'}`} />
                                </button>
                                {showRatingGrid && (
                                    <div className="space-y-2">
                                        {seasons.map(({ season, episodes }) => (
                                            <div key={season} className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-neutral-500 font-medium w-6 shrink-0">S{season}</span>
                                                <div className="flex gap-0.5 flex-wrap">
                                                    {episodes.map((ep) => {
                                                        const hasProgress = ep.watchProgress && ep.watchProgress.progress > 0;
                                                        const isCompleted = ep.watchProgress?.completed === 1;
                                                        let bgColor = 'bg-neutral-700'; // No data
                                                        if (isCompleted) bgColor = 'bg-green-500';
                                                        else if (hasProgress) bgColor = 'bg-yellow-500';

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
                                        <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-500">
                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Watched</span>
                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-500 inline-block" /> In Progress</span>
                                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-neutral-700 inline-block" /> Not Watched</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Episode List */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-neutral-300 flex items-center gap-2">
                                    <ChevronDown className="w-4 h-4" />
                                    {seasons.length > 1 ? `Season ${activeSeason}` : 'Episodes'}
                                    <span className="text-neutral-500 font-normal">
                                        ({currentSeason?.episodes.length || 0} local)
                                    </span>
                                </h3>
                                {show.tmdbId && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleDownloadNext}
                                            disabled={isDownloadingNext}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-xs font-semibold text-neutral-300 rounded-lg transition border border-neutral-700"
                                            title={`Download next episode globally across all seasons`}
                                        >
                                            <Download className={`w-3.5 h-3.5 ${isDownloadingNext ? 'animate-bounce text-blue-400' : ''}`} />
                                            {isDownloadingNext ? 'Resolving...' : 'Download Next Episode'}
                                        </button>
                                        <button
                                            onClick={handleDownloadMissing}
                                            disabled={isDownloadingMissing}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-xs font-semibold text-neutral-300 rounded-lg transition border border-neutral-700"
                                            title={`Download missing episodes in Season ${activeSeason}`}
                                        >
                                            <DownloadCloud className={`w-3.5 h-3.5 ${isDownloadingMissing ? 'animate-pulse text-blue-400' : ''}`} />
                                            {isDownloadingMissing ? 'Checking...' : 'Fetch Missing'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-10">
                                    <RefreshCw className="animate-spin text-neutral-500" />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {currentSeason?.episodes.map((ep) => {
                                        const progressPercent = ep.watchProgress && ep.watchProgress.duration > 0
                                            ? (ep.watchProgress.progress / ep.watchProgress.duration) * 100
                                            : 0;

                                        return (
                                            <div
                                                key={ep.id}
                                                onClick={() => setSelectedEpisode(ep)}
                                                onContextMenu={(e) => handleContextMenu(e, ep)}
                                                className="relative flex gap-4 p-4 rounded-xl hover:bg-neutral-800 cursor-pointer group transition border border-transparent hover:border-neutral-700"
                                            >
                                                {/* Episode thumbnail */}
                                                {ep.stillPath ? (
                                                    <div className="shrink-0 w-28 sm:w-36 h-16 sm:h-20 rounded-lg overflow-hidden bg-neutral-800 relative">
                                                        <img
                                                            src={`https://image.tmdb.org/t/p/w300${ep.stillPath}`}
                                                            className="w-full h-full object-cover"
                                                            alt={ep.title}
                                                            loading="lazy"
                                                        />
                                                        {/* Play overlay on thumbnail */}
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                                                            <div className="p-2 bg-white/20 backdrop-blur-sm rounded-full">
                                                                <Play className="w-4 h-4 text-white fill-white" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="shrink-0 w-28 sm:w-36 h-16 sm:h-20 rounded-lg bg-neutral-800 flex items-center justify-center">
                                                        <span className="text-2xl font-bold text-neutral-600">{ep.episodeNumber}</span>
                                                    </div>
                                                )}

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-neutral-500 font-medium">E{ep.episodeNumber}</span>
                                                        <h4 className="font-medium text-neutral-200 group-hover:text-red-500 transition truncate">
                                                            {ep.title}
                                                        </h4>
                                                        {ep.rating != null && ep.rating > 0 && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] rounded font-semibold">
                                                                <Star className="w-2.5 h-2.5 fill-amber-300" />
                                                                {ep.rating.toFixed(1)}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {ep.overview && (
                                                        <p className="text-xs text-neutral-500 line-clamp-2 mt-1">{ep.overview}</p>
                                                    )}

                                                    {/* Media info badges */}
                                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                        {ep.resolution && (
                                                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] rounded font-semibold">
                                                                {ep.resolution === '2160p' ? '4K' : ep.resolution}
                                                            </span>
                                                        )}
                                                        {ep.isHDR && (
                                                            <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-[10px] rounded font-semibold">
                                                                HDR
                                                            </span>
                                                        )}
                                                        {ep.videoCodec && (
                                                            <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-300 text-[10px] rounded font-semibold">
                                                                {ep.videoCodec}
                                                            </span>
                                                        )}
                                                        {ep.audioChannels && (
                                                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] rounded font-semibold">
                                                                {ep.audioChannels}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Progress bar */}
                                                    {progressPercent > 0 && progressPercent < 95 && (
                                                        <div className="mt-2 h-1 w-full max-w-xs bg-neutral-700 rounded overflow-hidden">
                                                            <div
                                                                className="h-full bg-red-600"
                                                                style={{ width: `${progressPercent}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                {ep.watchProgress?.completed === 1 && (
                                                    <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded self-start">
                                                        Watched
                                                    </span>
                                                )}

                                                <ChevronDown className="w-4 h-4 text-neutral-600 group-hover:text-white -rotate-90 self-center shrink-0" />
                                            </div>
                                        );
                                    })}

                                    {(!currentSeason || currentSeason.episodes.length === 0) && (
                                        <p className="text-neutral-500 text-center py-8">No episodes found.</p>
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
                        className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden min-w-48"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                    >
                        <div className="px-4 py-2 border-b border-neutral-700">
                            <p className="text-sm font-medium truncate max-w-48 text-neutral-100">{contextMenu.episode.title}</p>
                        </div>
                        {contextMenu.episode.watchProgress?.completed === 1 ? (
                            <button
                                onClick={() => {
                                    if (onMarkWatched) onMarkWatched(contextMenu.episode, false);
                                    setContextMenu(null);
                                }}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-700 transition w-full text-left text-neutral-200"
                            >
                                <EyeOff className="w-4 h-4" />
                                Mark as Unwatched
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    if (onMarkWatched) onMarkWatched(contextMenu.episode, true);
                                    setContextMenu(null);
                                }}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-700 transition w-full text-left text-neutral-200"
                            >
                                <Eye className="w-4 h-4" />
                                Mark as Watched
                            </button>
                        )}
                        <button
                            onClick={handleDelete}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-red-600 transition w-full text-left border-t border-neutral-700 text-neutral-200"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Episode
                        </button>
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
                />
            )}

            {hoveredRating && (
                <div
                    className="fixed z-[70] -translate-x-1/2 -translate-y-full px-2 py-1 rounded bg-black/90 border border-neutral-700 text-[11px] text-neutral-200 pointer-events-none"
                    style={{ left: hoveredRating.x, top: hoveredRating.y }}
                >
                    {hoveredRating.rating != null && hoveredRating.rating > 0
                        ? `S${hoveredRating.season}E${hoveredRating.episode} - ${hoveredRating.rating.toFixed(1)}★`
                        : `S${hoveredRating.season}E${hoveredRating.episode} - No rating`}
                </div>
            )}
        </div>
    );
}
