'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Download, Loader2, X, ArrowDown, Star, Link2, AlertTriangle, Magnet, Folder, Globe, ArrowUpDown, TrendingUp, Film, Tv } from 'lucide-react';

type TrendingItem = {
    tmdbId: number;
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    rating: number | null;
    year: string | null;
    mediaType: 'movie' | 'tv';
    popularity: number;
};

type SortMode = 'seeds' | 'size_asc' | 'size_desc' | 'time_desc';

type TorrentResult = {
    title: string;
    magnet: string;
    size: string;
    sizeBytes: number;
    seeds: number;
    leeches: number;
    quality: string;
    source: string;
    uploadDate?: string;
    uploadTimestamp?: number;
};

export default function TorrentSearchPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<TorrentResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadStarted, setDownloadStarted] = useState<Set<string>>(new Set());
    const [manualMagnet, setManualMagnet] = useState('');
    const [folders, setFolders] = useState<{ id: number; path: string; contentType: string }[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [sortBy, setSortBy] = useState<SortMode>('seeds');
    const inputRef = useRef<HTMLInputElement>(null);

    // Trending state
    const [trendingMovies, setTrendingMovies] = useState<TrendingItem[]>([]);
    const [trendingTv, setTrendingTv] = useState<TrendingItem[]>([]);
    const [trendingTab, setTrendingTab] = useState<'movie' | 'tv'>('movie');
    const [loadingTrending, setLoadingTrending] = useState(true);

    const sortedResults = useMemo(() => {
        const sorted = [...results];
        switch (sortBy) {
            case 'size_asc': return sorted.sort((a, b) => a.sizeBytes - b.sizeBytes);
            case 'size_desc': return sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
            case 'time_desc': return sorted.sort((a, b) => (b.uploadTimestamp || 0) - (a.uploadTimestamp || 0));
            default: return sorted.sort((a, b) => b.seeds - a.seeds);
        }
    }, [results, sortBy]);

    useEffect(() => {
        fetchFolders();
        fetchTrending();
    }, []);

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

    const fetchFolders = async () => {
        try {
            const res = await fetch('/api/folders');
            const data = await res.json();
            const allFolders = data.folders || [];
            setFolders(allFolders);
            if (allFolders.length > 0) setSelectedFolder(allFolders[0].path);
        } catch { /* ignore */ }
    };

    const searchTorrents = async () => {
        if (searchQuery.trim().length < 2) return;

        setSearching(true);
        setError(null);
        setSearched(false);
        try {
            const res = await fetch(`/api/torrent-search?q=${encodeURIComponent(searchQuery.trim())}`);
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setResults(data.results || []);
            }
        } catch {
            setError('Search failed. Please try again.');
        } finally {
            setSearching(false);
            setSearched(true);
        }
    };

    const startDownload = async (magnetUri: string) => {
        setDownloading(magnetUri);
        try {
            const res = await fetch('/api/downloads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnetUri, downloadPath: selectedFolder || undefined })
            });
            const data = await res.json();
            if (data.success) {
                setDownloadStarted(prev => new Set(prev).add(magnetUri));
            } else {
                setError(data.error || 'Download failed');
            }
        } catch {
            setError('Failed to start download');
        } finally {
            setDownloading(null);
        }
    };

    const startManualDownload = async () => {
        const magnet = manualMagnet.trim();
        if (!magnet.startsWith('magnet:')) return;
        await startDownload(magnet);
        setManualMagnet('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') searchTorrents();
    };

    // Quality badge color
    const qualityColor = (q: string) => {
        const ql = q.toLowerCase();
        if (ql.includes('2160') || ql.includes('4k') || ql.includes('uhd')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
        if (ql.includes('1080')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (ql.includes('720')) return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (ql.includes('bluray') || ql.includes('bdrip')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
        return 'bg-neutral-700/50 text-neutral-400 border-neutral-600';
    };

    const isDDL = (result: TorrentResult) => result.source === 'DDL';

    /** Extract format tags (HDR, IMAX, Remux, Atmos, etc.) from a title */
    const extractTags = (title: string): { label: string; className: string }[] => {
        const tags: { label: string; className: string }[] = [];
        if (/\bDOVI\b|\bDV\b|DOLBY[\s.-]?VISION/i.test(title))
            tags.push({ label: 'DV', className: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30' });
        if (/\bHDR10\+|HDR10PLUS/i.test(title))
            tags.push({ label: 'HDR10+', className: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' });
        else if (/\bHDR10\b/i.test(title))
            tags.push({ label: 'HDR10', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' });
        else if (/\bHDR\b/i.test(title))
            tags.push({ label: 'HDR', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' });
        if (/\bIMAX\b/i.test(title))
            tags.push({ label: 'IMAX', className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' });
        if (/\bREMUX\b/i.test(title))
            tags.push({ label: 'Remux', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' });
        if (/\bATMOS\b/i.test(title))
            tags.push({ label: 'Atmos', className: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' });
        if (/\bDTS[\s.-]?HD/i.test(title))
            tags.push({ label: 'DTS-HD', className: 'bg-sky-500/20 text-sky-400 border-sky-500/30' });
        if (/\bTRUEHD\b|\bTRUE[\s.-]?HD\b/i.test(title))
            tags.push({ label: 'TrueHD', className: 'bg-sky-500/20 text-sky-400 border-sky-500/30' });
        if (!tags.some(t => ['DV', 'HDR10+', 'HDR10', 'HDR'].includes(t.label)))
            tags.push({ label: 'SDR', className: 'bg-neutral-600/30 text-neutral-400 border-neutral-600/40' });
        return tags;
    };

    return (
        <div className="pt-24 px-6 md:px-12 pb-20">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <Magnet className="w-8 h-8 text-blue-500" />
                    <h1 className="text-3xl font-bold">Torrent Search</h1>
                </div>
                <p className="text-neutral-400 text-sm">Search for any torrent — movies, TV episodes, anything. Download directly to your library.</p>
            </div>

            {/* Search Bar */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-6">
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search torrents... e.g. Vikings S01E01 2160p, Inception 1080p BluRay"
                            className="w-full bg-black border border-neutral-700 rounded-xl pl-12 pr-10 py-3.5 outline-none focus:border-blue-500 transition text-sm"
                            autoFocus
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); setResults([]); setSearched(false); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-800 rounded-full transition"
                            >
                                <X className="w-4 h-4 text-neutral-500" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={searchTorrents}
                        disabled={searching || searchQuery.trim().length < 2}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 text-white font-semibold rounded-xl flex items-center gap-2 transition"
                    >
                        {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        Search
                    </button>
                </div>

                {/* Search tips */}
                {!searched && !searching && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="text-xs text-neutral-600">Try:</span>
                        {['Vikings S01E01', 'Inception 2010 1080p', 'Breaking Bad S05E16 4K', 'Interstellar BluRay'].map(q => (
                            <button
                                key={q}
                                onClick={() => { setSearchQuery(q); }}
                                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs rounded-lg transition"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Folder Chooser */}
            {folders.length > 0 && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-6">
                    <label className="text-xs text-neutral-400 font-medium flex items-center gap-1.5 mb-2">
                        <Folder className="w-3.5 h-3.5" />
                        Save downloads to:
                    </label>
                    <select
                        value={selectedFolder}
                        onChange={(e) => setSelectedFolder(e.target.value)}
                        className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition"
                    >
                        {folders.map((f) => (
                            <option key={f.id} value={f.path}>
                                {f.path} ({f.contentType})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-600/10 border border-red-500/30 rounded-xl text-red-400 text-sm mb-4">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-600/20 rounded"><X className="w-3.5 h-3.5" /></button>
                </div>
            )}

            {/* Download started toast */}
            {downloadStarted.size > 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-600/10 border border-green-500/30 rounded-xl text-green-400 text-sm mb-4">
                    <Download className="w-4 h-4" />
                    {downloadStarted.size} download{downloadStarted.size > 1 ? 's' : ''} started! Check the Downloads panel (⬇ icon in navbar).
                </div>
            )}

            {/* Searching */}
            {searching && (
                <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                    <p className="text-neutral-400 text-sm">Searching torrents...</p>
                </div>
            )}

            {/* Results */}
            {!searching && searched && results.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-neutral-300">{results.length} results</h2>
                        <div className="flex items-center gap-1">
                            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500 mr-1" />
                            {(['seeds', 'time_desc', 'size_desc', 'size_asc'] as SortMode[]).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setSortBy(mode)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${sortBy === mode
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                                        }`}
                                >
                                    {mode === 'seeds' ? 'Seeds' : mode === 'time_desc' ? 'Time ↓' : mode === 'size_desc' ? 'Size ↓' : 'Size ↑'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {sortedResults.map((result, i) => {
                        const isStarted = downloadStarted.has(result.magnet);
                        return (
                            <div
                                key={i}
                                className="flex items-center gap-4 p-4 bg-neutral-900 hover:bg-neutral-800/80 border border-neutral-800 rounded-xl transition group"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium mb-1.5 break-words" title={result.title}>{result.title}</p>
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${qualityColor(result.quality)}`}>
                                            {result.quality}
                                        </span>
                                        {extractTags(result.title).map((tag, ti) => (
                                            <span key={ti} className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${tag.className}`}>{tag.label}</span>
                                        ))}
                                        <span className="text-neutral-400">{result.size}</span>
                                        {!isDDL(result) && <span className="text-green-500 font-medium">↑ {result.seeds}</span>}
                                        {!isDDL(result) && <span className="text-red-400">↓ {result.leeches}</span>}
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${isDDL(result)
                                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold'
                                            : 'bg-neutral-800 text-neutral-500'
                                            }`}>{isDDL(result) ? '⬇ DDL' : result.source}</span>
                                        {result.uploadDate && <span className="text-neutral-600">{result.uploadDate}</span>}
                                    </div>
                                </div>
                                <button
                                    onClick={() => startDownload(result.magnet)}
                                    disabled={downloading !== null || isStarted}
                                    className={`px-4 py-2.5 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition flex-shrink-0 ${isStarted
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default'
                                        : 'bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-600 text-white'
                                        }`}
                                >
                                    {downloading === result.magnet ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : isStarted ? (
                                        <>✓ Started</>
                                    ) : (
                                        <Download className="w-3.5 h-3.5" />
                                    )}
                                    {!isStarted && downloading !== result.magnet && 'Download'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* No results */}
            {!searching && searched && results.length === 0 && !error && (
                <div className="text-center py-16 bg-neutral-900/50 border border-neutral-800 rounded-2xl">
                    <Search className="w-12 h-12 text-neutral-700 mx-auto mb-3" />
                    <p className="text-neutral-400 text-sm">No torrents found for &quot;{searchQuery}&quot;</p>
                    <p className="text-neutral-600 text-xs mt-1">Try a different search query or paste a magnet link below</p>
                </div>
            )}

            {/* Trending section (shown when no search performed) */}
            {!searching && !searched && (
                <div>
                    {/* Trending header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-red-500" />
                            <h2 className="text-lg font-bold">Trending Now</h2>
                        </div>
                        <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
                            <button
                                onClick={() => setTrendingTab('movie')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${trendingTab === 'movie'
                                    ? 'bg-red-600 text-white'
                                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                                    }`}
                            >
                                <Film className="w-3.5 h-3.5" />
                                Movies
                            </button>
                            <button
                                onClick={() => setTrendingTab('tv')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${trendingTab === 'tv'
                                    ? 'bg-red-600 text-white'
                                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                                    }`}
                            >
                                <Tv className="w-3.5 h-3.5" />
                                TV Shows
                            </button>
                        </div>
                    </div>

                    {/* Trending loading */}
                    {loadingTrending && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                        </div>
                    )}

                    {/* Trending grid */}
                    {!loadingTrending && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                            {(trendingTab === 'movie' ? trendingMovies : trendingTv).map((item) => (
                                <button
                                    key={item.tmdbId}
                                    onClick={() => {
                                        setSearchQuery(item.title);
                                        inputRef.current?.focus();
                                    }}
                                    className="group relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-600 hover:scale-[1.03] transition-all duration-200 text-left cursor-pointer"
                                    title={`Search torrents for "${item.title}"`}
                                >
                                    {/* Poster */}
                                    <div className="aspect-[2/3] relative bg-neutral-800">
                                        {item.posterPath ? (
                                            <img
                                                src={`https://image.tmdb.org/t/p/w300${item.posterPath}`}
                                                alt={item.title}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Film className="w-8 h-8 text-neutral-700" />
                                            </div>
                                        )}
                                        {/* Hover overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end">
                                            <div className="p-2.5 w-full">
                                                <div className="flex items-center gap-1 text-[10px] text-blue-400 font-medium">
                                                    <Search className="w-3 h-3" />
                                                    Search torrents
                                                </div>
                                            </div>
                                        </div>
                                        {/* Rating badge */}
                                        {item.rating !== null && item.rating > 0 && (
                                            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                                                <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />
                                                <span className="text-[10px] font-bold text-white">{item.rating.toFixed(1)}</span>
                                            </div>
                                        )}
                                    </div>
                                    {/* Info */}
                                    <div className="p-2.5">
                                        <p className="text-xs font-medium leading-tight line-clamp-2 mb-1">{item.title}</p>
                                        {item.year && (
                                            <p className="text-[10px] text-neutral-500">{item.year}</p>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Fallback if no trending data */}
                    {!loadingTrending && trendingMovies.length === 0 && trendingTv.length === 0 && (
                        <div className="text-center py-16 bg-neutral-900/50 border border-neutral-800 rounded-2xl">
                            <Magnet className="w-16 h-16 text-neutral-700 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-neutral-400 mb-2">Search for anything</h3>
                            <p className="text-neutral-500 text-sm max-w-md mx-auto">
                                Search for movies, TV episodes, or any content by name. Include quality tags like 1080p or 4K for better results.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Manual Magnet Input */}
            <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Or paste a magnet link directly
                </h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={manualMagnet}
                        onChange={(e) => setManualMagnet(e.target.value)}
                        placeholder="magnet:?xt=urn:btih:..."
                        className="flex-1 bg-black border border-neutral-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition font-mono"
                    />
                    <button
                        onClick={startManualDownload}
                        disabled={!manualMagnet.trim().startsWith('magnet:') || downloading !== null}
                        className="px-5 py-3 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-white font-medium rounded-lg transition flex items-center gap-2"
                    >
                        <ArrowDown className="w-4 h-4" />
                        Download
                    </button>
                </div>
            </div>
        </div>
    );
}
