'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Check, X, Trash2, Star, Film, Tv, Loader2, Bookmark, Calendar, Clock, Download, Play } from 'lucide-react';
import DownloadModal from './DownloadModal';
import TrailerModal from './TrailerModal';

type WatchlistItem = {
    id: number;
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    rating: number | null;
    year: string | null;
    genres: string | null;
    addedAt: string;
    notes: string | null;
};

type TMDBResult = {
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
    libraryTmdbIds?: number[];
};

export default function WatchlistPage({ libraryTmdbIds = [] }: Props) {
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchType, setSearchType] = useState<'multi' | 'movie' | 'tv'>('multi');
    const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [downloadItem, setDownloadItem] = useState<WatchlistItem | null>(null);
    const [trailerItem, setTrailerItem] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string } | null>(null);

    // Fetch watchlist on mount
    useEffect(() => {
        fetchWatchlist();
    }, []);

    const fetchWatchlist = async () => {
        try {
            const res = await fetch('/api/watchlist');
            const data = await res.json();
            setWatchlist(data.items || []);
        } catch (e) {
            console.error('Failed to load watchlist', e);
        } finally {
            setLoading(false);
        }
    };

    // Debounced TMDB search
    const searchTMDB = useCallback(async (query: string, type: string) => {
        if (query.trim().length < 2) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        try {
            const res = await fetch(`/api/tmdb-search?q=${encodeURIComponent(query)}&type=${type}`);
            const data = await res.json();
            setSearchResults(data.results || []);
        } catch (e) {
            console.error('TMDB search failed', e);
        } finally {
            setSearching(false);
        }
    }, []);

    // Handle search input change with debounce
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            searchTMDB(value, searchType);
        }, 400);
    };

    // Handle type filter change
    const handleTypeChange = (type: 'multi' | 'movie' | 'tv') => {
        setSearchType(type);
        if (searchQuery.trim().length >= 2) {
            searchTMDB(searchQuery, type);
        }
    };

    // Add to watchlist
    const addToWatchlist = async (result: TMDBResult) => {
        setAddingIds(prev => new Set(prev).add(result.tmdbId));
        try {
            const res = await fetch('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result)
            });
            const data = await res.json();
            if (data.success || data.alreadyExists) {
                await fetchWatchlist();
            }
        } catch (e) {
            console.error('Failed to add to watchlist', e);
        } finally {
            setAddingIds(prev => {
                const next = new Set(prev);
                next.delete(result.tmdbId);
                return next;
            });
        }
    };

    // Remove from watchlist
    const removeFromWatchlist = async (id: number) => {
        try {
            await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' });
            setWatchlist(prev => prev.filter(item => item.id !== id));
        } catch (e) {
            console.error('Failed to remove from watchlist', e);
        }
    };

    // Check if item is in watchlist
    const isInWatchlist = (tmdbId: number) => watchlist.some(w => w.tmdbId === tmdbId);

    // Check if item is in library
    const isInLibrary = (tmdbId: number) => libraryTmdbIds.includes(tmdbId);

    // Format date
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className="pt-24 px-6 md:px-12 pb-20">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <Bookmark className="w-8 h-8 text-amber-500" />
                    <h1 className="text-3xl font-bold">My Watchlist</h1>
                </div>
                <p className="text-neutral-400 text-sm">Search TMDB for movies & shows you want to watch. Save them here so you can download and add to your library later.</p>
            </div>

            {/* Search Section */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search movies & shows on TMDB..."
                            className="w-full bg-black border border-neutral-700 rounded-xl pl-12 pr-10 py-3.5 outline-none focus:border-amber-500 transition text-sm"
                            autoFocus
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-800 rounded-full transition"
                            >
                                <X className="w-4 h-4 text-neutral-500" />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-1 bg-black border border-neutral-700 rounded-xl p-1">
                        {(['multi', 'movie', 'tv'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => handleTypeChange(type)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${searchType === type
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                                    }`}
                            >
                                {type === 'multi' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search Results */}
                {searching && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                        <span className="ml-3 text-neutral-400">Searching TMDB...</span>
                    </div>
                )}

                {!searching && searchResults.length > 0 && (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {searchResults.map((result) => {
                            const inWatchlist = isInWatchlist(result.tmdbId);
                            const inLibrary = isInLibrary(result.tmdbId);
                            return (
                                <div
                                    key={`${result.mediaType}-${result.tmdbId}`}
                                    className="flex gap-4 p-3 bg-neutral-800/50 hover:bg-neutral-800 rounded-xl transition group"
                                >
                                    {/* Poster */}
                                    <div className="w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-neutral-700">
                                        {result.posterPath ? (
                                            <img
                                                src={`https://image.tmdb.org/t/p/w92${result.posterPath}`}
                                                alt={result.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                {result.mediaType === 'movie' ? <Film className="w-6 h-6 text-neutral-500" /> : <Tv className="w-6 h-6 text-neutral-500" />}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold truncate">{result.title}</h3>
                                            <span className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px] uppercase tracking-wide text-neutral-400 flex-shrink-0">
                                                {result.mediaType === 'movie' ? 'Movie' : 'TV'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-neutral-400 mb-1">
                                            {result.year && <span>{result.year}</span>}
                                            {result.rating != null && result.rating > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                                    {result.rating.toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                        {result.overview && (
                                            <p className="text-xs text-neutral-500 line-clamp-2">{result.overview}</p>
                                        )}
                                    </div>

                                    {/* Action */}
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => setTrailerItem({ tmdbId: result.tmdbId, mediaType: result.mediaType, title: result.title })}
                                            className="p-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-lg transition"
                                            title="Watch Trailer"
                                        >
                                            <Play className="w-3.5 h-3.5" />
                                        </button>
                                        {inLibrary ? (
                                            <span className="px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium">
                                                In Library
                                            </span>
                                        ) : inWatchlist ? (
                                            <span className="px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center gap-1">
                                                <Check className="w-3.5 h-3.5" />
                                                Added
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => addToWatchlist(result)}
                                                disabled={addingIds.has(result.tmdbId)}
                                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-neutral-600 text-black font-semibold rounded-lg text-xs flex items-center gap-1 transition"
                                            >
                                                {addingIds.has(result.tmdbId) ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Plus className="w-3.5 h-3.5" />
                                                )}
                                                Add
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                    <div className="text-center py-8">
                        <p className="text-neutral-500">No results found for &quot;{searchQuery}&quot;</p>
                    </div>
                )}

                {!searching && searchQuery.length === 0 && (
                    <div className="text-center py-6">
                        <Search className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                        <p className="text-neutral-500 text-sm">Start typing to search TMDB for movies and TV shows</p>
                    </div>
                )}
            </div>

            {/* Watchlist Grid */}
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-amber-500" />
                    Saved ({watchlist.length})
                </h2>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                </div>
            ) : watchlist.length === 0 ? (
                <div className="text-center py-16 bg-neutral-900/50 border border-neutral-800 rounded-2xl">
                    <Bookmark className="w-16 h-16 text-neutral-700 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-neutral-400 mb-2">Your watchlist is empty</h3>
                    <p className="text-neutral-500 text-sm max-w-md mx-auto">
                        Search for movies and TV shows above, then add them to your watchlist. You can download them later and add to your library.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
                    {watchlist.map((item) => {
                        const inLibrary = isInLibrary(item.tmdbId);
                        return (
                            <div
                                key={item.id}
                                className="group relative bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800 hover:border-neutral-600 transition-all hover:scale-[1.02] hover:shadow-2xl"
                            >
                                {/* Poster */}
                                <div className="aspect-[2/3] bg-neutral-800 relative">
                                    {item.posterPath ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            {item.mediaType === 'movie' ? <Film className="w-12 h-12 text-neutral-600" /> : <Tv className="w-12 h-12 text-neutral-600" />}
                                        </div>
                                    )}

                                    {/* Overlay on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                        {item.overview && (
                                            <p className="text-[11px] text-neutral-300 line-clamp-3 mb-2">{item.overview}</p>
                                        )}
                                        <div className="flex gap-1.5 w-full">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setTrailerItem(item); }}
                                                className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition"
                                            >
                                                <Play className="w-3.5 h-3.5" />
                                                Trailer
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDownloadItem(item); }}
                                                className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                Download
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.id); }}
                                                className="py-1.5 px-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg flex items-center justify-center transition"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Badges */}
                                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                                        <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] uppercase tracking-wide text-neutral-300 font-medium">
                                            {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                                        </span>
                                        {inLibrary && (
                                            <span className="px-1.5 py-0.5 bg-green-500/80 backdrop-blur rounded text-[10px] text-black font-bold">
                                                IN LIBRARY
                                            </span>
                                        )}
                                    </div>

                                    {/* Rating badge */}
                                    {item.rating != null && item.rating > 0 && (
                                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                                            {item.rating.toFixed(1)}
                                        </div>
                                    )}
                                </div>

                                {/* Title */}
                                <div className="p-2.5">
                                    <h3 className="font-medium text-sm truncate" title={item.title}>{item.title}</h3>
                                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-0.5">
                                        {item.year && <span>{item.year}</span>}
                                        <span className="flex items-center gap-0.5">
                                            <Clock className="w-3 h-3" />
                                            {formatDate(item.addedAt)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Download Modal */}
            <DownloadModal
                isOpen={downloadItem !== null}
                title={downloadItem?.title || ''}
                year={downloadItem?.year}
                mediaType={downloadItem?.mediaType || 'movie'}
                posterPath={downloadItem?.posterPath}
                watchlistId={downloadItem?.id}
                onClose={() => setDownloadItem(null)}
            />

            {/* Trailer Modal */}
            <TrailerModal
                isOpen={trailerItem !== null}
                tmdbId={trailerItem?.tmdbId || 0}
                mediaType={trailerItem?.mediaType || 'movie'}
                title={trailerItem?.title || ''}
                onClose={() => setTrailerItem(null)}
            />
        </div>
    );
}
