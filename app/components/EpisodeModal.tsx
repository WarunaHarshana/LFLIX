'use client';

import { useState, useEffect } from 'react';
import { X, Play, RefreshCw, ChevronDown, Trash2 } from 'lucide-react';

type Episode = {
    id: number;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    filePath: string;
    overview?: string | null;
    stillPath?: string | null;
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

export default function EpisodeModal({ show, seasons, loading, onClose, onPlayEpisode, onDeleteEpisode }: Props) {
    const [activeSeason, setActiveSeason] = useState(seasons[0]?.season || 1);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; episodeId: number } | null>(null);

    // Reset active season when seasons change (new show opened)
    useEffect(() => {
        setActiveSeason(seasons[0]?.season || 1);
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
                    {(show.backdropPath || show.posterPath) && (
                        <img
                            src={`https://image.tmdb.org/t/p/original${show.backdropPath || show.posterPath}`}
                            className="w-full h-full object-cover opacity-40"
                            alt=""
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent" />

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black rounded-full text-white transition"
                    >
                        <X className="w-6 h-6" />
                    </button>

                    <div className="absolute bottom-6 left-8 right-8">
                        <h2 className="text-3xl font-bold">{show.title}</h2>
                        {show.rating && (
                            <span className="inline-block mt-2 px-2 py-0.5 bg-green-600 text-white text-sm rounded">
                                {Math.round(show.rating * 10)}% Match
                            </span>
                        )}
                        <p className="text-neutral-400 mt-2 line-clamp-2">{show.overview}</p>
                    </div>
                </div>

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
                                        onClick={() => onPlayEpisode(ep.id, ep.watchProgress?.progress)}
                                        onContextMenu={(e) => handleContextMenu(e, ep.id)}
                                        className="relative flex items-center gap-4 p-4 rounded-xl hover:bg-neutral-800 cursor-pointer group transition border border-transparent hover:border-neutral-700"
                                    >
                                        <div className="text-2xl font-bold text-neutral-600 group-hover:text-white w-8 text-center">
                                            {ep.episodeNumber}
                                        </div>

                                        <div className="flex-1">
                                            <h4 className="font-medium text-neutral-200 group-hover:text-red-500 transition">
                                                {ep.title}
                                            </h4>
                                            {ep.overview && (
                                                <p className="text-xs text-neutral-500 line-clamp-1 mt-1">{ep.overview}</p>
                                            )}

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
                                            <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded">
                                                Watched
                                            </span>
                                        )}

                                        <Play className="w-5 h-5 text-neutral-600 group-hover:text-white fill-current" />
                                    </div>
                                );
                            })}

                            {(!currentSeason || currentSeason.episodes.length === 0) && (
                                <p className="text-neutral-500 text-center py-8">No episodes found.</p>
                            )}
                        </div>
                    )}
                </div>
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
