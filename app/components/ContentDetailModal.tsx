'use client';

import { useState } from 'react';
import { X, Play, Star, Clock, Film, Tv, HardDrive, Info } from 'lucide-react';

type ContentItem = {
    id: number;
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
};

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export default function ContentDetailModal({ item, onClose, onPlay, onViewEpisodes }: Props) {
    const [imgLoaded, setImgLoaded] = useState(false);
    const year = item.year || (item.firstAirDate ? item.firstAirDate.substring(0, 4) : '');
    const progressPercent = item.watchProgress && item.watchProgress.duration > 0
        ? (item.watchProgress.progress / item.watchProgress.duration) * 100
        : 0;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="relative w-full max-w-4xl max-h-[90vh] bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Backdrop Header */}
                <div className="relative h-72 sm:h-96 shrink-0">
                    {(item.backdropPath || item.posterPath) ? (
                        <img
                            src={`https://image.tmdb.org/t/p/original${item.backdropPath || item.posterPath}`}
                            className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-60' : 'opacity-0'}`}
                            alt=""
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
                    <div className="absolute bottom-0 left-0 right-0 p-8 flex gap-6">
                        {/* Poster thumbnail */}
                        {item.posterPath && (
                            <div className="hidden sm:block shrink-0 w-32 h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-neutral-700/50 -mb-16 relative z-10">
                                <img
                                    src={`https://image.tmdb.org/t/p/w300${item.posterPath}`}
                                    className="w-full h-full object-cover"
                                    alt={item.title}
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
                                {item.isHDR && (
                                    <span className="px-1.5 py-0.5 bg-amber-500/90 text-black text-xs rounded font-bold tracking-wide">
                                        HDR
                                    </span>
                                )}
                                {item.resolution && (
                                    <span className="px-1.5 py-0.5 bg-blue-500/80 text-white text-xs rounded font-bold tracking-wide">
                                        {item.resolution === '2160p' ? '4K' : item.resolution}
                                    </span>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 mt-4">
                                {item.type === 'movie' ? (
                                    <button
                                        onClick={onPlay}
                                        className="px-6 py-2.5 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-neutral-200 transition text-sm"
                                    >
                                        <Play className="w-5 h-5 fill-black" />
                                        {progressPercent > 0 && progressPercent < 95 ? 'Resume' : 'Play'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={onViewEpisodes}
                                        className="px-6 py-2.5 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-neutral-200 transition text-sm"
                                    >
                                        <Play className="w-5 h-5 fill-black" /> View Episodes
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="p-8 pt-4 sm:pl-48 overflow-y-auto flex-1">
                    {/* Watch Progress */}
                    {item.type === 'movie' && progressPercent > 0 && progressPercent < 95 && item.watchProgress && (
                        <div className="mb-6">
                            <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{formatDuration(item.watchProgress.progress)} / {formatDuration(item.watchProgress.duration)}</span>
                            </div>
                            <div className="h-1.5 w-full max-w-md bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-600 rounded-full transition-all"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Overview */}
                    {item.overview && (
                        <div className="mb-6">
                            <p className="text-neutral-300 leading-relaxed">{item.overview}</p>
                        </div>
                    )}

                    {/* Genres */}
                    {item.genres && (
                        <div className="mb-6">
                            <div className="flex flex-wrap gap-2">
                                {item.genres.split(',').map((genre, i) => (
                                    <span key={i} className="px-3 py-1 bg-neutral-800 text-neutral-300 text-sm rounded-full border border-neutral-700">
                                        {genre.trim()}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Technical Details */}
                    {(item.videoCodec || item.audioCodec || item.audioChannels || item.resolution) && (
                        <div className="mb-2">
                            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Info className="w-3.5 h-3.5" /> Technical Info
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {item.resolution && (
                                    <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-800">
                                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Resolution</div>
                                        <div className="text-sm font-semibold text-neutral-200 mt-1">
                                            {item.resolution === '2160p' ? '4K UHD' : item.resolution}
                                        </div>
                                    </div>
                                )}
                                {item.videoCodec && (
                                    <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-800">
                                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Video</div>
                                        <div className="text-sm font-semibold text-neutral-200 mt-1">{item.videoCodec}</div>
                                    </div>
                                )}
                                {item.audioCodec && (
                                    <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-800">
                                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Audio</div>
                                        <div className="text-sm font-semibold text-neutral-200 mt-1">{item.audioCodec}</div>
                                    </div>
                                )}
                                {item.audioChannels && (
                                    <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-800">
                                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Channels</div>
                                        <div className="text-sm font-semibold text-neutral-200 mt-1">{item.audioChannels}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
