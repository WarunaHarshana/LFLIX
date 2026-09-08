'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Check, X, Trash2, Star, Film, Tv, Loader2, Bookmark, Clock, Download, Play, Globe, Sparkles } from 'lucide-react';
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
    imdbRating?: number | null;
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
    imdbRating?: number | null;
    year: string | null;
    popularity: number;
};

type Props = {
    libraryTmdbIds?: number[];
    onOpenOnline?: (item: TMDBResult) => void;
};

// Movie availability info from the tracking API
type MovieAvailability = {
    tmdbId: number;
    isAvailable: number | null;
    bestResult: string | null;
};

export default function WatchlistPage({ libraryTmdbIds = [], onOpenOnline }: Props) {
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
    const [availability, setAvailability] = useState<Map<number, MovieAvailability>>(new Map());
    const [savedTab, setSavedTab] = useState<'all' | 'movie' | 'tv' | 'available'>('all');

    // Fetch watchlist on mount
    useEffect(() => {
        fetchWatchlist();
        fetchAvailability();
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

    // Fetch movie availability data
    const fetchAvailability = async () => {
        try {
            const res = await fetch('/api/watchlist/track');
            const data = await res.json();
            const map = new Map<number, MovieAvailability>();
            for (const item of (data.items || [])) {
                map.set(item.tmdbId, item);
            }
            setAvailability(map);
        } catch (e) {
            console.error('Failed to load availability', e);
        }
    };

    // Check if a movie is available for download
    const isMovieAvailable = (tmdbId: number) => {
        const info = availability.get(tmdbId);
        return info?.isAvailable === 1;
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

    const openWatchlistItemOnline = (item: WatchlistItem) => {
        if (!onOpenOnline) return;
        onOpenOnline({
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
            title: item.title,
            posterPath: item.posterPath,
            backdropPath: item.backdropPath,
            overview: item.overview,
            rating: item.rating,
            imdbRating: item.imdbRating,
            year: item.year,
            popularity: 0,
        });
    };

    // Format date
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const movieCount = watchlist.filter(w => w.mediaType === 'movie').length;
    const tvCount = watchlist.filter(w => w.mediaType === 'tv').length;
    const availableCount = watchlist.filter(w => w.mediaType === 'movie' && isMovieAvailable(w.tmdbId) && !isInLibrary(w.tmdbId)).length;

    const filteredWatchlist = watchlist.filter(item => {
        if (savedTab === 'movie') return item.mediaType === 'movie';
        if (savedTab === 'tv') return item.mediaType === 'tv';
        if (savedTab === 'available') return item.mediaType === 'movie' && isMovieAvailable(item.tmdbId) && !isInLibrary(item.tmdbId);
        return true;
    });

    return (
        <div className="pt-24 px-4 md:px-12 pb-20 w-full">
            {/* Sleek Integrated Header */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-lg flex-shrink-0">
                        <Bookmark className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">My Watchlist</h1>
                            <span className="liquid-glass-pill px-2.5 py-0.5 text-xs rounded-full font-bold text-neutral-300 border border-white/15">
                                {watchlist.length}
                            </span>
                        </div>
                        <p className="text-neutral-400 text-xs sm:text-sm mt-0.5">
                            Save upcoming releases to stream online or auto-track for downloads.
                        </p>
                    </div>
                </div>

                {availableCount > 0 && (
                    <button
                        onClick={() => setSavedTab('available')}
                        className="self-start md:self-auto inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 rounded-2xl text-xs font-semibold text-emerald-300 transition-all cursor-pointer shadow-sm"
                    >
                        <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                        <span>{availableCount} title{availableCount > 1 ? 's' : ''} ready to download</span>
                    </button>
                )}
            </div>

            {/* Compact Search Bar & Floating Results */}
            <div className="liquid-glass-base border border-white/15 rounded-2xl p-2.5 sm:p-3 mb-8 shadow-xl relative transition-all duration-300">
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                    <div className="relative flex-1 flex items-center">
                        <Search className="absolute left-3.5 w-4.5 h-4.5 text-neutral-400 pointer-events-none" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search TMDB to add movies & shows..."
                            className="w-full bg-white/[0.04] border border-white/10 focus:border-white/30 focus:bg-white/[0.07] rounded-xl pl-11 pr-10 py-2.5 outline-none transition text-sm text-white placeholder:text-neutral-500 shadow-inner"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                                className="absolute right-2.5 p-1.5 hover:bg-white/10 rounded-lg transition text-neutral-400 hover:text-white"
                                title="Clear search"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-1.5 p-1 bg-white/[0.04] border border-white/10 rounded-xl flex-shrink-0 self-start md:self-center">
                        {(['multi', 'movie', 'tv'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => handleTypeChange(type)}
                                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer min-h-[38px] ${searchType === type
                                    ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                    : 'text-neutral-300 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                {type === 'multi' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search Results Expander: ONLY appears when query typed or searching */}
                {(searching || searchQuery.trim().length >= 2) && (
                    <div className="border-t border-white/10 mt-3 pt-3">
                        <div className="flex items-center justify-between px-1 mb-2.5">
                            <span className="text-xs font-semibold text-neutral-300">
                                {searching ? 'Searching TMDB...' : `Results for "${searchQuery}" (${searchResults.length})`}
                            </span>
                            <button
                                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                                className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition px-2 py-0.5 rounded-lg hover:bg-white/10 cursor-pointer"
                            >
                                <X className="w-3 h-3" /> Dismiss
                            </button>
                        </div>

                        {searching && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                                <span className="ml-2.5 text-neutral-300 text-xs">Finding matches on TMDB...</span>
                            </div>
                        )}

                        {!searching && searchResults.length > 0 && (
                            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1.5 custom-scrollbar">
                                {searchResults.map((result) => {
                                    const inWatchlist = isInWatchlist(result.tmdbId);
                                    const inLibrary = isInLibrary(result.tmdbId);
                                    return (
                                        <div
                                            key={`${result.mediaType}-${result.tmdbId}`}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 liquid-glass-base border border-white/10 hover:border-white/25 rounded-xl transition group"
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                {/* Poster */}
                                                <div className="w-12 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10 shadow-sm">
                                                    {result.posterPath ? (
                                                        <img
                                                            src={`https://image.tmdb.org/t/p/w92${result.posterPath}`}
                                                            alt={result.title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            {result.mediaType === 'movie' ? <Film className="w-5 h-5 text-neutral-500" /> : <Tv className="w-5 h-5 text-neutral-500" />}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Info */}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <h3 className="font-semibold text-white truncate text-sm">{result.title}</h3>
                                                        <span className="px-1.5 py-0.5 liquid-glass-pill rounded text-[9px] uppercase tracking-wide text-neutral-300 flex-shrink-0 font-medium">
                                                            {result.mediaType === 'movie' ? 'Movie' : 'TV'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-neutral-400 mb-1">
                                                        {result.year && <span>{result.year}</span>}
                                                        {result.rating != null && result.rating > 0 && (
                                                            <span className="flex items-center gap-1 text-amber-300 font-medium text-[11px]">
                                                                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                                                {result.rating.toFixed(1)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {result.overview && (
                                                        <p className="text-xs text-neutral-400 line-clamp-1 leading-relaxed">{result.overview}</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                                                <button
                                                    aria-label="Open Details"
                                                    onClick={() => onOpenOnline?.(result)}
                                                    className="p-2.5 liquid-glass-pill hover:bg-white/20 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer"
                                                    title="Open Details"
                                                >
                                                    <Globe className="w-4 h-4" />
                                                </button>
                                                <button
                                                    aria-label="Watch Trailer"
                                                    onClick={() => setTrailerItem({ tmdbId: result.tmdbId, mediaType: result.mediaType, title: result.title })}
                                                    className="p-2.5 liquid-glass-pill hover:bg-white/20 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer"
                                                    title="Watch Trailer"
                                                >
                                                    <Play className="w-4 h-4" />
                                                </button>
                                                {inLibrary ? (
                                                    <span className="px-3 py-1.5 bg-green-500/15 text-green-300 border border-green-500/30 rounded-xl text-xs font-semibold shadow-sm">
                                                        In Library
                                                    </span>
                                                ) : inWatchlist ? (
                                                    <span className="px-3 py-1.5 liquid-glass-pill text-white border border-white/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                                                        <Check className="w-3.5 h-3.5 text-green-400" />
                                                        Added
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => addToWatchlist(result)}
                                                        disabled={addingIds.has(result.tmdbId)}
                                                        className="px-3.5 py-1.5 liquid-btn-primary disabled:opacity-50 text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-md hover:scale-105 active:scale-95 cursor-pointer"
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

                        {!searching && searchResults.length === 0 && (
                            <div className="text-center py-6 text-neutral-400 text-xs">
                                No TMDB results found for &quot;{searchQuery}&quot;
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Saved Titles Section Controls */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        <span>Saved Titles</span>
                    </h2>
                    <span className="liquid-glass-pill px-2.5 py-0.5 text-xs rounded-full font-bold text-neutral-300 border border-white/15">
                        {filteredWatchlist.length}
                    </span>
                </div>

                {/* Filter Tabs for Saved Items */}
                {watchlist.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                        <button
                            onClick={() => setSavedTab('all')}
                            className={`px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition cursor-pointer min-h-[42px] sm:min-h-[44px] ${savedTab === 'all'
                                ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                }`}
                        >
                            All ({watchlist.length})
                        </button>
                        {movieCount > 0 && (
                            <button
                                onClick={() => setSavedTab('movie')}
                                className={`px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition cursor-pointer min-h-[42px] sm:min-h-[44px] ${savedTab === 'movie'
                                    ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                    : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                    }`}
                            >
                                Movies ({movieCount})
                            </button>
                        )}
                        {tvCount > 0 && (
                            <button
                                onClick={() => setSavedTab('tv')}
                                className={`px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition cursor-pointer min-h-[42px] sm:min-h-[44px] ${savedTab === 'tv'
                                    ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                    : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                    }`}
                            >
                                TV Shows ({tvCount})
                            </button>
                        )}
                        {availableCount > 0 && (
                            <button
                                onClick={() => setSavedTab('available')}
                                className={`px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition flex items-center gap-2 cursor-pointer min-h-[42px] sm:min-h-[44px] ${savedTab === 'available'
                                    ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                    : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                    }`}
                            >
                                <Sparkles className="w-4 h-4 text-emerald-400" />
                                <span>Available ({availableCount})</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-white/50" />
                </div>
            ) : watchlist.length === 0 ? (
                <div className="text-center py-16 liquid-glass-base border border-white/10 rounded-3xl p-10 max-w-lg mx-auto shadow-2xl">
                    <div className="w-16 h-16 rounded-3xl liquid-glass-pill flex items-center justify-center mx-auto mb-4 border border-white/20">
                        <Bookmark className="w-8 h-8 text-neutral-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Your watchlist is empty</h3>
                    <p className="text-neutral-400 text-sm leading-relaxed">
                        Search for movies and TV shows above, then add them to your watchlist. You can download them later and add them directly to your library.
                    </p>
                </div>
            ) : filteredWatchlist.length === 0 ? (
                <div className="text-center py-14 liquid-glass-base border border-white/10 rounded-2xl p-8 max-w-md mx-auto shadow-xl">
                    <p className="text-neutral-300 text-sm">No saved titles match this filter.</p>
                    <button
                        onClick={() => setSavedTab('all')}
                        className="mt-3 px-4 py-2 liquid-glass-pill hover:bg-white/15 text-xs text-white font-semibold rounded-xl transition cursor-pointer"
                    >
                        Show All Saved Titles
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                    {filteredWatchlist.map((item) => {
                        const inLibrary = isInLibrary(item.tmdbId);
                        const available = item.mediaType === 'movie' && isMovieAvailable(item.tmdbId);
                        const displayRating = item.imdbRating ?? item.rating;
                        return (
                            <div
                                key={item.id}
                                onClick={() => openWatchlistItemOnline(item)}
                                className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.04] hover:z-30 liquid-card liquid-sheen-effect shadow-md hover:shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_24px_rgba(255,255,255,0.12)] border ${
                                    available && !inLibrary
                                        ? 'border-emerald-500/40 shadow-emerald-500/10 hover:border-emerald-400/80 hover:shadow-emerald-500/20'
                                        : 'border-white/10 hover:border-white/30'
                                }`}
                            >
                                {/* Poster */}
                                <div className="aspect-[2/3] bg-white/5 relative overflow-hidden">
                                    {item.posterPath ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                                            alt={item.title}
                                            className="w-full h-full object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-95"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            {item.mediaType === 'movie' ? <Film className="w-12 h-12 text-neutral-500" /> : <Tv className="w-12 h-12 text-neutral-500" />}
                                        </div>
                                    )}

                                    {/* Overlay on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3.5 backdrop-blur-[2px] z-10">
                                        {item.overview && (
                                            <p className="text-[11px] text-neutral-200 line-clamp-3 mb-3 leading-relaxed drop-shadow">{item.overview}</p>
                                        )}
                                        {/* Action buttons: Stacked for 100% spacing safety */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDownloadItem(item); }}
                                            className="w-full py-2.5 liquid-btn-primary text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-lg mb-2 cursor-pointer transition active:scale-95"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Download
                                        </button>
                                        <div className="flex gap-2 w-full">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setTrailerItem(item); }}
                                                className="flex-1 py-2 liquid-btn-secondary text-xs font-medium rounded-xl flex items-center justify-center gap-1 cursor-pointer hover:scale-105 active:scale-95 transition"
                                            >
                                                <Play className="w-3.5 h-3.5" />
                                                Trailer
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.id); }}
                                                className="p-2 bg-red-500/20 hover:bg-red-500/35 text-red-300 border border-red-500/30 rounded-xl flex items-center justify-center transition cursor-pointer hover:scale-105 active:scale-95"
                                                title="Remove from Watchlist"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Badges */}
                                    <div className="!absolute top-2.5 left-2.5 z-20 flex flex-col gap-1 pointer-events-none select-none max-w-[60%]">
                                        <span className="px-2 py-0.5 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg text-[10px] uppercase tracking-wide text-white font-semibold shadow-md w-fit">
                                            {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                                        </span>
                                        {inLibrary && (
                                            <span className="px-2 py-0.5 bg-green-500/30 backdrop-blur-md border border-green-500/40 rounded-lg text-[10px] text-green-300 font-bold shadow-md w-fit">
                                                In Library
                                            </span>
                                        )}
                                        {available && !inLibrary && (
                                            <span className="px-2 py-0.5 bg-emerald-500/35 backdrop-blur-md border border-emerald-500/40 rounded-lg text-[10px] text-emerald-300 font-bold flex items-center gap-1 animate-pulse shadow-md w-fit">
                                                <Sparkles className="w-2.5 h-2.5" />
                                                Available
                                            </span>
                                        )}
                                    </div>

                                    {/* Rating badge */}
                                    {displayRating != null && displayRating > 0 && (
                                        <div className="!absolute top-2.5 right-2.5 z-20 inline-flex items-center gap-1 px-2 py-0.5 bg-black/80 backdrop-blur-md border border-amber-400/35 rounded-lg text-[10px] text-amber-300 font-bold shadow-md pointer-events-none select-none w-fit">
                                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                            <span>{displayRating.toFixed(1)}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Title */}
                                <div className="p-3.5">
                                    <h3 className="font-semibold text-white text-sm truncate" title={item.title}>{item.title}</h3>
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-400 mt-1">
                                        <span>{item.year || '—'}</span>
                                        <span className="flex items-center gap-1 text-neutral-400 truncate">
                                            <Clock className="w-3 h-3 text-neutral-400 flex-shrink-0" />
                                            <span className="truncate">{formatDate(item.addedAt)}</span>
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
                tmdbId={downloadItem?.tmdbId}
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
