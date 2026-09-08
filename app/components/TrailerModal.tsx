'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, PlayCircle, AlertCircle } from 'lucide-react';

type Props = {
    isOpen: boolean;
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    season?: number;
    episode?: number;
    onClose: () => void;
};

type TrailerData = {
    key: string;
    name: string;
    site: string;
    type: string;
};

export default function TrailerModal({ isOpen, tmdbId, mediaType, title, season, episode, onClose }: Props) {
    const [trailer, setTrailer] = useState<TrailerData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTrailer = useCallback(async () => {
        setLoading(true);
        setError(null);
        setTrailer(null);
        try {
            const params = new URLSearchParams({
                tmdbId: String(tmdbId),
                mediaType,
                ...(season !== undefined ? { season: String(season) } : {}),
                ...(episode !== undefined ? { episode: String(episode) } : {}),
            });
            const res = await fetch(`/api/trailer?${params}`);
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to load trailer');
            } else {
                setTrailer(data);
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [tmdbId, mediaType, season, episode]);

    useEffect(() => {
        if (isOpen && tmdbId) {
            fetchTrailer();
        }
        if (!isOpen) {
            setTrailer(null);
            setError(null);
        }
    }, [isOpen, tmdbId, fetchTrailer]);

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Trailer"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

            {/* Modal */}
            <div
                className="relative w-full max-w-5xl liquid-glass-base border border-white/15 rounded-3xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(255,255,255,0.08)] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 liquid-orb bg-amber-500/20 border-amber-500/35 text-amber-400 flex items-center justify-center shrink-0">
                            <PlayCircle className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-white text-base truncate">{title}</h3>
                            {trailer && (
                                <p className="text-xs text-neutral-400 truncate">{trailer.name}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 liquid-orb text-neutral-300 hover:text-white transition cursor-pointer flex-shrink-0 ml-3"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="relative aspect-video bg-black">
                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
                            <p className="text-neutral-400 text-sm font-medium">Loading trailer...</p>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                            <div className="p-5 liquid-glass-pill bg-white/[0.03] rounded-2xl border border-white/10 text-center max-w-md">
                                <AlertCircle className="w-12 h-12 text-neutral-500 mx-auto mb-3" />
                                <h4 className="font-bold text-neutral-200 mb-1">No Trailer Available</h4>
                                <p className="text-xs text-neutral-400 leading-relaxed">
                                    {error === 'No trailer found'
                                        ? `We couldn't find a trailer for "${title}" on TMDB.`
                                        : error}
                                </p>
                            </div>
                        </div>
                    )}

                    {trailer && !loading && (
                        <iframe
                            src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1`}
                            title={trailer.name || `${title} Trailer`}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen *"
                            allowFullScreen
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
