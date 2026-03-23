'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Star, Film, Tv, Loader2, Globe, TrendingUp, Play, Download, Bookmark, ChevronLeft, ChevronDown, Info, Clock, Filter } from 'lucide-react';
import StreamServerModal from './StreamServerModal';
import DownloadModal from './DownloadModal';
import TrailerModal from './TrailerModal';

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

type MovieDetails = {
    id: number;
    title: string;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    rating: number | null;
    year: string | null;
    runtime: number | null;
    tagline: string | null;
    genres: string;
    cast: { name: string; character: string; profilePath: string | null }[];
};

type TVDetails = {
    id: number;
    title: string;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    rating: number | null;
    year: string | null;
    status: string | null;
    tagline: string | null;
    genres: string;
    numberOfSeasons: number;
    seasons: { seasonNumber: number; name: string; episodeCount: number; posterPath: string | null; airDate: string | null }[];
    cast: { name: string; character: string; profilePath: string | null }[];
};

type EpisodeInfo = {
    episodeNumber: number;
    title: string;
    overview: string | null;
    stillPath: string | null;
    airDate: string | null;
    rating: number | null;
    runtime: number | null;
};

type DiscoverProps = {
    initialItem?: TMDBResult | null;
};

export default function DiscoverPage({ initialItem }: DiscoverProps) {
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

    // Detail modal
    const [selectedResult, setSelectedResult] = useState<TMDBResult | null>(null);
    const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
    const [tvDetails, setTVDetails] = useState<TVDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // TV Episode browser
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
    const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
    const [loadingEpisodes, setLoadingEpisodes] = useState(false);

    // Stream server, download, trailer modals
    const [streamModal, setStreamModal] = useState<{ tmdbId: number; type: 'movie' | 'tv'; title: string; season?: number; episode?: number } | null>(null);
    const [downloadModal, setDownloadModal] = useState<{ title: string; year?: string | null; mediaType: 'movie' | 'tv'; posterPath?: string | null } | null>(null);
    const [trailerModal, setTrailerModal] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string } | null>(null);

    // Watchlist
    const [addingToWatchlist, setAddingToWatchlist] = useState(false);
    const [watchlistAdded, setWatchlistAdded] = useState(false);

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
    const openDetails = async (result: TMDBResult) => {
        setSelectedResult(result);
        setMovieDetails(null);
        setTVDetails(null);
        setSelectedSeason(null);
        setEpisodes([]);
        setWatchlistAdded(false);
        setLoadingDetails(true);

        try {
            const res = await fetch(`/api/tmdb-details?id=${result.tmdbId}&type=${result.mediaType}`);
            const data = await res.json();
            if (result.mediaType === 'movie') {
                setMovieDetails(data);
            } else {
                setTVDetails(data);
            }
        } catch (e) {
            console.error('Failed to fetch details', e);
        } finally {
            setLoadingDetails(false);
        }
    };

    // Auto-open details when initialItem is passed from search
    useEffect(() => {
        if (initialItem) {
            openDetails(initialItem);
        }
    }, [initialItem]);

    // Fetch season episodes
    const loadSeason = async (tmdbId: number, seasonNumber: number) => {
        setSelectedSeason(seasonNumber);
        setEpisodes([]);
        setLoadingEpisodes(true);
        try {
            const res = await fetch(`/api/tmdb-details?id=${tmdbId}&type=tv&season=${seasonNumber}`);
            const data = await res.json();
            setEpisodes(data.episodes || []);
        } catch (e) {
            console.error('Failed to load season', e);
        } finally {
            setLoadingEpisodes(false);
        }
    };

    // Add to watchlist
    const addToWatchlist = async (result: TMDBResult) => {
        setAddingToWatchlist(true);
        try {
            await fetch('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result)
            });
            setWatchlistAdded(true);
        } catch { /* ignore */ }
        finally { setAddingToWatchlist(false); }
    };

    const closeDetails = () => {
        setSelectedResult(null);
        setMovieDetails(null);
        setTVDetails(null);
        setSelectedSeason(null);
        setEpisodes([]);
    };

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
                            className="group relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-600 hover:scale-[1.03] transition-all duration-200 text-left cursor-pointer"
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
                                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                                        <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />
                                        <span className="text-[10px] font-bold text-white">{item.rating.toFixed(1)}</span>
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

            {/* ============================================================ */}
            {/* DETAIL MODAL */}
            {/* ============================================================ */}
            {selectedResult && (
                <div className="fixed inset-0 z-50 bg-black/95 flex justify-end" onClick={closeDetails}>
                    <div
                        className="w-full max-w-3xl bg-neutral-900 h-full border-l border-neutral-800 flex flex-col animate-in slide-in-from-right duration-300 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Backdrop header */}
                        <div className="relative h-72 shrink-0">
                            {(selectedResult.backdropPath || selectedResult.posterPath) ? (
                                <img
                                    src={`https://image.tmdb.org/t/p/original${selectedResult.backdropPath || selectedResult.posterPath}`}
                                    className="w-full h-full object-cover opacity-50"
                                    alt=""
                                />
                            ) : (
                                <div className="w-full h-full bg-neutral-800" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent" />

                            <button
                                onClick={closeDetails}
                                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black rounded-full text-white transition z-10"
                            >
                                <X className="w-6 h-6" />
                            </button>

                            <div className="absolute bottom-6 left-8 right-8">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2 py-0.5 bg-neutral-800 rounded text-[10px] uppercase tracking-wide text-neutral-300 border border-neutral-700">
                                        {selectedResult.mediaType === 'movie' ? 'Movie' : 'TV Show'}
                                    </span>
                                    {selectedResult.year && <span className="text-sm text-neutral-400">{selectedResult.year}</span>}
                                    {selectedResult.rating != null && selectedResult.rating > 0 && (
                                        <span className="flex items-center gap-1 text-sm text-green-400 font-semibold">
                                            <Star className="w-3.5 h-3.5 fill-green-400" />
                                            {selectedResult.rating.toFixed(1)}
                                        </span>
                                    )}
                                </div>
                                <h2 className="text-3xl font-bold">{selectedResult.title}</h2>
                            </div>
                        </div>

                        {/* Loading */}
                        {loadingDetails && (
                            <div className="flex-1 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                            </div>
                        )}

                        {/* Movie Details */}
                        {movieDetails && !loadingDetails && (
                            <div className="p-8 flex-1 space-y-6">
                                {/* Action Buttons */}
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => setStreamModal({
                                            tmdbId: selectedResult.tmdbId,
                                            type: 'movie',
                                            title: selectedResult.title
                                        })}
                                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center gap-2 transition text-sm"
                                    >
                                        <Play className="w-5 h-5 fill-white" /> Watch Online
                                    </button>
                                    <button
                                        onClick={() => setTrailerModal({
                                            tmdbId: selectedResult.tmdbId,
                                            mediaType: 'movie',
                                            title: selectedResult.title
                                        })}
                                        className="px-5 py-2.5 bg-neutral-700/80 text-white font-semibold rounded-lg flex items-center gap-2 hover:bg-neutral-600 transition text-sm border border-neutral-600"
                                    >
                                        <Play className="w-4 h-4" /> Trailer
                                    </button>
                                    <button
                                        onClick={() => setDownloadModal({
                                            title: selectedResult.title,
                                            year: selectedResult.year,
                                            mediaType: 'movie',
                                            posterPath: selectedResult.posterPath
                                        })}
                                        className="px-5 py-2.5 bg-amber-600/80 hover:bg-amber-500 text-white font-semibold rounded-lg flex items-center gap-2 transition text-sm border border-amber-500/50"
                                    >
                                        <Download className="w-4 h-4" /> Download
                                    </button>
                                    <button
                                        onClick={() => addToWatchlist(selectedResult)}
                                        disabled={addingToWatchlist || watchlistAdded}
                                        className={`px-5 py-2.5 font-semibold rounded-lg flex items-center gap-2 transition text-sm border ${watchlistAdded
                                            ? 'bg-green-600/20 text-green-400 border-green-500/30'
                                            : 'bg-neutral-700/80 text-white hover:bg-neutral-600 border-neutral-600'
                                            }`}
                                    >
                                        <Bookmark className="w-4 h-4" /> {watchlistAdded ? 'Added' : 'Watchlist'}
                                    </button>
                                </div>

                                {/* Tagline */}
                                {movieDetails.tagline && (
                                    <p className="text-neutral-400 italic text-sm">&quot;{movieDetails.tagline}&quot;</p>
                                )}

                                {/* Overview */}
                                {movieDetails.overview && (
                                    <p className="text-neutral-300 leading-relaxed">{movieDetails.overview}</p>
                                )}

                                {/* Metadata */}
                                <div className="flex flex-wrap gap-4 text-sm text-neutral-400">
                                    {movieDetails.genres && (
                                        <div>
                                            <span className="text-neutral-500 text-xs uppercase tracking-wider">Genres</span>
                                            <p className="text-neutral-200">{movieDetails.genres}</p>
                                        </div>
                                    )}
                                    {movieDetails.runtime && (
                                        <div>
                                            <span className="text-neutral-500 text-xs uppercase tracking-wider">Runtime</span>
                                            <p className="text-neutral-200">{Math.floor(movieDetails.runtime / 60)}h {movieDetails.runtime % 60}m</p>
                                        </div>
                                    )}
                                </div>

                                {/* Cast */}
                                {movieDetails.cast.length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Cast</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {movieDetails.cast.map((c, i) => (
                                                <div key={i} className="flex items-center gap-2 bg-neutral-800 rounded-lg px-3 py-1.5">
                                                    {c.profilePath && (
                                                        <img src={`https://image.tmdb.org/t/p/w45${c.profilePath}`} className="w-6 h-6 rounded-full object-cover" alt="" />
                                                    )}
                                                    <div>
                                                        <div className="text-xs font-medium">{c.name}</div>
                                                        <div className="text-[10px] text-neutral-500">{c.character}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TV Details */}
                        {tvDetails && !loadingDetails && (
                            <div className="p-8 flex-1 space-y-6">
                                {/* Action Buttons */}
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => setStreamModal({
                                            tmdbId: selectedResult.tmdbId,
                                            type: 'tv',
                                            title: `${selectedResult.title} - S1E1`,
                                            season: 1,
                                            episode: 1
                                        })}
                                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center gap-2 transition text-sm"
                                    >
                                        <Play className="w-5 h-5 fill-white" /> Watch Online
                                    </button>
                                    <button
                                        onClick={() => setTrailerModal({
                                            tmdbId: selectedResult.tmdbId,
                                            mediaType: 'tv',
                                            title: selectedResult.title
                                        })}
                                        className="px-5 py-2.5 bg-neutral-700/80 text-white font-semibold rounded-lg flex items-center gap-2 hover:bg-neutral-600 transition text-sm border border-neutral-600"
                                    >
                                        <Play className="w-4 h-4" /> Trailer
                                    </button>
                                    <button
                                        onClick={() => setDownloadModal({
                                            title: selectedResult.title,
                                            year: selectedResult.year,
                                            mediaType: 'tv',
                                            posterPath: selectedResult.posterPath
                                        })}
                                        className="px-5 py-2.5 bg-amber-600/80 hover:bg-amber-500 text-white font-semibold rounded-lg flex items-center gap-2 transition text-sm border border-amber-500/50"
                                    >
                                        <Download className="w-4 h-4" /> Download
                                    </button>
                                    <button
                                        onClick={() => addToWatchlist(selectedResult)}
                                        disabled={addingToWatchlist || watchlistAdded}
                                        className={`px-5 py-2.5 font-semibold rounded-lg flex items-center gap-2 transition text-sm border ${watchlistAdded
                                            ? 'bg-green-600/20 text-green-400 border-green-500/30'
                                            : 'bg-neutral-700/80 text-white hover:bg-neutral-600 border-neutral-600'
                                            }`}
                                    >
                                        <Bookmark className="w-4 h-4" /> {watchlistAdded ? 'Added' : 'Watchlist'}
                                    </button>
                                </div>

                                {/* Tagline */}
                                {tvDetails.tagline && (
                                    <p className="text-neutral-400 italic text-sm">&quot;{tvDetails.tagline}&quot;</p>
                                )}

                                {/* Overview */}
                                {tvDetails.overview && (
                                    <p className="text-neutral-300 leading-relaxed">{tvDetails.overview}</p>
                                )}

                                {/* Metadata */}
                                <div className="flex flex-wrap gap-4 text-sm text-neutral-400">
                                    {tvDetails.genres && (
                                        <div>
                                            <span className="text-neutral-500 text-xs uppercase tracking-wider">Genres</span>
                                            <p className="text-neutral-200">{tvDetails.genres}</p>
                                        </div>
                                    )}
                                    {tvDetails.status && (
                                        <div>
                                            <span className="text-neutral-500 text-xs uppercase tracking-wider">Status</span>
                                            <p className="text-neutral-200">{tvDetails.status}</p>
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-neutral-500 text-xs uppercase tracking-wider">Seasons</span>
                                        <p className="text-neutral-200">{tvDetails.numberOfSeasons}</p>
                                    </div>
                                </div>

                                {/* Cast */}
                                {tvDetails.cast.length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Cast</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {tvDetails.cast.map((c, i) => (
                                                <div key={i} className="flex items-center gap-2 bg-neutral-800 rounded-lg px-3 py-1.5">
                                                    {c.profilePath && (
                                                        <img src={`https://image.tmdb.org/t/p/w45${c.profilePath}`} className="w-6 h-6 rounded-full object-cover" alt="" />
                                                    )}
                                                    <div>
                                                        <div className="text-xs font-medium">{c.name}</div>
                                                        <div className="text-[10px] text-neutral-500">{c.character}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Seasons List */}
                                <div>
                                    <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                        <Tv className="w-3.5 h-3.5" /> Seasons — Pick a season to browse & watch episodes
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {tvDetails.seasons.map((s) => (
                                            <button
                                                key={s.seasonNumber}
                                                onClick={() => loadSeason(selectedResult.tmdbId, s.seasonNumber)}
                                                className={`p-3 rounded-xl text-left transition-all border ${selectedSeason === s.seasonNumber
                                                    ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                                    : 'bg-neutral-800/50 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700'
                                                    }`}
                                            >
                                                <div className="font-semibold text-sm">{s.name}</div>
                                                <div className="text-[11px] text-neutral-500 mt-0.5">{s.episodeCount} episodes</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Episodes */}
                                {selectedSeason !== null && (
                                    <div>
                                        <h3 className="text-sm font-bold text-neutral-300 mb-3 flex items-center gap-2">
                                            <ChevronDown className="w-4 h-4" />
                                            Season {selectedSeason} Episodes
                                        </h3>

                                        {loadingEpisodes && (
                                            <div className="flex justify-center py-8">
                                                <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                                            </div>
                                        )}

                                        {!loadingEpisodes && episodes.length > 0 && (
                                            <div className="space-y-2">
                                                {episodes.map((ep) => (
                                                    <div
                                                        key={ep.episodeNumber}
                                                        className="flex gap-3 p-3 bg-neutral-800/50 hover:bg-neutral-800 rounded-xl transition border border-neutral-800 hover:border-neutral-700 group"
                                                    >
                                                        {/* Episode still */}
                                                        {ep.stillPath ? (
                                                            <div className="w-28 h-16 shrink-0 rounded-lg overflow-hidden bg-neutral-700 relative">
                                                                <img
                                                                    src={`https://image.tmdb.org/t/p/w300${ep.stillPath}`}
                                                                    className="w-full h-full object-cover"
                                                                    alt=""
                                                                    loading="lazy"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="w-28 h-16 shrink-0 rounded-lg bg-neutral-800 flex items-center justify-center">
                                                                <span className="text-lg font-bold text-neutral-600">{ep.episodeNumber}</span>
                                                            </div>
                                                        )}

                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <span className="text-[10px] text-neutral-500 font-medium">E{ep.episodeNumber}</span>
                                                                <p className="text-sm font-medium truncate">{ep.title}</p>
                                                                {ep.rating != null && ep.rating > 0 && (
                                                                    <span className="text-[10px] text-yellow-400 flex items-center gap-0.5">
                                                                        <Star className="w-2.5 h-2.5 fill-yellow-400" />
                                                                        {ep.rating.toFixed(1)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {ep.overview && (
                                                                <p className="text-[11px] text-neutral-500 line-clamp-2">{ep.overview}</p>
                                                            )}
                                                            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-neutral-600">
                                                                {ep.runtime && <span>{ep.runtime}m</span>}
                                                              {ep.airDate && <span>{ep.airDate}</span>}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex flex-col sm:flex-row gap-2 self-center shrink-0">
                                                                <button
                                                                    onClick={() => setStreamModal({
                                                                        tmdbId: selectedResult.tmdbId,
                                                                        type: 'tv',
                                                                        title: `${selectedResult.title} - S${selectedSeason}E${ep.episodeNumber}`,
                                                                        season: selectedSeason,
                                                                        episode: ep.episodeNumber
                                                                    })}
                                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition"
                                                                >
                                                                    <Play className="w-3 h-3 fill-white" /> Watch
                                                                </button>
                                                                <button
                                                                    onClick={() => setDownloadModal({
                                                                        title: `${selectedResult.title} S${String(selectedSeason).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
                                                                        mediaType: 'tv',
                                                                        posterPath: ep.stillPath || selectedResult.posterPath
                                                                    })}
                                                                    className="px-3 py-1.5 bg-neutral-700/80 hover:bg-neutral-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition border border-neutral-600"
                                                                >
                                                                    <Download className="w-3 h-3" /> Download
                                                                </button>
                                                            </div>
                                                        </div>
                                                ))}
                                            </div>
                                        )}

                                        {!loadingEpisodes && episodes.length === 0 && (
                                            <p className="text-neutral-500 text-sm text-center py-4">No episodes found for this season.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Stream Server Modal */}
            {streamModal && (
                <StreamServerModal
                    tmdbId={streamModal.tmdbId}
                    type={streamModal.type}
                    title={streamModal.title}
                    season={streamModal.season}
                    episode={streamModal.episode}
                    onClose={() => setStreamModal(null)}
                />
            )}

            {/* Download Modal */}
            <DownloadModal
                isOpen={downloadModal !== null}
                title={downloadModal?.title || ''}
                year={downloadModal?.year}
                mediaType={downloadModal?.mediaType || 'movie'}
                posterPath={downloadModal?.posterPath}
                onClose={() => setDownloadModal(null)}
            />

            {/* Trailer Modal */}
            <TrailerModal
                isOpen={trailerModal !== null}
                tmdbId={trailerModal?.tmdbId || 0}
                mediaType={trailerModal?.mediaType || 'movie'}
                title={trailerModal?.title || ''}
                onClose={() => setTrailerModal(null)}
            />
        </div>
    );
}
