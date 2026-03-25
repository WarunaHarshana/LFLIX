'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Film, Tv, Play, Globe, Loader2, Star } from 'lucide-react';

type SearchResult = {
    id: number;
    type: 'movie' | 'show';
    title: string;
    posterPath: string | null;
    year?: number;
    firstAirDate?: string;
    rating: number | null;
    filePath?: string;
};

type OnlineResult = {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    year: string | null;
    rating: number | null;
    popularity: number;
};

type Props = {
    onPlay: (filePath: string) => void;
    onOpenShow: (show: SearchResult) => void;
    onOpenOnline?: (item: OnlineResult) => void;
    onClose?: () => void;
};

export default function SearchBar({ onPlay, onOpenShow, onOpenOnline, onClose }: Props) {
    const [query, setQuery] = useState('');
    const [localResults, setLocalResults] = useState<SearchResult[]>([]);
    const [onlineResults, setOnlineResults] = useState<OnlineResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loadingLocal, setLoadingLocal] = useState(false);
    const [loadingOnline, setLoadingOnline] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const search = useCallback(async (searchQuery: string, signal?: AbortSignal) => {
        if (searchQuery.length < 2) {
            setLocalResults([]);
            setOnlineResults([]);
            return;
        }

        // Search local library
        setLoadingLocal(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, { signal });
            const data = await res.json();
            setLocalResults(Array.isArray(data) ? data : []);
        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return;
            setLocalResults([]);
        } finally {
            setLoadingLocal(false);
        }

        // Search TMDB online
        setLoadingOnline(true);
        try {
            const res = await fetch(`/api/tmdb-search?q=${encodeURIComponent(searchQuery)}&type=multi`, { signal });
            const data = await res.json();
            setOnlineResults((data.results || []).slice(0, 8));
        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return;
            setOnlineResults([]);
        } finally {
            setLoadingOnline(false);
        }

        setSelectedIndex(0);
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        const controller = new AbortController();
        debounceRef.current = setTimeout(() => search(query, controller.signal), 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            controller.abort();
        };
    }, [query, search]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const total = localResults.length + onlineResults.length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, total - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex < localResults.length) {
                handleSelectLocal(localResults[selectedIndex]);
            } else {
                const onlineIdx = selectedIndex - localResults.length;
                if (onlineResults[onlineIdx]) handleSelectOnline(onlineResults[onlineIdx]);
            }
        } else if (e.key === 'Escape') {
            handleClose();
        }
    };

    const handleSelectLocal = (item: SearchResult) => {
        if (item.type === 'movie' && item.filePath) {
            onPlay(item.filePath);
        } else if (item.type === 'show') {
            onOpenShow(item);
        }
        handleClose();
    };

    const handleSelectOnline = (item: OnlineResult) => {
        onOpenOnline?.(item);
        handleClose();
    };

    const handleClose = () => {
        setQuery('');
        setLocalResults([]);
        setOnlineResults([]);
        setIsOpen(false);
        onClose?.();
    };

    const hasResults = localResults.length > 0 || onlineResults.length > 0;
    const loading = loadingLocal || loadingOnline;

    return (
        <div className="relative">
            <div className={`flex items-center transition-all duration-300 ${isOpen ? 'w-72' : 'w-10'}`}>
                <button
                    onClick={() => {
                        setIsOpen(true);
                        setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                    className="p-2 hover:bg-[var(--surface-hover)] rounded-full transition"
                >
                    <Search className="w-5 h-5" />
                </button>

                {isOpen && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search local & online..."
                        className="flex-1 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-lg px-4 py-2 text-sm outline-none focus:border-white/70 transition"
                        autoFocus
                    />
                )}

                {isOpen && (
                    <button onClick={handleClose} className="p-2 hover:bg-[var(--surface-hover)] rounded-full">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Search Results Dropdown */}
            {isOpen && hasResults && (
                <div className="absolute top-full right-0 mt-2 w-96 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
                    {/* Local results */}
                    {localResults.length > 0 && (
                        <>
                            <div className="px-3 py-1.5 bg-[var(--surface-3)] text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                                <Film className="w-3 h-3" /> Local Library
                            </div>
                            {localResults.map((item, index) => (
                                <div
                                    key={`local-${item.type}-${item.id}`}
                                    onClick={() => handleSelectLocal(item)}
                                    className={`flex items-center gap-3 p-3 cursor-pointer transition ${index === selectedIndex ? 'bg-[var(--surface-3)]' : 'hover:bg-[var(--surface-hover)]/70'
                                        }`}
                                >
                                    {item.posterPath ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                                            alt={item.title}
                                            className="w-10 h-14 object-cover rounded"
                                        />
                                    ) : (
                                        <div className="w-10 h-14 bg-[var(--border-default)] rounded flex items-center justify-center">
                                            {item.type === 'movie' ? <Film className="w-4 h-4 text-[var(--text-muted)]" /> : <Tv className="w-4 h-4 text-[var(--text-muted)]" />}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-[var(--text-primary)] text-sm truncate">{item.title}</h4>
                                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                            <span className="uppercase">{item.type}</span>
                                            <span>•</span>
                                            <span>{item.year || (item.firstAirDate?.substring(0, 4) || 'N/A')}</span>
                                        </div>
                                    </div>
                                    <Play className="w-4 h-4 text-[var(--text-muted)]" />
                                </div>
                            ))}
                        </>
                    )}

                    {/* Online results */}
                    {onlineResults.length > 0 && (
                        <>
                            <div className="px-3 py-1.5 bg-[var(--surface-3)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5 border-t border-[var(--border-subtle)]">
                                <Globe className="w-3 h-3" /> Online — Watch, Download, or Save
                            </div>
                            {onlineResults.map((item, i) => {
                                const globalIndex = localResults.length + i;
                                return (
                                    <div
                                        key={`online-${item.mediaType}-${item.tmdbId}`}
                                        onClick={() => handleSelectOnline(item)}
                                        className={`flex items-center gap-3 p-3 cursor-pointer transition ${globalIndex === selectedIndex ? 'bg-[var(--surface-3)]' : 'hover:bg-[var(--surface-hover)]/70'
                                            }`}
                                    >
                                        {item.posterPath ? (
                                            <img
                                                src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                                                alt={item.title}
                                                className="w-10 h-14 object-cover rounded"
                                            />
                                        ) : (
                                            <div className="w-10 h-14 bg-[var(--border-default)] rounded flex items-center justify-center">
                                                {item.mediaType === 'movie' ? <Film className="w-4 h-4 text-[var(--text-muted)]" /> : <Tv className="w-4 h-4 text-[var(--text-muted)]" />}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-[var(--text-primary)] text-sm truncate">{item.title}</h4>
                                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                                <span className="px-1 py-0.5 bg-white/15 text-[var(--text-primary)] rounded text-[9px] font-bold uppercase">{item.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
                                                <span>{item.year || 'N/A'}</span>
                                                {item.rating != null && item.rating > 0 && (
                                                    <span className="text-yellow-400 flex items-center gap-0.5">
                                                        <Star className="w-2.5 h-2.5 fill-yellow-400" />
                                                        {item.rating.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] font-medium shrink-0">
                                            <Globe className="w-3 h-3" /> View
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {loading && (
                        <div className="p-3 text-center text-neutral-500 text-xs flex items-center justify-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                        </div>
                    )}
                </div>
            )}

            {/* No results */}
            {isOpen && query.length >= 2 && !loading && !hasResults && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-xl p-4 text-center text-[var(--text-secondary)] text-sm">
                    No results found for &quot;{query}&quot;
                </div>
            )}
        </div>
    );
}
