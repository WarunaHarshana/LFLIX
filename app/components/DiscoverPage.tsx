'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Film, Tv, Loader2, Globe, TrendingUp, ChevronDown, Filter, Magnet } from 'lucide-react';

const MOVIE_GENRES = [
    { id: '28', name: 'Action' },
    { id: '12', name: 'Adventure' },
    { id: '16', name: 'Animation' },
    { id: '35', name: 'Comedy' },
    { id: '80', name: 'Crime' },
    { id: '99', name: 'Documentary' },
    { id: '18', name: 'Drama' },
    { id: '10751', name: 'Family' },
    { id: '14', name: 'Fantasy' },
    { id: '36', name: 'History' },
    { id: '27', name: 'Horror' },
    { id: '10402', name: 'Music' },
    { id: '9648', name: 'Mystery' },
    { id: '10749', name: 'Romance' },
    { id: '878', name: 'Science Fiction' },
    { id: '53', name: 'Thriller' },
    { id: '10752', name: 'War' },
    { id: '37', name: 'Western' },
];

const TV_GENRES = [
    { id: '10759', name: 'Action & Adventure' },
    { id: '16', name: 'Animation' },
    { id: '35', name: 'Comedy' },
    { id: '80', name: 'Crime' },
    { id: '99', name: 'Documentary' },
    { id: '18', name: 'Drama' },
    { id: '10751', name: 'Family' },
    { id: '10762', name: 'Kids' },
    { id: '9648', name: 'Mystery' },
    { id: '10763', name: 'News' },
    { id: '10764', name: 'Reality' },
    { id: '10765', name: 'Sci-Fi & Fantasy' },
    { id: '10766', name: 'Soap' },
    { id: '10767', name: 'Talk' },
    { id: '10768', name: 'War & Politics' },
    { id: '37', name: 'Western' },
];

const LANGUAGES = [
    { id: 'en', name: 'English' },
    { id: 'es', name: 'Spanish' },
    { id: 'fr', name: 'French' },
    { id: 'de', name: 'German' },
    { id: 'it', name: 'Italian' },
    { id: 'pt', name: 'Portuguese' },
    { id: 'hi', name: 'Hindi' },
    { id: 'ja', name: 'Japanese' },
    { id: 'ko', name: 'Korean' },
    { id: 'zh', name: 'Chinese' },
    { id: 'th', name: 'Thai' },
    { id: 'ru', name: 'Russian' },
];

const SORT_OPTIONS = [
    { id: 'popularity.desc', name: 'Most Popular' },
    { id: 'vote_average.desc', name: 'Top Rated' },
    { id: 'primary_release_date.desc', name: 'Newest' },
    { id: 'primary_release_date.asc', name: 'Oldest' },
];

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

type TrendingItem = TMDBResult;

type DiscoverProps = {
    initialItem?: TMDBResult | null;
    onSwitchToTorrents?: (query?: string) => void;
};

