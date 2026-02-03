'use client';

import { Film, Tv, Play } from 'lucide-react';

type WatchProgress = {
    progress: number;
    duration: number;
    completed: number;
};

export type ContentItem = {
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
    filePath?: string;
    watchProgress?: WatchProgress;
};

type Props = {
    item: ContentItem;
    onClick: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    showProgress?: boolean;
};

export default function ContentCard({ item, onClick, onContextMenu, showProgress = true }: Props) {
    const year = item.year || (item.firstAirDate ? item.firstAirDate.substring(0, 4) : '');
    const progressPercent = item.watchProgress && item.watchProgress.duration > 0
        ? (item.watchProgress.progress / item.watchProgress.duration) * 100
        : 0;

    return (
        <div
            onClick={onClick}
            onContextMenu={onContextMenu}
            className="group relative aspect-[2/3] bg-neutral-800 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:z-30 hover:shadow-2xl hover:shadow-black/50 hover:ring-2 hover:ring-red-600"
        >
            {item.posterPath ? (
                <img
                    src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                    alt={item.title}
                    className="w-full h-full object-cover transition duration-500 group-hover:brightness-75"
                    loading="lazy"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center p-4 text-center text-neutral-500 bg-neutral-900">
                    <div>
                        {item.type === 'movie' ? <Film className="w-8 h-8 mx-auto mb-2" /> : <Tv className="w-8 h-8 mx-auto mb-2" />}
                        <span className="text-sm">{item.title}</span>
                    </div>
                </div>
            )}

            {/* Progress bar */}
            {showProgress && progressPercent > 0 && progressPercent < 95 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700">
                    <div
                        className="h-full bg-red-600 transition-all"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col justify-end bg-gradient-to-t from-black/90 to-transparent">
                <h4 className="font-bold text-white text-sm line-clamp-2">{item.title}</h4>
                <div className="flex justify-between items-center mt-2">
                    <div className="flex gap-2 text-xs text-neutral-400">
                        {item.type === 'show' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                        <span>{year}</span>
                    </div>
                    <div className="p-1.5 bg-red-600 rounded-full">
                        <Play className="w-3 h-3 fill-white text-white" />
                    </div>
                </div>
            </div>

            {/* Watched badge */}
            {item.watchProgress?.completed === 1 && (
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-600 text-white text-xs rounded-full font-medium">
                    ✓ Watched
                </div>
            )}
        </div>
    );
}
