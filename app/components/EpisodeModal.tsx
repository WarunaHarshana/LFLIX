'use client';

import { useState, useEffect } from 'react';
import { X, Play, RefreshCw, ChevronDown, ChevronLeft, Trash2, Clock, Info, Star } from 'lucide-react';

type Episode = {
    id: number;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    filePath: string;
    overview?: string | null;
    stillPath?: string | null;
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
};

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export default function EpisodeModal({ show, seasons, loading, onClose, onPlayEpisode, onDeleteEpisode }: Props) {
    const [activeSeason, setActiveSeason] = useState(seasons[0]?.season || 1);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; episodeId: number } | null>(null);
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

    // Reset active season when seasons change (new show opened)
    useEffect(() => {
        setActiveSeason(seasons[0]?.season || 1);
        setSelectedEpisode(null);
    }, [seasons]);

    const currentSeason = seasons.find(s => s.season === activeSeason);

    const handleContextMenu = (e: React.MouseEvent, episodeId: number) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, episodeId });
    };

    const handleDelete = () => {
        if (contextMenu && onDeleteEpisode) {
            onDeleteEpisode(contextMenu.episodeId);
        }
        setContextMenu(null);
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
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-3xl font-bold">{show.title}</h2>
                                {show.rating && (
                                    <span className="inline-block mt-2 px-2 py-0.5 bg-green-600 text-white text-sm rounded">
                                        {Math.round(show.rating * 10)}% Match
                                    </span>
                                )}
                                <p className="text-neutral-400 mt-2 line-clamp-2">{show.overview}</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Episode Detail View */}
                {selectedEpisode ? (
                    <div className="flex-1 overflow-y-auto p-8">
                        {/* Play Button */}
                        <div className="flex gap-3 mb-6">
                            <button
                                onClick={() => onPlayEpisode(selectedEpisode.id, selectedEpisode.watchProgress?.progress)}
                                className="px-6 py-2.5 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-neutral-200 transition text-sm"
                            >
                                <Play className="w-5 h-5 fill-black" />
                                {selectedEpisode.watchProgress && selectedEpisode.watchProgress.progress > 0
                                    && (selectedEpisode.watchProgress.progress / selectedEpisode.watchProgress.duration) * 100 < 95
                                    ? 'Resume' : 'Play'}
                            </button>
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

                        {/* Media Info Badges */}
                        {(selectedEpisode.resolution || selectedEpisode.videoCodec || selectedEpisode.audioCodec || selectedEpisode.audioChannels || selectedEpisode.isHDR) && (
                            <div className="mb-6">
                                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Info className="w-3.5 h-3.5" /> Technical Info
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {selectedEpisode.resolution && (
                                        <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-800">
                                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Resolution</div>
                                            <div className="text-sm font-semibold text-neutral-200 mt-1">
                                                {selectedEpisode.resolution === '2160p' ? '4K UHD' : selectedEpisode.resolution}
                                            </div>
                                        </div>
                                    )}
                                    {selectedEpisode.videoCodec && (
                                        <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-800">
                                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Video</div>
                                            <div className="text-sm font-semibold text-neutral-200 mt-1">{selectedEpisode.videoCodec}</div>
                                        </div>
                                    )}
                                    {selectedEpisode.audioCodec && (
                                        <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-800">
                                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Audio</div>
                                            <div className="text-sm font-semibold text-neutral-200 mt-1">{selectedEpisode.audioCodec}</div>
                                        </div>
                                    )}
                                    {selectedEpisode.audioChannels && (
                                        <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-800">
                                            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Channels</div>
                                            <div className="text-sm font-semibold text-neutral-200 mt-1">{selectedEpisode.audioChannels}</div>
                                        </div>
                                    )}
                                    {selectedEpisode.isHDR && (
                                        <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/30">
                                            <div className="text-[10px] text-amber-500 uppercase tracking-wider">HDR</div>
                                            <div className="text-sm font-semibold text-amber-400 mt-1">High Dynamic Range</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Season Tabs */}
                        {seasons.length > 1 && (
                            <div className="px-8 py-4 border-b border-neutral-800">
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

                        {/* Episode List */}
                        <div className="flex-1 overflow-y-auto p-8">
                            <h3 className="text-lg font-bold mb-4 text-neutral-300 flex items-center gap-2">
                                <ChevronDown className="w-4 h-4" />
                                {seasons.length > 1 ? `Season ${activeSeason}` : 'Episodes'}
                                <span className="text-neutral-500 font-normal">
                                    ({currentSeason?.episodes.length || 0} episodes)
                                </span>
                            </h3>

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
                                                onContextMenu={(e) => handleContextMenu(e, ep.id)}
                                                className="relative flex gap-4 p-4 rounded-xl hover:bg-neutral-800 cursor-pointer group transition border border-transparent hover:border-neutral-700"
                                            >
                                                {/* Episode thumbnail */}
                                                {ep.stillPath ? (
                                                    <div className="shrink-0 w-36 h-20 rounded-lg overflow-hidden bg-neutral-800 relative">
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
                                                    <div className="shrink-0 w-36 h-20 rounded-lg bg-neutral-800 flex items-center justify-center">
                                                        <span className="text-2xl font-bold text-neutral-600">{ep.episodeNumber}</span>
                                                    </div>
                                                )}

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-neutral-500 font-medium">E{ep.episodeNumber}</span>
                                                        <h4 className="font-medium text-neutral-200 group-hover:text-red-500 transition truncate">
                                                            {ep.title}
                                                        </h4>
                                                    </div>

                                                    {ep.overview && (
                                                        <p className="text-xs text-neutral-500 line-clamp-2 mt-1">{ep.overview}</p>
                                                    )}

                                                    {/* Media info badges */}
                                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                        {ep.resolution && (
                                                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded font-semibold">
                                                                {ep.resolution === '2160p' ? '4K' : ep.resolution}
                                                            </span>
                                                        )}
                                                        {ep.isHDR && (
                                                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-semibold">
                                                                HDR
                                                            </span>
                                                        )}
                                                        {ep.videoCodec && (
                                                            <span className="px-1.5 py-0.5 bg-neutral-700/50 text-neutral-400 text-[10px] rounded font-semibold">
                                                                {ep.videoCodec}
                                                            </span>
                                                        )}
                                                        {ep.audioChannels && (
                                                            <span className="px-1.5 py-0.5 bg-neutral-700/50 text-neutral-400 text-[10px] rounded font-semibold">
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
                        className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                    >
                        <button
                            onClick={handleDelete}
                            className="flex items-center gap-2 px-4 py-3 hover:bg-red-600 transition w-full text-left"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Episode
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
