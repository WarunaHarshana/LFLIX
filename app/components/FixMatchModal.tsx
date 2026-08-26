'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Film, Tv, Loader2, Check, Sparkles } from 'lucide-react';
import TMDBImage from './TMDBImage';
import type { ContentItem } from '@/app/types';

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

type Props = {
    item: ContentItem | null;
    isOpen: boolean;
    onClose: () => void;
    onMatched: (updatedItem?: any) => void;
    onShowToast: (msg: string, type: 'success' | 'error') => void;
};

export default function FixMatchModal({ item, isOpen, onClose, onMatched, onShowToast }: Props) {
    const [query, setQuery] = useState('');
    const [type, setType] = useState<'movie' | 'tv'>('movie');
    const [results, setResults] = useState<TmdbResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [matchingId, setMatchingId] = useState<number | null>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && item) {
            const initialQuery = item.title || item.filePath?.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
            setQuery(initialQuery);
            setType(item.type === 'show' ? 'tv' : 'movie');
            searchTmdb(initialQuery, item.type === 'show' ? 'tv' : 'movie');
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setResults([]);
            setQuery('');
        }
    }, [isOpen, item]);

    const searchTmdb = async (searchQuery: string, searchType: 'movie' | 'tv') => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setResults([]);
            return;
        }

        setSearching(true);
        try {
            const res = await fetch(`/api/tmdb-search?q=${encodeURIComponent(searchQuery.trim())}&type=${searchType}`);
            const data = await res.json();
            setResults(data.results || []);
        } catch (e) {
            console.error('Failed to search TMDB', e);
        } finally {
            setSearching(false);
        }
    };

    const handleQueryChange = (val: string) => {
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            searchTmdb(val, type);
        }, 300);
    };

    const handleTypeChange = (newType: 'movie' | 'tv') => {
        setType(newType);
        searchTmdb(query, newType);
    };

    const handleApplyMatch = async (result: TmdbResult) => {
        if (!item) return;
        setMatchingId(result.tmdbId);
        try {
            const res = await fetch('/api/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: item.id,
                    type: item.type,
                    tmdbId: result.tmdbId,
                }),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to match');
            }

            onShowToast(`Metadata updated to "${result.title}"`, 'success');
            onMatched(data.item);
            onClose();
        } catch (e: any) {
            onShowToast(e.message || 'Failed to update metadata', 'error');
        } finally {
            setMatchingId(null);
        }
    };

    if (!isOpen || !item) return null;

    return (
        <>
            <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed inset-0 z-[81] flex items-center justify-center p-4" onClick={onClose}>
                <div
                    className="bg-neutral-900 border border-neutral-700/60 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                        <div className="flex items-center gap-3">
                            <Sparkles className="w-5 h-5 text-red-500" />
                            <div>
                                <h3 className="text-lg font-bold text-white">Fix Match / Search Metadata</h3>
                                <p className="text-xs text-neutral-400 truncate max-w-md">
                                    Current: <span className="text-neutral-200 font-medium">{item.title}</span> {item.year ? `(${item.year})` : ''}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Search bar & Type toggle */}
                    <div className="p-6 border-b border-neutral-800 space-y-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => handleQueryChange(e.target.value)}
                                    placeholder="Search title on TMDB..."
                                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white transition"
                                />
                            </div>
                            <div className="flex bg-neutral-950 border border-neutral-700 rounded-xl p-1">
                                <button
                                    onClick={() => handleTypeChange('movie')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                                        type === 'movie' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'
                                    }`}
                                >
                                    <Film className="w-3.5 h-3.5" /> Movie
                                </button>
                                <button
                                    onClick={() => handleTypeChange('tv')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                                        type === 'tv' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'
                                    }`}
                                >
                                    <Tv className="w-3.5 h-3.5" /> TV Show
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Results list */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
                        {searching ? (
                            <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                                <span className="text-sm">Searching TMDB...</span>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="text-center py-12 text-neutral-500 text-sm">
                                {query.trim().length >= 2 ? 'No TMDB matches found for this query' : 'Type a movie or show title to search'}
                            </div>
                        ) : (
                            results.map((res) => (
                                <div
                                    key={res.tmdbId}
                                    className="flex items-center gap-4 p-3 bg-neutral-950/60 hover:bg-neutral-800/80 border border-neutral-800/80 hover:border-neutral-700 rounded-xl transition group"
                                >
                                    {/* Thumbnail */}
                                    <div className="relative w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-800">
                                        {res.posterPath ? (
                                            <TMDBImage
                                                src={res.posterPath}
                                                alt={res.title}
                                                tmdbSize="w185"
                                                fill
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-neutral-600">
                                                {type === 'tv' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                                            </div>
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-white text-sm truncate">{res.title}</h4>
                                            {res.year && (
                                                <span className="text-xs text-neutral-400 font-mono">({res.year})</span>
                                            )}
                                            {res.rating && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded font-medium">
                                                    ★ {res.rating.toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                        {res.overview && (
                                            <p className="text-xs text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
                                                {res.overview}
                                            </p>
                                        )}
                                        <span className="text-[10px] text-neutral-500 mt-1 inline-block font-mono">
                                            TMDB #{res.tmdbId}
                                        </span>
                                    </div>

                                    {/* Match button */}
                                    <button
                                        onClick={() => handleApplyMatch(res)}
                                        disabled={matchingId !== null}
                                        className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-lg hover:bg-neutral-200 transition flex-shrink-0 disabled:opacity-50 flex items-center gap-1.5 shadow-sm cursor-pointer"
                                    >
                                        {matchingId === res.tmdbId ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Matching...
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-3.5 h-3.5" /> Match
                                            </>
                                        )}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
