'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Search,
    Plus,
    Check,
    X,
    Trash2,
    Star,
    Film,
    Tv,
    Loader2,
    Bookmark,
    Clock,
    Download,
    Play,
    Globe,
    Sparkles,
    LayoutGrid,
    LayoutList,
    ArrowUpDown,
    RotateCw,
    Undo2,
    ChevronDown,
    CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import DownloadModal from './DownloadModal';
import TrailerModal from './TrailerModal';
import { triggerHaptic } from '@/lib/haptics';

export type WatchlistItem = {
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

export type TMDBResult = {
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

type MovieAvailability = {
    tmdbId: number;
    isAvailable: number | null;
    bestResult: string | null;
    lastCheckedAt?: string | null;
};

type TabFilter = 'all' | 'movie' | 'tv' | 'available' | 'library';
type SortOption = 'recent' | 'rating' | 'year' | 'title';
type ViewMode = 'grid' | 'list';

const QUICK_SUGGESTIONS = [
    { title: 'Severance', type: 'tv' as const },
    { title: 'Dune: Part Two', type: 'movie' as const },
    { title: 'Arcane', type: 'tv' as const },
    { title: 'Oppenheimer', type: 'movie' as const },
    { title: 'The Bear', type: 'tv' as const },
    { title: 'Interstellar', type: 'movie' as const },
];

export default function WatchlistPage({ libraryTmdbIds = [], onOpenOnline }: Props) {
    const shouldReduceMotion = useReducedMotion();
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchType, setSearchType] = useState<'multi' | 'movie' | 'tv'>('multi');
    const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
    const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

    // Filter, Sort, and View Controls
    const [savedTab, setSavedTab] = useState<TabFilter>('all');
    const [savedQuery, setSavedQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('recent');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [showSortMenu, setShowSortMenu] = useState(false);

    // Modals & Availability
    const [downloadItem, setDownloadItem] = useState<WatchlistItem | null>(null);
    const [trailerItem, setTrailerItem] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string } | null>(null);
    const [availability, setAvailability] = useState<Map<number, MovieAvailability>>(new Map());
    const [refreshingAvailability, setRefreshingAvailability] = useState(false);

    // Agency & Forgiveness: Undo Deletion State
    const [deletedUndoItem, setDeletedUndoItem] = useState<{ item: WatchlistItem; timer: NodeJS.Timeout } | null>(null);

    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);

    // Fetch watchlist & availability on mount
    useEffect(() => {
        fetchWatchlist();
        fetchAvailability();
    }, []);

    // Global keyboard shortcuts: "/" to focus search, "Escape" to dismiss
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement !== searchInputRef.current) {
                const targetTag = (document.activeElement?.tagName || '').toLowerCase();
                if (targetTag !== 'input' && targetTag !== 'textarea') {
                    e.preventDefault();
                    searchInputRef.current?.focus();
                }
            } else if (e.key === 'Escape') {
                if (showSortMenu) {
                    setShowSortMenu(false);
                } else if (searchQuery) {
                    setSearchQuery('');
                    setSearchResults([]);
                    searchInputRef.current?.blur();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSortMenu, searchQuery]);

    // Close sort menu on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
                setShowSortMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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

    const fetchAvailability = async () => {
        setRefreshingAvailability(true);
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
        } finally {
            setRefreshingAvailability(false);
        }
    };

    const isMovieAvailable = useCallback((tmdbId: number) => {
        const info = availability.get(tmdbId);
        return info?.isAvailable === 1;
    }, [availability]);

    const isInWatchlist = useCallback((tmdbId: number) => {
        return watchlist.some(w => w.tmdbId === tmdbId);
    }, [watchlist]);

    const isInLibrary = useCallback((tmdbId: number) => {
        return libraryTmdbIds.includes(tmdbId);
    }, [libraryTmdbIds]);

    // TMDB Search with debounce
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

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            searchTMDB(value, searchType);
        }, 320);
    };

    const handleTypeChange = (type: 'multi' | 'movie' | 'tv') => {
        triggerHaptic('selection');
        setSearchType(type);
        if (searchQuery.trim().length >= 2) {
            searchTMDB(searchQuery, type);
        }
    };

    // Add to Watchlist with spring micro-interaction
    const addToWatchlist = async (result: TMDBResult) => {
        triggerHaptic('light');
        setAddingIds(prev => new Set(prev).add(result.tmdbId));
        try {
            const res = await fetch('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result)
            });
            const data = await res.json();
            if (data.success || data.alreadyExists) {
                triggerHaptic('success');
                setAddedIds(prev => new Set(prev).add(result.tmdbId));
                setTimeout(() => {
                    setAddedIds(prev => {
                        const next = new Set(prev);
                        next.delete(result.tmdbId);
                        return next;
                    });
                }, 2500);
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

    // Agency & Forgiveness: Soft Delete with Undo Window
    const initiateRemove = (item: WatchlistItem) => {
        triggerHaptic('medium');

        if (deletedUndoItem) {
            clearTimeout(deletedUndoItem.timer);
            void executeDelete(deletedUndoItem.item.id);
        }

        setWatchlist(prev => prev.filter(w => w.id !== item.id));

        const timer = setTimeout(() => {
            void executeDelete(item.id);
            setDeletedUndoItem(null);
        }, 5000);

        setDeletedUndoItem({ item, timer });
    };

    const handleUndoDelete = () => {
        if (!deletedUndoItem) return;
        triggerHaptic('success');
        clearTimeout(deletedUndoItem.timer);
        setWatchlist(prev => [deletedUndoItem.item, ...prev]);
        setDeletedUndoItem(null);
    };

    const executeDelete = async (id: number) => {
        try {
            await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' });
        } catch (e) {
            console.error('Failed to permanently delete item', e);
            await fetchWatchlist();
        }
    };

    const openWatchlistItemOnline = (item: WatchlistItem | TMDBResult) => {
        triggerHaptic('light');
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

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    // Filter and Sort Calculations
    const movieCount = watchlist.filter(w => w.mediaType === 'movie').length;
    const tvCount = watchlist.filter(w => w.mediaType === 'tv').length;
    const availableCount = watchlist.filter(w => w.mediaType === 'movie' && isMovieAvailable(w.tmdbId) && !isInLibrary(w.tmdbId)).length;
    const libraryCount = watchlist.filter(w => isInLibrary(w.tmdbId)).length;

    const filteredWatchlist = useMemo(() => {
        let list = watchlist.filter(item => {
            if (savedTab === 'movie') return item.mediaType === 'movie';
            if (savedTab === 'tv') return item.mediaType === 'tv';
            if (savedTab === 'available') return item.mediaType === 'movie' && isMovieAvailable(item.tmdbId) && !isInLibrary(item.tmdbId);
            if (savedTab === 'library') return isInLibrary(item.tmdbId);
            return true;
        });

        if (savedQuery.trim()) {
            const q = savedQuery.toLowerCase().trim();
            list = list.filter(item =>
                item.title.toLowerCase().includes(q) ||
                (item.genres && item.genres.toLowerCase().includes(q)) ||
                (item.year && item.year.includes(q))
            );
        }

        return [...list].sort((a, b) => {
            if (sortBy === 'rating') {
                const rA = a.imdbRating ?? a.rating ?? 0;
                const rB = b.imdbRating ?? b.rating ?? 0;
                return rB - rA;
            }
            if (sortBy === 'year') {
                const yA = parseInt(a.year || '0', 10);
                const yB = parseInt(b.year || '0', 10);
                return yB - yA;
            }
            if (sortBy === 'title') {
                return a.title.localeCompare(b.title);
            }
            return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
        });
    }, [watchlist, savedTab, savedQuery, sortBy, isMovieAvailable, isInLibrary]);

    const sortLabels: Record<SortOption, string> = {
        recent: 'Recently Added',
        rating: 'Highest Rated',
        year: 'Release Year',
        title: 'Title (A–Z)',
    };

    return (
        <div className="pt-24 sm:pt-28 px-4 sm:px-6 md:px-10 lg:px-14 pb-28 w-full max-w-[1800px] mx-auto relative select-none">
            {/* Ambient Background Glow for Refined Glass Refraction */}
            <div className="fixed top-20 left-1/4 w-[32rem] h-[32rem] bg-amber-500/10 rounded-full ambient-glow-aura" />
            <div className="fixed top-48 right-1/4 w-[32rem] h-[32rem] bg-emerald-500/5 rounded-full ambient-glow-aura" />

            {/* Prominent Hero Header */}
            <div className="relative z-10 mb-8 sm:mb-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-center gap-4 sm:gap-5">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl apple-glass-card bg-amber-500/15 border-amber-400/35 flex items-center justify-center shadow-2xl shadow-amber-500/15 flex-shrink-0">
                        <Bookmark className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 fill-amber-400/20" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 sm:gap-4">
                            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-none text-balance">
                                Watchlist
                            </h1>
                            <span className="px-3 py-1 text-sm sm:text-base font-extrabold rounded-full apple-glass-subtle text-neutral-200 border border-white/20 tabular-nums shadow-sm">
                                {watchlist.length}
                            </span>
                        </div>
                        <p className="text-neutral-300 text-sm sm:text-base mt-1.5 font-normal leading-relaxed text-pretty max-w-2xl">
                            Keep track of upcoming releases, stream online, or monitor torrent availability for your library.
                        </p>
                    </div>
                </div>

                {/* Header Action Badges & Refresh */}
                <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
                    {availableCount > 0 && (
                        <button
                            onClick={() => {
                                triggerHaptic('selection');
                                setSavedTab('available');
                            }}
                            className="inline-flex items-center gap-2.5 px-4.5 py-2.5 sm:px-5 sm:py-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/45 rounded-2xl text-sm sm:text-base font-bold text-emerald-200 transition-all cursor-pointer shadow-xl shadow-emerald-500/15 active:scale-95"
                            title="Filter available downloads"
                        >
                            <Sparkles className="w-4.5 h-4.5 text-emerald-400 animate-pulse" />
                            <span>{availableCount} Ready to Download</span>
                        </button>
                    )}

                    <button
                        onClick={() => {
                            triggerHaptic('light');
                            fetchAvailability();
                        }}
                        disabled={refreshingAvailability}
                        className="inline-flex items-center gap-2 px-4 py-2.5 sm:py-3 apple-glass-subtle hover:bg-white/10 border border-white/15 rounded-2xl text-xs sm:text-sm font-bold text-neutral-200 hover:text-white transition-all cursor-pointer active:scale-95 disabled:opacity-50 min-h-[42px]"
                        title="Check movie torrent releases"
                    >
                        <RotateCw className={`w-4 h-4 ${refreshingAvailability ? 'animate-spin text-amber-400' : ''}`} />
                        <span className="hidden sm:inline">Refresh Status</span>
                    </button>
                </div>
            </div>

            {/* Apple Floating Glass Search Bar & Live TMDB Popover */}
            <div className="relative z-20 mb-8 sm:mb-10">
                <div className="apple-glass-panel rounded-2xl sm:rounded-3xl p-3 sm:p-3.5 shadow-2xl transition-all duration-300">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3.5">
                        {/* Search Input Field */}
                        <div className="relative flex-1 flex items-center">
                            <Search className="absolute left-4 w-5 h-5 text-neutral-400 pointer-events-none" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Search TMDB to add movies or shows (Press / to focus)..."
                                className="w-full bg-white/[0.05] border border-white/10 focus:border-white/35 focus:bg-white/[0.08] rounded-xl sm:rounded-2xl pl-12 pr-12 py-3 sm:py-3.5 outline-none transition text-base sm:text-lg text-white placeholder:text-neutral-500 shadow-inner"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => {
                                        triggerHaptic('light');
                                        setSearchQuery('');
                                        setSearchResults([]);
                                    }}
                                    className="absolute right-3 p-2 hover:bg-white/15 rounded-xl transition text-neutral-400 hover:text-white cursor-pointer"
                                    title="Clear search (Esc)"
                                    aria-label="Clear search"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {/* Search Type Segmented Switcher */}
                        <div className="flex gap-1.5 p-1 bg-black/45 border border-white/10 rounded-xl sm:rounded-2xl flex-shrink-0 self-start md:self-center">
                            {(['multi', 'movie', 'tv'] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => handleTypeChange(type)}
                                    className={`relative px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer min-h-[40px] flex items-center justify-center ${
                                        searchType === type
                                            ? 'text-white font-extrabold bg-white/20 border border-white/35 shadow-md backdrop-blur-md'
                                            : 'text-neutral-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {type === 'multi' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Smooth Animated Search Results Popover */}
                    <AnimatePresence>
                        {(searching || searchQuery.trim().length >= 2) && (
                            <motion.div
                                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                className="border-t border-white/10 mt-3 pt-3 overflow-hidden"
                            >
                                <div className="flex items-center justify-between px-1 mb-3">
                                    <span className="text-sm font-bold text-neutral-300 flex items-center gap-2">
                                        {searching ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                                                <span>Searching TMDB...</span>
                                            </>
                                        ) : (
                                            <span>
                                                Results for &ldquo;{searchQuery}&rdquo; ({searchResults.length})
                                            </span>
                                        )}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setSearchQuery('');
                                            setSearchResults([]);
                                        }}
                                        className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 transition px-2.5 py-1 rounded-lg hover:bg-white/10 cursor-pointer font-semibold"
                                    >
                                        <X className="w-3.5 h-3.5" /> Dismiss
                                    </button>
                                </div>

                                {!searching && searchResults.length > 0 && (
                                    <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar mask-fade-bottom">
                                        {searchResults.map((result) => {
                                            const inWatchlist = isInWatchlist(result.tmdbId);
                                            const inLibrary = isInLibrary(result.tmdbId);
                                            const isAddedJustNow = addedIds.has(result.tmdbId);
                                            return (
                                                <div
                                                    key={`${result.mediaType}-${result.tmdbId}`}
                                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-3.5 apple-glass-subtle hover:bg-white/[0.08] border border-white/10 hover:border-white/25 rounded-2xl transition-all duration-200 group"
                                                >
                                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                                        {/* Thumbnail Poster */}
                                                        <div className="w-16 h-22 sm:w-18 sm:h-24 flex-shrink-0 rounded-xl overflow-hidden bg-black/40 border border-white/10 shadow-md">
                                                            {result.posterPath ? (
                                                                <img
                                                                    src={`https://image.tmdb.org/t/p/w185${result.posterPath}`}
                                                                    alt={result.title}
                                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                                    loading="lazy"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center">
                                                                    {result.mediaType === 'movie' ? (
                                                                        <Film className="w-6 h-6 text-neutral-500" />
                                                                    ) : (
                                                                        <Tv className="w-6 h-6 text-neutral-500" />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Title & Metadata */}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                                                                <h3 className="font-extrabold text-white truncate text-base sm:text-lg tracking-tight">
                                                                    {result.title}
                                                                </h3>
                                                                <span className="px-2 py-0.5 apple-glass-subtle rounded-md text-[10px] sm:text-xs uppercase tracking-wider text-neutral-300 font-extrabold flex-shrink-0">
                                                                    {result.mediaType === 'movie' ? 'Movie' : 'TV'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-3.5 text-xs sm:text-sm text-neutral-400 mb-1.5 tabular-nums">
                                                                {result.year && <span>{result.year}</span>}
                                                                {result.rating != null && result.rating > 0 && (
                                                                    <span className="flex items-center gap-1.5 text-amber-300 font-black">
                                                                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                                                        {result.rating.toFixed(1)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {result.overview && (
                                                                <p className="text-xs sm:text-sm text-neutral-400 line-clamp-1 leading-relaxed text-pretty">
                                                                    {result.overview}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Quick Action Buttons */}
                                                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                                                        <button
                                                            aria-label="Open Details"
                                                            onClick={() => openWatchlistItemOnline(result)}
                                                            className="p-2.5 apple-glass-subtle hover:bg-white/20 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer active:scale-95"
                                                            title="Open Details & Stream Online"
                                                        >
                                                            <Globe className="w-4.5 h-4.5" />
                                                        </button>
                                                        <button
                                                            aria-label="Watch Trailer"
                                                            onClick={() => {
                                                                triggerHaptic('light');
                                                                setTrailerItem({ tmdbId: result.tmdbId, mediaType: result.mediaType, title: result.title });
                                                            }}
                                                            className="p-2.5 apple-glass-subtle hover:bg-white/20 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer active:scale-95"
                                                            title="Watch Trailer"
                                                        >
                                                            <Play className="w-4.5 h-4.5" />
                                                        </button>

                                                        {inLibrary ? (
                                                            <span className="px-3.5 py-2 bg-green-500/25 text-green-300 border border-green-500/40 rounded-xl text-xs sm:text-sm font-bold shadow-sm flex items-center gap-1.5">
                                                                <Check className="w-4 h-4" /> In Library
                                                            </span>
                                                        ) : inWatchlist || isAddedJustNow ? (
                                                            <span className="px-3.5 py-2 bg-white/20 text-white border border-white/35 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm">
                                                                <Check className="w-4 h-4 text-emerald-400" />
                                                                Added
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => addToWatchlist(result)}
                                                                disabled={addingIds.has(result.tmdbId)}
                                                                className="px-4 py-2 bg-white text-black hover:bg-neutral-200 disabled:opacity-50 text-xs sm:text-sm font-black rounded-xl flex items-center gap-1.5 transition shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
                                                            >
                                                                {addingIds.has(result.tmdbId) ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Plus className="w-4 h-4" />
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
                                    <div className="text-center py-8 text-neutral-400 text-sm">
                                        No TMDB matches found for &ldquo;{searchQuery}&rdquo;
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Apple Segmented Controls, In-Watchlist Search, Sort & View Mode Toolbar */}
            <div className={`relative mb-6 sm:mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${showSortMenu ? 'z-40' : 'z-20'}`}>
                {/* Segmented Filter Pills */}
                <div className="flex items-center gap-1.5 p-1 bg-black/45 border border-white/10 rounded-2xl overflow-x-auto scrollbar-hide max-w-full">
                    {[
                        { id: 'all' as TabFilter, label: 'All', count: watchlist.length },
                        { id: 'movie' as TabFilter, label: 'Movies', count: movieCount },
                        { id: 'tv' as TabFilter, label: 'TV Shows', count: tvCount },
                        { id: 'available' as TabFilter, label: 'Available', count: availableCount, highlight: true },
                        { id: 'library' as TabFilter, label: 'In Library', count: libraryCount },
                    ].map((tab) => {
                        if (tab.count === 0 && tab.id !== 'all') return null;
                        const isActive = savedTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                data-testid={`tab-${tab.id}`}
                                onClick={() => {
                                    triggerHaptic('selection');
                                    setSavedTab(tab.id);
                                }}
                                className={`relative px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-bold transition-all duration-200 cursor-pointer whitespace-nowrap flex items-center gap-2 select-none min-h-[44px] ${
                                    isActive ? 'text-white font-extrabold' : 'text-neutral-400 hover:text-white'
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="activeWatchlistTab"
                                        className="absolute inset-0 bg-white/20 border border-white/35 rounded-xl shadow-[0_2px_10px_rgba(255,255,255,0.18)] backdrop-blur-sm will-change-transform"
                                        transition={shouldReduceMotion ? { duration: 0.15 } : { type: 'spring', damping: 28, stiffness: 350 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-2">
                                    {tab.highlight && <Sparkles className="w-4 h-4 text-emerald-400" />}
                                    <span>{tab.label}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-black tabular-nums ${
                                        isActive ? 'bg-white/30 text-white' : 'bg-white/10 text-neutral-400'
                                    }`}>
                                        {tab.count}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Right Controls: In-List Filter, Sort Menu, and View Mode */}
                <div className="flex items-center gap-3 self-end lg:self-auto flex-wrap sm:flex-nowrap">
                    {/* In-Watchlist Quick Filter */}
                    {watchlist.length > 4 && (
                        <div className="relative">
                            <input
                                type="text"
                                value={savedQuery}
                                onChange={(e) => setSavedQuery(e.target.value)}
                                placeholder="Filter saved titles..."
                                className="w-44 sm:w-56 bg-white/[0.05] border border-white/10 focus:border-white/30 rounded-xl sm:rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-neutral-500 outline-none transition min-h-[42px]"
                            />
                            {savedQuery && (
                                <button
                                    onClick={() => setSavedQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Sort Dropdown */}
                    <div className="relative z-50" ref={sortMenuRef}>
                        <button
                            onClick={() => {
                                triggerHaptic('selection');
                                setShowSortMenu(prev => !prev);
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 apple-glass-subtle hover:bg-white/10 border border-white/15 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold text-neutral-200 hover:text-white transition cursor-pointer active:scale-95 min-h-[42px]"
                            title="Sort Watchlist"
                            aria-expanded={showSortMenu}
                        >
                            <ArrowUpDown className="w-4 h-4 text-neutral-400" />
                            <span className="hidden sm:inline text-neutral-400 font-medium">Sort:</span>
                            <span className="font-extrabold">{sortLabels[sortBy]}</span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                            {showSortMenu && (
                                <motion.div
                                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
                                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
                                    transition={shouldReduceMotion ? { duration: 0.15 } : { type: 'spring', damping: 28, stiffness: 350 }}
                                    className="absolute right-0 mt-2 w-52 liquid-glass-menu rounded-2xl p-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] z-50 border border-white/20 origin-top-right"
                                >
                                    {(['recent', 'rating', 'year', 'title'] as const).map((option) => (
                                        <button
                                            key={option}
                                            onClick={() => {
                                                triggerHaptic('selection');
                                                setSortBy(option);
                                                setShowSortMenu(false);
                                            }}
                                            className={`w-full text-left px-3.5 py-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                                                sortBy === option
                                                    ? 'bg-white/20 text-white font-extrabold shadow-sm'
                                                    : 'text-neutral-300 hover:text-white hover:bg-white/10'
                                            }`}
                                        >
                                            <span>{sortLabels[option]}</span>
                                            {sortBy === option && <Check className="w-4 h-4 text-white" />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* View Mode Toggle (Grid vs Shelf/List) */}
                    <div className="flex p-1 bg-black/45 border border-white/10 rounded-xl sm:rounded-2xl min-h-[42px] items-center">
                        <button
                            onClick={() => {
                                triggerHaptic('selection');
                                setViewMode('grid');
                            }}
                            className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center ${
                                viewMode === 'grid'
                                    ? 'bg-white/20 text-white shadow-sm'
                                    : 'text-neutral-400 hover:text-white'
                            }`}
                            title="Grid View"
                            aria-label="Grid View"
                        >
                            <LayoutGrid className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                        </button>
                        <button
                            onClick={() => {
                                triggerHaptic('selection');
                                setViewMode('list');
                            }}
                            className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center ${
                                viewMode === 'list'
                                    ? 'bg-white/20 text-white shadow-sm'
                                    : 'text-neutral-400 hover:text-white'
                            }`}
                            title="Compact List View"
                            aria-label="Compact List View"
                        >
                            <LayoutList className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Section: Loading, Empty, or Filtered Grid/List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-32">
                    <Loader2 className="w-10 h-10 animate-spin text-amber-400 mb-3.5" />
                    <p className="text-neutral-400 text-sm tracking-wider uppercase font-bold">Loading your watchlist...</p>
                </div>
            ) : watchlist.length === 0 ? (
                /* Empty Watchlist Hero with Quick Suggestions */
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 280 }}
                    className="text-center py-20 px-6 sm:px-10 apple-glass-panel rounded-3xl max-w-2xl mx-auto shadow-2xl relative overflow-hidden"
                >
                    <div className="w-20 h-20 rounded-3xl apple-glass-card flex items-center justify-center mx-auto mb-5 border border-white/20 shadow-xl bg-amber-500/10">
                        <Bookmark className="w-10 h-10 text-amber-400" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white mb-2.5 tracking-tight text-balance">
                        Your Watchlist is Empty
                    </h2>
                    <p className="text-neutral-300 text-sm sm:text-base leading-relaxed mb-8 max-w-lg mx-auto text-pretty">
                        Save movies and TV shows to track upcoming digital releases, stream directly, or download straight into your local library.
                    </p>

                    <div className="border-t border-white/10 pt-6 mt-2">
                        <span className="text-xs sm:text-sm font-bold text-neutral-400 mb-3.5 block uppercase tracking-wider">
                            Popular suggestions to get started:
                        </span>
                        <div className="flex flex-wrap items-center justify-center gap-2.5">
                            {QUICK_SUGGESTIONS.map((sug) => (
                                <button
                                    key={sug.title}
                                    onClick={() => {
                                        triggerHaptic('light');
                                        setSearchQuery(sug.title);
                                        setSearchType(sug.type);
                                        searchTMDB(sug.title, sug.type);
                                        searchInputRef.current?.focus();
                                    }}
                                    className="px-4 py-2 apple-glass-subtle hover:bg-white/15 border border-white/15 rounded-xl text-xs sm:text-sm font-semibold text-neutral-200 hover:text-white transition flex items-center gap-2 active:scale-95 cursor-pointer shadow-sm"
                                >
                                    <Plus className="w-4 h-4 text-amber-400" />
                                    <span>{sug.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>
            ) : filteredWatchlist.length === 0 ? (
                /* No Results For Current Filter/Search */
                <div className="text-center py-20 apple-glass-panel rounded-3xl p-10 max-w-md mx-auto shadow-xl">
                    <p className="text-neutral-200 text-base font-bold mb-2">No saved titles match this filter.</p>
                    <p className="text-neutral-400 text-sm mb-5">Try clearing your search query or selecting another tab.</p>
                    <button
                        onClick={() => {
                            triggerHaptic('selection');
                            setSavedTab('all');
                            setSavedQuery('');
                        }}
                        className="px-5 py-2.5 bg-white/15 hover:bg-white/25 text-sm text-white font-bold rounded-xl transition cursor-pointer active:scale-95 shadow-md"
                    >
                        Reset All Filters
                    </button>
                </div>
            ) : viewMode === 'grid' ? (
                /* ─── GRID VIEW: Apple Glass Cards with Fluid Hover & Rich Typography ─── */
                <div
                    className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5 sm:gap-6 relative z-10"
                >
                    <AnimatePresence>
                        {filteredWatchlist.map((item) => {
                            const inLibrary = isInLibrary(item.tmdbId);
                            const available = item.mediaType === 'movie' && isMovieAvailable(item.tmdbId);
                            const displayRating = item.imdbRating ?? item.rating;

                            return (
                                <motion.div
                                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                                    whileHover={shouldReduceMotion ? {} : { y: -6, scale: 1.02 }}
                                    whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
                                    transition={{ type: 'spring', damping: 32, stiffness: 360, mass: 0.8 }}
                                    key={item.id}
                                    data-testid={`watchlist-card-${item.id}`}
                                    onClick={() => openWatchlistItemOnline(item)}
                                    className={`group relative rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer apple-glass-card transition-colors duration-200 shadow-lg ${
                                        available && !inLibrary
                                            ? 'border-emerald-500/40 shadow-emerald-500/10 hover:border-emerald-400/80 hover:shadow-emerald-500/25'
                                            : 'border-white/12 hover:border-white/35'
                                    }`}
                                >
                                    {/* Poster Container */}
                                    <div className="aspect-[2/3] bg-neutral-900/70 relative overflow-hidden">
                                        {item.posterPath ? (
                                            <img
                                                src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                                                alt={item.title}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-black/50">
                                                {item.mediaType === 'movie' ? (
                                                    <Film className="w-14 h-14 text-neutral-600" />
                                                ) : (
                                                    <Tv className="w-14 h-14 text-neutral-600" />
                                                )}
                                            </div>
                                        )}

                                        {/* Status Badges (Top Left) */}
                                        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none select-none max-w-[70%]">
                                            <span className="px-2.5 py-1 bg-black/90 border border-white/20 rounded-lg text-xs uppercase tracking-wider text-white font-extrabold shadow-md w-fit">
                                                {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                                            </span>
                                            {inLibrary && (
                                                <span className="px-2.5 py-1 bg-green-950/90 border border-green-500/60 rounded-lg text-xs text-green-200 font-black shadow-md w-fit flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> In Library
                                                </span>
                                            )}
                                            {available && !inLibrary && (
                                                <span className="px-2.5 py-1 bg-emerald-950/90 border border-emerald-400/70 rounded-lg text-xs text-emerald-200 font-black flex items-center gap-1 animate-pulse shadow-md w-fit">
                                                    <Sparkles className="w-3 h-3" /> Ready
                                                </span>
                                            )}
                                        </div>

                                        {/* Rating Badge (Top Right) */}
                                        {displayRating != null && displayRating > 0 && (
                                            <div className="absolute top-3 right-3 z-20 inline-flex items-center gap-1 px-2.5 py-1 bg-black/90 border border-amber-400/45 rounded-lg text-xs text-amber-300 font-black shadow-md pointer-events-none select-none w-fit tabular-nums">
                                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                                <span>{displayRating.toFixed(1)}</span>
                                            </div>
                                        )}

                                        {/* Apple-style Hover Scrim & Direct Action Layer */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-4 z-20">
                                            {item.overview && (
                                                <p className="text-xs sm:text-sm text-neutral-200 line-clamp-3 mb-3 leading-relaxed drop-shadow text-pretty">
                                                    {item.overview}
                                                </p>
                                            )}

                                            {/* Primary Download Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    triggerHaptic('light');
                                                    setDownloadItem(item);
                                                }}
                                                className="w-full py-2.5 bg-white text-black hover:bg-neutral-200 text-xs sm:text-sm font-black rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 shadow-xl mb-2 cursor-pointer transition active:scale-95"
                                            >
                                                <Download className="w-4 h-4" />
                                                Download
                                            </button>

                                            {/* Secondary Actions: Trailer & Forgiving Delete */}
                                            <div className="flex gap-2 w-full">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        triggerHaptic('light');
                                                        setTrailerItem({ tmdbId: item.tmdbId, mediaType: item.mediaType, title: item.title });
                                                    }}
                                                    className="flex-1 py-2 apple-glass-subtle hover:bg-white/20 text-neutral-200 hover:text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                                                    title="Watch Trailer"
                                                >
                                                    <Play className="w-3.5 h-3.5" />
                                                    Trailer
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        initiateRemove(item);
                                                    }}
                                                    className="p-2 bg-red-500/20 hover:bg-red-500/35 text-red-300 border border-red-500/30 rounded-xl flex items-center justify-center transition cursor-pointer hover:scale-105 active:scale-95"
                                                    title="Remove from Watchlist"
                                                    aria-label={`Remove ${item.title}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Footer Info */}
                                    <div className="p-3.5 sm:p-4">
                                        <h3 className="font-extrabold text-white text-base sm:text-lg truncate tracking-tight" title={item.title}>
                                            {item.title}
                                        </h3>
                                        <div className="flex items-center justify-between gap-2 text-xs sm:text-sm text-neutral-400 mt-1 tabular-nums">
                                            <span className="font-semibold text-neutral-300">{item.year || '—'}</span>
                                            <span className="flex items-center gap-1.5 text-neutral-400 truncate">
                                                <Clock className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                                                <span className="truncate">{formatDate(item.addedAt)}</span>
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            ) : (
                /* ─── COMPACT SHELF/LIST VIEW: Clean, Informative, Space-Efficient ─── */
                <div className="space-y-3 relative z-10">
                    <AnimatePresence>
                        {filteredWatchlist.map((item) => {
                            const inLibrary = isInLibrary(item.tmdbId);
                            const available = item.mediaType === 'movie' && isMovieAvailable(item.tmdbId);
                            const displayRating = item.imdbRating ?? item.rating;

                            return (
                                <motion.div
                                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                                    whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
                                    transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                                    key={item.id}
                                    data-testid={`watchlist-list-item-${item.id}`}
                                    onClick={() => openWatchlistItemOnline(item)}
                                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 apple-glass-card rounded-2xl sm:rounded-3xl cursor-pointer transition-colors duration-200 hover:border-white/35 shadow-md group ${
                                        available && !inLibrary ? 'border-emerald-500/40' : 'border-white/12'
                                    }`}
                                >
                                    <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
                                        {/* Poster Thumbnail */}
                                        <div className="w-18 h-26 sm:w-22 sm:h-32 flex-shrink-0 rounded-xl sm:rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-md">
                                            {item.posterPath ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                                                    alt={item.title}
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    {item.mediaType === 'movie' ? (
                                                        <Film className="w-8 h-8 text-neutral-600" />
                                                    ) : (
                                                        <Tv className="w-8 h-8 text-neutral-600" />
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Title, Badges & Overview */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                                                <h3 className="font-black text-white text-lg sm:text-xl truncate tracking-tight">
                                                    {item.title}
                                                </h3>
                                                <span className="px-2.5 py-0.5 apple-glass-subtle rounded-md text-xs uppercase font-extrabold text-neutral-300">
                                                    {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                                                </span>
                                                {inLibrary && (
                                                    <span className="px-2.5 py-0.5 bg-green-500/30 border border-green-500/50 text-green-200 rounded-md text-xs font-black">
                                                        In Library
                                                    </span>
                                                )}
                                                {available && !inLibrary && (
                                                    <span className="px-2.5 py-0.5 bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 rounded-md text-xs font-black flex items-center gap-1 animate-pulse">
                                                        <Sparkles className="w-3 h-3" /> Ready
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-4 text-xs sm:text-sm text-neutral-400 mb-1.5 tabular-nums">
                                                <span className="font-bold text-neutral-200">{item.year || '—'}</span>
                                                {displayRating != null && displayRating > 0 && (
                                                    <span className="flex items-center gap-1.5 text-amber-300 font-extrabold">
                                                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                                                        {displayRating.toFixed(1)}
                                                    </span>
                                                )}
                                                <span className="text-neutral-400">
                                                    Added {formatDate(item.addedAt)}
                                                </span>
                                            </div>

                                            {item.overview && (
                                                <p className="text-xs sm:text-sm text-neutral-300 line-clamp-2 max-w-3xl leading-relaxed text-pretty">
                                                    {item.overview}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons in List View */}
                                    <div className="flex items-center gap-2.5 flex-shrink-0 self-end sm:self-center">
                                        <button
                                            aria-label="Stream Online"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openWatchlistItemOnline(item);
                                            }}
                                            className="px-3.5 py-2 apple-glass-subtle hover:bg-white/20 text-neutral-200 hover:text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer active:scale-95"
                                        >
                                            <Globe className="w-4 h-4" />
                                            <span>Details</span>
                                        </button>

                                        <button
                                            aria-label="Watch Trailer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                triggerHaptic('light');
                                                setTrailerItem({ tmdbId: item.tmdbId, mediaType: item.mediaType, title: item.title });
                                            }}
                                            className="px-3.5 py-2 apple-glass-subtle hover:bg-white/20 text-neutral-200 hover:text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer active:scale-95"
                                        >
                                            <Play className="w-4 h-4" />
                                            <span>Trailer</span>
                                        </button>

                                        <button
                                            aria-label="Download"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                triggerHaptic('light');
                                                setDownloadItem(item);
                                            }}
                                            className="px-4 py-2 bg-white text-black hover:bg-neutral-200 text-xs sm:text-sm font-extrabold rounded-xl flex items-center gap-2 transition shadow-md active:scale-95 cursor-pointer"
                                        >
                                            <Download className="w-4 h-4" />
                                            <span>Download</span>
                                        </button>

                                        <button
                                            aria-label={`Remove ${item.title}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                initiateRemove(item);
                                            }}
                                            className="p-2.5 bg-red-500/20 hover:bg-red-500/35 text-red-300 border border-red-500/30 rounded-xl flex items-center justify-center transition cursor-pointer hover:scale-105 active:scale-95"
                                            title="Remove from Watchlist"
                                        >
                                            <Trash2 className="w-4.5 h-4.5" />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* Agency & Forgiveness: Floating Undo Toast Notification */}
            <AnimatePresence>
                {deletedUndoItem && (
                    <motion.div
                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
                        transition={shouldReduceMotion ? { duration: 0.15 } : { type: 'spring', damping: 28, stiffness: 350 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3.5 px-6 py-3.5 apple-glass-toast rounded-2xl shadow-2xl border border-white/20 select-none"
                    >
                        <span className="text-sm sm:text-base text-neutral-200">
                            Removed <strong className="text-white font-extrabold">&ldquo;{deletedUndoItem.item.title}&rdquo;</strong>
                        </span>
                        <button
                            onClick={handleUndoDelete}
                            className="px-3.5 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center gap-2 active:scale-95 cursor-pointer shadow-sm"
                        >
                            <Undo2 className="w-4 h-4" />
                            Undo
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Download Modal Hook */}
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

            {/* Trailer Modal Hook */}
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