export default function DiscoverPage({ initialItem, onSwitchToTorrents }: DiscoverProps) {
    const router = useRouter();

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchType, setSearchType] = useState<'multi' | 'movie' | 'tv'>('multi');
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Trending & Discover Form
    const [trendingMovies, setTrendingMovies] = useState<TrendingItem[]>([]);
    const [trendingTv, setTrendingTv] = useState<TrendingItem[]>([]);
    const [discoverType, setDiscoverType] = useState<'movie' | 'tv'>('movie');
    const [loadingTrending, setLoadingTrending] = useState(true);

    // Filters
    const [selectedGenre, setSelectedGenre] = useState<string>('');
    const [selectedLanguage, setSelectedLanguage] = useState<string>('');
    const [sortBy, setSortBy] = useState<string>('popularity.desc');
    const [discoveredItems, setDiscoveredItems] = useState<TMDBResult[]>([]);
    const [loadingDiscover, setLoadingDiscover] = useState(false);
    
    // Pagination
    const [discoverPage, setDiscoverPage] = useState(1);
    const [hasMoreDiscover, setHasMoreDiscover] = useState(true);
    const observerTarget = useRef<HTMLDivElement>(null);

    const isFiltering = selectedGenre !== '' || selectedLanguage !== '' || sortBy !== 'popularity.desc';

    // Fetch trending on mount
    useEffect(() => {
        const fetchTrending = async () => {
            setLoadingTrending(true);
            try {
                const res = await fetch('/api/trending');
                const data = await res.json();
                if (data.movies) setTrendingMovies(data.movies);
                if (data.tv) setTrendingTv(data.tv);
            } catch { /* ignore */ }
            finally { setLoadingTrending(false); }
        };
        fetchTrending();
    }, []);

    // Reset pagination when filters change
    useEffect(() => {
        setDiscoverPage(1);
        setDiscoveredItems([]);
        setHasMoreDiscover(true);
    }, [discoverType, selectedGenre, selectedLanguage, sortBy]);

    // Discover effect
    useEffect(() => {
        if (!isFiltering || !hasMoreDiscover) return;
        
        const fetchDiscover = async () => {
            if (discoverPage === 1) setLoadingDiscover(true);
            try {
                let actualSortBy = sortBy;
                if (discoverType === 'tv') {
                    if (sortBy === 'primary_release_date.desc') actualSortBy = 'first_air_date.desc';
                    if (sortBy === 'primary_release_date.asc') actualSortBy = 'first_air_date.asc';
                }

                const params = new URLSearchParams({
                    type: discoverType,
                    sort_by: actualSortBy,
                    page: discoverPage.toString()
                });
                if (selectedGenre) params.append('with_genres', selectedGenre);
                if (selectedLanguage) params.append('with_original_language', selectedLanguage);
                
                const res = await fetch(`/api/discover?${params.toString()}`);
                const data = await res.json();
                
                if (data.results && data.results.length > 0) {
                    setDiscoveredItems(prev => discoverPage === 1 ? data.results : [...prev, ...data.results]);
                    setHasMoreDiscover(data.page < data.totalPages);
                } else {
                    if (discoverPage === 1) setDiscoveredItems([]);
                    setHasMoreDiscover(false);
                }
            } catch (e) {
                console.error('Discover filtering failed', e);
            } finally {
                setLoadingDiscover(false);
            }
        };

        const timeout = setTimeout(fetchDiscover, discoverPage === 1 ? 500 : 100);
        return () => clearTimeout(timeout);
    }, [discoverType, selectedGenre, selectedLanguage, sortBy, isFiltering, discoverPage, hasMoreDiscover]);

    // Intersection observer for infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMoreDiscover && !loadingDiscover && isFiltering) {
                    setDiscoverPage(prev => prev + 1);
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        const currentTarget = observerTarget.current;
        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [hasMoreDiscover, loadingDiscover, isFiltering]);

    // Debounced search
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
        } catch {
            console.error('TMDB search failed');
        } finally {
            setSearching(false);
        }
    }, []);

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            searchTMDB(value, searchType);
        }, 400);
    };

    const handleTypeChange = (type: 'multi' | 'movie' | 'tv') => {
        setSearchType(type);
        if (searchQuery.trim().length >= 2) {
            searchTMDB(searchQuery, type);
        }
    };

    // Fetch details when selecting a result
    const openDetails = (result: TMDBResult) => {
        router.push(`/discover/${result.mediaType}/${result.tmdbId}`);
    };

    // Auto-open details when initialItem is passed from search
    useEffect(() => {
        if (initialItem) {
            openDetails(initialItem);
        }
    }, [initialItem]);

    const showingSearch = searchQuery.trim().length >= 2;

    // Determine items to show in the grid
    const gridItems = showingSearch
        ? searchResults
        : isFiltering 
            ? discoveredItems 
            : (discoverType === 'movie' ? trendingMovies : trendingTv);

    const activeGenres = discoverType === 'movie' ? MOVIE_GENRES : TV_GENRES;

    return (
        <div className="pt-24 px-6 md:px-12 pb-20">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl">
                        <Globe className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold">Discover</h1>
                        <p className="text-neutral-400 text-sm">Search any movie or TV show. Watch online instantly or download.</p>
                    </div>
                </div>
                {onSwitchToTorrents && (
                    <button
                        onClick={() => onSwitchToTorrents(searchQuery.trim() || undefined)}
                        className="mt-3 px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 transition text-sm text-neutral-300 flex items-center gap-2"
                    >
                        <Magnet className="w-4 h-4 text-blue-400" />
                        Switch to Torrents
                    </button>
                )}
            </div>

            {/* Search Bar */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-6">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search any movie or TV show..."
                            className="w-full bg-black border border-neutral-700 rounded-xl pl-12 pr-10 py-3.5 outline-none focus:border-blue-500 transition text-sm"
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
                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                                    }`}
                            >
                                {type === 'multi' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Searching indicator */}
            {searching && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            )}

            {/* Filters Bar (when not searching) */}
            {!showingSearch && !searching && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 mb-8">
                    <div className="flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-6">
                        {/* Title / Toggle */}
                        <div className="flex items-center gap-4 sm:min-w-fit">
                            <div className="flex items-center gap-2">
                                <Filter className="w-5 h-5 text-blue-500" />
                                <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Filters</h2>
                            </div>
                            <div className="flex bg-black border border-neutral-700 rounded-xl p-1">
                                <button
                                    onClick={() => { setDiscoverType('movie'); setSelectedGenre(''); }}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 min-w-[100px] justify-center ${discoverType === 'movie' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border border-transparent'}`}
                                >
                                    <Film className="w-4 h-4" /> Movies
                                </button>
                                <button
                                    onClick={() => { setDiscoverType('tv'); setSelectedGenre(''); }}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 min-w-[100px] justify-center ${discoverType === 'tv' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border border-transparent'}`}
                                >
                                    <Tv className="w-4 h-4" /> TV Shows
                                </button>
                            </div>
                        </div>

                        {/* Dropdowns */}
                        <div className="flex flex-wrap items-center gap-3 flex-1 xl:justify-end">
                            {/* Genre Filter */}
                            <div className="relative min-w-[140px] flex-1 sm:flex-none">
                                <select 
                                    value={selectedGenre} 
                                    onChange={(e) => setSelectedGenre(e.target.value)}
                                    className="w-full appearance-none bg-black border border-neutral-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition text-sm text-neutral-300 pr-10"
                                >
                                    <option value="">All Genres</option>
                                    {activeGenres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                            </div>

                            {/* Language Filter */}
                            <div className="relative min-w-[140px] flex-1 sm:flex-none">
                                <select 
                                    value={selectedLanguage} 
                                    onChange={(e) => setSelectedLanguage(e.target.value)}
                                    className="w-full appearance-none bg-black border border-neutral-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition text-sm text-neutral-300 pr-10"
                                >
                                    <option value="">All Languages</option>
                                    {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                            </div>

                            {/* Sort Filter */}
                            <div className="relative min-w-[160px] flex-1 sm:flex-none">
                                <select 
                                    value={sortBy} 
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="w-full appearance-none bg-black border border-neutral-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition text-sm text-neutral-300 pr-10"
                                >
                                    {SORT_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                            </div>

                            {/* Clear Filters */}
                            {isFiltering && (
                                <button
                                    onClick={() => { setSelectedGenre(''); setSelectedLanguage(''); setSortBy('popularity.desc'); }}
                                    className="p-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-400 hover:text-white transition flex-shrink-0"
                                    title="Reset Filters"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Results Header (if filtering/trending) */}
            {!showingSearch && !searching && (
                <div className="flex items-center gap-2 mb-4">
                    {isFiltering ? (
                        <>
                            <Filter className="w-5 h-5 text-blue-500" />
                            <h2 className="text-lg font-bold">Filtered Results</h2>
                        </>
                    ) : (
                        <>
                            <TrendingUp className="w-5 h-5 text-red-500" />
                            <h2 className="text-lg font-bold">Trending Now</h2>
                        </>
                    )}
                </div>
            )}

            {/* Search results header */}
            {showingSearch && !searching && (
                <div className="flex items-center gap-2 mb-4">
                    <Search className="w-4 h-4 text-neutral-500" />
                    <span className="text-sm text-neutral-400">{searchResults.length} results for &quot;{searchQuery}&quot;</span>
                </div>
            )}

            {/* Loading trending / initial filters */}
            {!showingSearch && (loadingTrending || (loadingDiscover && discoverPage === 1)) && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                </div>
            )}

            {/* Content Grid */}
            {!searching && !(loadingTrending && !showingSearch && !loadingDiscover) && !(loadingDiscover && discoverPage === 1) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                    {gridItems.map((item, idx) => (
                        <button
                            key={`${item.mediaType}-${item.tmdbId}-${idx}`}
                            onClick={() => openDetails(item)}
                            className="group relative bg-neutral-900 rounded-xl overflow-hidden hover:scale-[1.03] transition-all duration-200 text-left cursor-pointer"
                        >
                            {/* Poster */}
                            <div className="aspect-[2/3] relative bg-neutral-800">
                                {item.posterPath ? (
                                    <img
                                        src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                                        alt={item.title}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        {item.mediaType === 'movie' ? <Film className="w-8 h-8 text-neutral-700" /> : <Tv className="w-8 h-8 text-neutral-700" />}
                                    </div>
                                )}
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end">
                                    <div className="p-3 w-full">
                                        <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium">
                                            <Globe className="w-3.5 h-3.5" />
                                            Watch Online
                                        </div>
                                    </div>
                                </div>
                                {/* Rating badge */}
                                {item.rating != null && item.rating > 0 && (
                                    <div className="absolute top-1.5 right-1.5 bg-[#F5C518] px-1.5 py-0.5 rounded-md shadow-sm">
                                        <span className="text-[10px] font-bold text-black">IMDb {item.rating.toFixed(1)}</span>
                                    </div>
                                )}
                                {/* Type badge */}
                                <div className="absolute top-1.5 left-1.5">
                                    <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[10px] uppercase tracking-wide text-neutral-300 font-medium">
                                        {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                                    </span>
                                </div>
                            </div>
                            {/* Info */}
                            <div className="p-2.5">
                                <p className="text-xs font-medium leading-tight line-clamp-2 mb-1">{item.title}</p>
                                {item.year && <p className="text-[10px] text-neutral-500">{item.year}</p>}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Loading More Indicator / Observer target */}
            {!showingSearch && isFiltering && discoveredItems.length > 0 && (
                <div ref={observerTarget} className="flex justify-center py-12">
                    {loadingDiscover && discoverPage > 1 && (
                        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                    )}
                </div>
            )}

            {/* No search results / Filter Results */}
            {showingSearch && !searching && searchResults.length === 0 && (
                <div className="text-center py-16 bg-neutral-900/50 border border-neutral-800 rounded-2xl">
                    <Search className="w-12 h-12 text-neutral-700 mx-auto mb-3" />
                    <p className="text-neutral-400 text-sm">No results found for &quot;{searchQuery}&quot;</p>
                </div>
            )}
            
            {!showingSearch && isFiltering && !loadingDiscover && discoveredItems.length === 0 && (
                <div className="text-center py-16 bg-neutral-900/50 border border-neutral-800 rounded-2xl">
                    <Filter className="w-12 h-12 text-neutral-700 mx-auto mb-3" />
                    <p className="text-neutral-400 text-sm">No results found for your filters. Try clearing some selections.</p>
                </div>
            )}

        </div>
    );
}
