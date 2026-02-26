'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, PlayCircle, AlertCircle } from 'lucide-react';

type Props = {
    isOpen: boolean;
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    onClose: () => void;
};

type TrailerData = {
    key: string;
    name: string;
    site: string;
    type: string;
};

export default function TrailerModal({ isOpen, tmdbId, mediaType, title, onClose }: Props) {
    const [trailer, setTrailer] = useState<TrailerData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTrailer = useCallback(async () => {
        setLoading(true);
        setError(null);
        setTrailer(null);
        try {
            const res = await fetch(`/api/trailer?tmdbId=${tmdbId}&mediaType=${mediaType}`);
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
    }, [tmdbId, mediaType]);

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
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

            {/* Modal */}
            <div
                className="relative w-full max-w-5xl bg-neutral-900/95 border border-neutral-700/50 rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
                    <div className="flex items-center gap-3 min-w-0">
                        <PlayCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <div className="min-w-0">
                            <h3 className="font-semibold text-white truncate">{title}</h3>
                            {trailer && (
                                <p className="text-xs text-neutral-400 truncate">{trailer.name}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-800 rounded-full transition flex-shrink-0 ml-3"
                    >
                        <X className="w-5 h-5 text-neutral-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="relative aspect-video bg-black">
                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                            <p className="text-neutral-400 text-sm">Loading trailer...</p>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                            <div className="p-4 bg-neutral-800/50 rounded-2xl border border-neutral-700/50 text-center max-w-md">
                                <AlertCircle className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                                <h4 className="font-semibold text-neutral-300 mb-1">No Trailer Available</h4>
                                <p className="text-sm text-neutral-500">
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
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
