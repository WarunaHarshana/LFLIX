'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Film, Tv, Play } from 'lucide-react';

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

type Props = {
    onPlay: (filePath: string) => void;
    onOpenShow: (show: SearchResult) => void;
    onClose?: () => void;
};

export default function SearchBar({ onPlay, onOpenShow, onClose }: Props) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const search = useCallback(async (searchQuery: string, signal?: AbortSignal) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, { signal });
            const data = await res.json();
            setResults(Array.isArray(data) ? data : []);
            setSelectedIndex(0);
        } catch (e) {
            // Ignore abort errors
            if (e instanceof Error && e.name === 'AbortError') return;
            setResults([]);
        } finally {
            setLoading(false);
        }
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
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault();
            handleSelect(results[selectedIndex]);
        } else if (e.key === 'Escape') {
            handleClose();
        }
    };

    const handleSelect = (item: SearchResult) => {
        if (item.type === 'movie' && item.filePath) {
            onPlay(item.filePath);
        } else if (item.type === 'show') {
            onOpenShow(item);
        }
        handleClose();
    };

    const handleClose = () => {
        setQuery('');
        setResults([]);
        setIsOpen(false);
        onClose?.();
    };

    return (
        <div className="relative">
            <div className={`flex items-center transition-all duration-300 ${isOpen ? 'w-72' : 'w-10'}`}>
                <button
                    onClick={() => {
                        setIsOpen(true);
                        setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                    className="p-2 hover:bg-white/10 rounded-full transition"
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
                        placeholder="Search movies, shows..."
                        className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2 text-sm outline-none focus:border-red-600 transition"
                        autoFocus
                    />
                )}

                {isOpen && (
                    <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Search Results Dropdown */}
            {isOpen && results.length > 0 && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-50">
                    {loading && (
                        <div className="p-4 text-center text-neutral-400 text-sm">Searching...</div>
                    )}

                    {results.map((item, index) => (
                        <div
                            key={`${item.type}-${item.id}`}
                            onClick={() => handleSelect(item)}
                            className={`flex items-center gap-3 p-3 cursor-pointer transition ${index === selectedIndex ? 'bg-neutral-800' : 'hover:bg-neutral-800/50'
                                }`}
                        >
                            {item.posterPath ? (
                                <img
                                    src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                                    alt={item.title}
                                    className="w-10 h-14 object-cover rounded"
                                />
                            ) : (
                                <div className="w-10 h-14 bg-neutral-700 rounded flex items-center justify-center">
                                    {item.type === 'movie' ? <Film className="w-4 h-4 text-neutral-500" /> : <Tv className="w-4 h-4 text-neutral-500" />}
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-white text-sm truncate">{item.title}</h4>
                                <div className="flex items-center gap-2 text-xs text-neutral-400">
                                    <span className="uppercase">{item.type}</span>
                                    <span>•</span>
                                    <span>{item.year || (item.firstAirDate?.substring(0, 4) || 'N/A')}</span>
                                    {item.rating && (
                                        <>
                                            <span>•</span>
                                            <span className="text-green-400">{Math.round(item.rating * 10)}%</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <Play className="w-4 h-4 text-neutral-500" />
                        </div>
                    ))}
                </div>
            )}

            {/* No results */}
            {isOpen && query.length >= 2 && !loading && results.length === 0 && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-center text-neutral-400 text-sm">
                    No results found for "{query}"
                </div>
            )}
        </div>
    );
}
