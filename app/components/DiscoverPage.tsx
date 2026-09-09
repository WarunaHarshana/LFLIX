'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Film, Tv, Loader2, Globe, TrendingUp, ChevronDown, Filter, Magnet } from 'lucide-react';
import LiquidDropdown from './LiquidDropdown';

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

    const handleDiscoverTypeChange = (type: 'movie' | 'tv') => {
        setDiscoverType(type);
        setSelectedGenre('');
        setSearchType(type);
    };

    const handleSearchTypeChange = (type: 'multi' | 'movie' | 'tv') => {
        setSearchType(type);
        if (type !== 'multi') {
            setDiscoverType(type);
        }
        if (searchQuery.trim().length >= 2) {
            searchTMDB(searchQuery, type);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
        if (inputRef.current) inputRef.current.focus();
    };

    // Determine items to show in the grid
    const gridItems = showingSearch
        ? searchResults
        : isFiltering 
            ? discoveredItems 
            : (discoverType === 'movie' ? trendingMovies : trendingTv);

    const activeGenres = discoverType === 'movie' ? MOVIE_GENRES : TV_GENRES;

    return (
        <div className="pt-24 px-4 sm:px-6 md:px-12 pb-28 md:pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 accent-gradient-box rounded-2xl text-white shadow-lg shrink-0">
                        <Globe className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Discover</h1>
                        <p className="text-neutral-400 text-sm md:text-base mt-0.5">Search any movie or TV show. Watch online instantly or download.</p>
                    </div>
                </div>
                {onSwitchToTorrents && (
                    <button
                        onClick={() => onSwitchToTorrents(searchQuery.trim() || undefined)}
                        className="self-start sm:self-auto px-4 py-2.5 liquid-glass-pill border border-white/15 hover:scale-105 transition-all text-sm font-medium text-neutral-200 hover:text-white flex items-center gap-2 shadow-lg shrink-0 cursor-pointer"
                    >
                        <Magnet className="w-4 h-4 accent-text" />
                        <span>Switch to Torrents</span>
                    </button>
                )}
            </div>

            {/* Unified Search & Discovery Console */}
            <div className="liquid-glass-base border border-white/15 rounded-3xl p-3.5 sm:p-5 mb-8 shadow-2xl relative z-20 overflow-visible">
                {/* Top Tier: Universal Search Bar */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 pointer-events-none" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search any movie or TV show..."
                        className="w-full bg-white/[0.04] border border-white/15 focus:border-white/40 focus:bg-white/[0.08] text-white placeholder-neutral-500 rounded-2xl pl-12 pr-11 py-3.5 outline-none transition-all text-sm md:text-base shadow-inner"
                    />
                    {searchQuery && (
                        <button
                            onClick={clearSearch}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition text-neutral-400 hover:text-white cursor-pointer"
                            aria-label="Clear search"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Bottom Tier: Browse Filters OR Search Refinement */}
                <div className="mt-3.5 pt-3.5 border-t border-white/10">
                    {!showingSearch ? (
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                            {/* Media Type Switcher: Movies / TV Shows (Left-aligned on large screens) */}
                            <div className="flex items-center gap-2.5 w-full lg:w-auto shrink-0">
                                <div className="flex liquid-glass-pill p-1 border border-white/10 rounded-2xl w-full sm:w-auto">
                                    <button
                                        onClick={() => handleDiscoverTypeChange('movie')}
                                        className={`flex-1 sm:flex-initial px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 min-w-0 sm:min-w-[110px] justify-center min-h-[40px] cursor-pointer ${
                                            discoverType === 'movie'
                                                ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                                : 'text-neutral-300 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <Film className="w-4 h-4" /> Movies
                                    </button>
                                    <button
                                        onClick={() => handleDiscoverTypeChange('tv')}
                                        className={`flex-1 sm:flex-initial px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 min-w-0 sm:min-w-[110px] justify-center min-h-[40px] cursor-pointer ${
                                            discoverType === 'tv'
                                                ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                                : 'text-neutral-300 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <Tv className="w-4 h-4" /> TV Shows
                                    </button>
                                </div>
                            </div>

                            {/* Dropdowns (Genre, Language, Sort) & Clear button (Right-aligned on large screens) */}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto lg:justify-end shrink-0">
                                <LiquidDropdown
                                    label="All Genres"
                                    title="Select Genre"
                                    value={selectedGenre}
                                    onChange={setSelectedGenre}
                                    options={[{ id: '', name: 'All Genres' }, ...activeGenres]}
                                    className="flex-1 sm:flex-initial lg:flex-none w-auto min-w-[135px] sm:min-w-[155px]"
                                    align="left"
                                    isHighlightActive={Boolean(selectedGenre)}
                                />

                                <LiquidDropdown
                                    label="All Languages"
                                    title="Select Language"
                                    value={selectedLanguage}
                                    onChange={setSelectedLanguage}
                                    options={[{ id: '', name: 'All Languages' }, ...LANGUAGES]}
                                    className="flex-1 sm:flex-initial lg:flex-none w-auto min-w-[150px] sm:min-w-[175px]"
                                    align="left"
                                    isHighlightActive={Boolean(selectedLanguage)}
                                />

                                <LiquidDropdown
                                    label="Most Popular"
                                    title="Sort By"
                                    value={sortBy}
                                    onChange={setSortBy}
                                    options={SORT_OPTIONS}
                                    className="flex-1 sm:flex-initial lg:flex-none w-auto min-w-[145px] sm:min-w-[165px]"
                                    align="right"
                                    isHighlightActive={sortBy !== 'popularity.desc'}
                                />

                                {isFiltering && (
                                    <button
                                        aria-label="Reset Filters"
                                        onClick={() => { setSelectedGenre(''); setSelectedLanguage(''); setSortBy('popularity.desc'); }}
                                        className="p-2.5 liquid-glass-pill hover:scale-105 border border-white/15 text-neutral-300 hover:text-white transition shrink-0 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl"
                                        title="Reset Filters"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Search Refinement Mode */
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <span className="text-xs uppercase tracking-wider font-bold text-neutral-400 shrink-0">Filter:</span>
                                <div className="flex liquid-glass-pill p-1 border border-white/10 rounded-2xl w-full sm:w-auto">
                                    {(['multi', 'movie', 'tv'] as const).map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => handleSearchTypeChange(type)}
                                            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[38px] flex items-center justify-center cursor-pointer ${
                                                searchType === type
                                                    ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                                    : 'text-neutral-300 hover:text-white hover:bg-white/5'
                                            }`}
                                        >
                                            {type === 'multi' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 justify-between sm:justify-end">
                                <span className="text-xs sm:text-sm text-neutral-300">
                                    {searching ? (
                                        <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin accent-text" /> Searching...</span>
                                    ) : (
                                        <span>{searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}</span>
                                    )}
                                </span>
                                <button
                                    onClick={clearSearch}
                                    className="text-xs font-semibold text-neutral-400 hover:text-white transition px-2.5 py-1.5 rounded-lg hover:bg-white/10 cursor-pointer flex items-center gap-1"
                                >
                                    <X className="w-3.5 h-3.5" /> Clear search
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Searching indicator */}
            {searching && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin accent-text" />
                </div>
            )}

            {/* Section Header */}
            {!searching && (
                <div className="flex items-center gap-2.5 mb-5">
                    {showingSearch ? (
                        <>
                            <Search className="w-5 h-5 accent-text" />
                            <h2 className="text-lg md:text-xl font-bold tracking-tight">Search Results for &quot;{searchQuery}&quot;</h2>
                        </>
                    ) : isFiltering ? (
                        <>
                            <Filter className="w-5 h-5 accent-text" />
                            <h2 className="text-lg md:text-xl font-bold tracking-tight">Filtered Results</h2>
                        </>
                    ) : (
                        <>
                            <TrendingUp className="w-5 h-5 text-red-500" />
                            <h2 className="text-lg md:text-xl font-bold tracking-tight">Trending {discoverType === 'movie' ? 'Movies' : 'TV Shows'}</h2>
                        </>
                    )}
                </div>
            )}

            {/* Loading trending / initial filters */}
            {!showingSearch && (loadingTrending || (loadingDiscover && discoverPage === 1)) && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-7 h-7 animate-spin text-neutral-400" />
                </div>
            )}

            {/* Content Grid */}
            {!searching && !(loadingTrending && !showingSearch && !loadingDiscover) && !(loadingDiscover && discoverPage === 1) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3.5">
                    {gridItems.map((item, idx) => (
                        <button
                            key={`${item.mediaType}-${item.tmdbId}-${idx}`}
                            onClick={() => openDetails(item)}
                            className="group relative liquid-card liquid-sheen-effect rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.04] hover:z-30 shadow-md hover:shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_24px_rgba(255,255,255,0.12)] text-left"
                        >
                            {/* Poster */}
                            <div className="aspect-[2/3] relative bg-neutral-900 overflow-hidden">
                                {item.posterPath ? (
                                    <img
                                        src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                                        alt={item.title}
                                        className="w-full h-full object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-95"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        {item.mediaType === 'movie' ? <Film className="w-8 h-8 text-neutral-700" /> : <Tv className="w-8 h-8 text-neutral-700" />}
                                    </div>
                                )}
                                {/* Type badge */}
                                <div className="absolute top-2 left-2 z-10">
                                    <span className="px-2 py-0.5 bg-black/70 backdrop-blur-md border border-white/15 rounded-lg text-[10px] uppercase tracking-wider text-neutral-200 font-bold shadow-md">
                                        {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                                    </span>
                                </div>
                            </div>
                            {/* Info */}
                            <div className="p-3">
                                <p className="text-xs md:text-sm font-semibold leading-tight line-clamp-2 mb-1 group-hover:text-white transition-colors">{item.title}</p>
                                {item.year && <p className="text-[10px] md:text-xs text-neutral-400 font-medium">{item.year}</p>}
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
                <div className="text-center py-16 liquid-glass-base border border-white/10 rounded-3xl shadow-xl">
                    <Search className="w-12 h-12 text-neutral-500 mx-auto mb-3" />
                    <p className="text-neutral-300 text-sm md:text-base font-medium">No results found for &quot;{searchQuery}&quot;</p>
                </div>
            )}
            
            {!showingSearch && isFiltering && !loadingDiscover && discoveredItems.length === 0 && (
                <div className="text-center py-16 liquid-glass-base border border-white/10 rounded-3xl shadow-xl">
                    <Filter className="w-12 h-12 text-neutral-500 mx-auto mb-3" />
                    <p className="text-neutral-300 text-sm md:text-base font-medium">No results found for your filters. Try clearing some selections.</p>
                </div>
            )}

        </div>
    );
}
