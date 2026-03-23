'use client';

import { useState, useRef } from 'react';
import { Play, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

type ContinueItem = {
    id: number;
    contentType: 'movie' | 'show';
    contentId: number;
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    progress: number;
    duration: number;
    filePath?: string;
    episodeFilePath?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    episodeTitle?: string;
};

type Props = {
    items: ContinueItem[];
    onPlay: (filePath: string, startTime?: number) => void;
    onOpenShow: (showId: number) => void;
};

export default function ContinueWatching({ items, onPlay, onOpenShow }: Props) {
    if (items.length === 0) return null;

    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(true);

    const handleClick = (item: ContinueItem) => {
        const filePath = item.episodeFilePath || item.filePath;
        if (filePath) {
            onPlay(filePath, item.progress);
        } else if (item.contentType === 'show') {
            onOpenShow(item.contentId);
        }
    };

    const scroll = (direction: 'left' | 'right') => {
        if (!scrollRef.current) return;
        const amount = scrollRef.current.clientWidth * 0.7;
        scrollRef.current.scrollBy({
            left: direction === 'left' ? -amount : amount,
            behavior: 'smooth'
        });
    };

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setShowLeftArrow(scrollLeft > 10);
        setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 10);
    };

    return (
        <section className="px-12 mb-10 relative group/cw">
            <div className="flex items-center gap-3 mb-4">
                <Clock className="w-5 h-5 text-red-500" />
                <h3 className="text-xl font-semibold text-neutral-200">Continue Watching</h3>
            </div>

            {/* Left arrow */}
            {showLeftArrow && (
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-4 top-1/2 translate-y-2 z-10 p-2 bg-black/70 hover:bg-black/90 backdrop-blur rounded-full text-white opacity-0 group-hover/cw:opacity-100 transition-opacity shadow-lg"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
            )}

            {/* Right arrow */}
            {showRightArrow && items.length > 3 && (
                <button
                    onClick={() => scroll('right')}
                    className="absolute right-4 top-1/2 translate-y-2 z-10 p-2 bg-black/70 hover:bg-black/90 backdrop-blur rounded-full text-white opacity-0 group-hover/cw:opacity-100 transition-opacity shadow-lg"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            )}

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-snap-x"
            >
                {items.map((item) => {
                    const progressPercent = item.duration > 0 ? (item.progress / item.duration) * 100 : 0;
                    const remainingMins = Math.round((item.duration - item.progress) / 60);

                    return (
                        <div
                            key={item.id}
                            onClick={() => handleClick(item)}
                            className="group relative flex-shrink-0 w-72 bg-neutral-800 rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-white/20 transition-all duration-300 hover:scale-[1.03] scroll-snap-start"
                        >
                            {/* Backdrop/Poster */}
                            <div className="relative h-40">
                                {item.backdropPath || item.posterPath ? (
                                    <img
                                        src={`https://image.tmdb.org/t/p/w500${item.backdropPath || item.posterPath}`}
                                        alt={item.title}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-neutral-700" />
                                )}

                                {/* Play overlay */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
                                    <div className="p-4 bg-white rounded-full">
                                        <Play className="w-6 h-6 fill-black text-black" />
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-600">
                                    <div
                                        className="h-full bg-red-600"
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-4">
                                <h4 className="font-semibold text-white truncate">{item.title}</h4>
                                {item.seasonNumber && item.episodeNumber && (
                                    <p className="text-sm text-neutral-400 mt-1">
                                        S{item.seasonNumber} E{item.episodeNumber}
                                        {item.episodeTitle && ` • ${item.episodeTitle}`}
                                    </p>
                                )}
                                <p className="text-xs text-neutral-500 mt-2">
                                    {remainingMins > 0 ? `${remainingMins} min remaining` : 'Almost done'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
