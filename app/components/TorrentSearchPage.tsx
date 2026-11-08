'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
    Search,
    Download,
    Loader2,
    X,
    ArrowDown,
    Link2,
    AlertTriangle,
    Magnet,
    Folder,
    Globe,
    ArrowUpDown,
    TrendingUp,
    Film,
    Tv,
    Cloud,
    CloudUpload,
    Play,
    MonitorPlay,
    Users,
    Gauge,
    Radio,
    Trash2,
    HardDrive
} from 'lucide-react';
import LiquidDropdown from './LiquidDropdown';

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

type TorrentSourceStatus = {
    name: string;
    status: 'ok' | 'timeout' | 'error';
    results: number;
    durationMs: number;
    error?: string;
    cached?: boolean;
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

type StreamFile = {
    index: number;
    name: string;
    length: number;
    isVideo: boolean;
    mimeType: string;
    streamUrl: string;
    localStreamUrl: string;
    nextStreamUrl?: string;
};

type StreamSession = {
    infoHash: string;
    name: string;
    status: 'metadata' | 'ready' | 'streaming' | 'error';
    downloadSpeed: number;
    uploadSpeed: number;
    progress: number;
    numPeers: number;
    totalSize: number;
    downloaded: number;
    selectedFileIndex: number;
    files: StreamFile[];
    streamUrl: string;
    localStreamUrl: string;
    nextStreamUrl?: string;
    errorMessage?: string;
};

type Props = {
    onOpenOnline?: (item: TMDBResult) => void;
    onSwitchToOnline?: () => void;
    initialQuery?: string;
    onPlayStream?: (stream: { url: string; localUrl: string; title: string; fileName?: string }) => void;
    showToast?: (message: string, type: 'success' | 'error') => void;
};

function formatSpeed(bytesPerSec: number): string {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export default function TorrentSearchPage({
    onOpenOnline,
    onSwitchToOnline,
    initialQuery,
    onPlayStream,
    showToast,
}: Props) {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<TorrentResult[]>([]);
    const [sourceStatuses, setSourceStatuses] = useState<TorrentSourceStatus[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadStarted, setDownloadStarted] = useState<Set<string>>(new Set());
    const [manualMagnet, setManualMagnet] = useState('');
    const [folders, setFolders] = useState<{ id: number; path: string; contentType: string }[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [sortBy, setSortBy] = useState<SortMode>('seeds');
    const [resolvingDetails, setResolvingDetails] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [gdriveMode, setGdriveMode] = useState(false);
    const [gdriveAvailable, setGdriveAvailable] = useState(false);
    const [cloudMode, setCloudMode] = useState(false);
    const [cloudAvailable, setCloudAvailable] = useState(false);

    // Streaming state (TorrentPlayer innovation adaptation)
    const [streamingTarget, setStreamingTarget] = useState<string | null>(null);
    const [streamSession, setStreamSession] = useState<StreamSession | null>(null);
    const [streamModalOpen, setStreamModalOpen] = useState(false);
    const [launchingDesktopPlayer, setLaunchingDesktopPlayer] = useState(false);
    const [cacheStats, setCacheStats] = useState<{ totalSizeBytes: number; totalSizeFormatted: string; freeDiskFormatted: string } | null>(null);
    const [clearingCache, setClearingCache] = useState(false);

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

    const sourceIssues = sourceStatuses.filter(source => source.status !== 'ok');

    const fetchCacheStats = async () => {
        try {
            const res = await fetch('/api/torrent-stream/cache');
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setCacheStats({
                        totalSizeBytes: data.totalSizeBytes,
                        totalSizeFormatted: data.totalSizeFormatted,
                        freeDiskFormatted: data.freeDiskFormatted,
                    });
                }
            }
        } catch { /* ignore */ }
    };

    const clearStreamCache = async () => {
        setClearingCache(true);
        try {
            const res = await fetch('/api/torrent-stream/cache', { method: 'DELETE' });
            if (res.ok) {
                showToast?.('Stream cache purged successfully', 'success');
                void fetchCacheStats();
            }
        } catch {
            showToast?.('Failed to clear stream cache', 'error');
        } finally {
            setClearingCache(false);
        }
    };

    useEffect(() => {
        fetchFolders();
        fetchTrending();
        fetchGdrive();
        fetchCloud();
        fetchCacheStats();
    }, []);

    // Polling stream stats while stream modal is open
    useEffect(() => {
        if (!streamModalOpen || !streamSession?.infoHash) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/torrent-stream?infoHash=${encodeURIComponent(streamSession.infoHash)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.stream) {
                        setStreamSession(prev => (prev ? { ...prev, ...data.stream } : data.stream));
                    }
                }
            } catch {
                // ignore polling errors
            }
        }, 1500);

        return () => clearInterval(interval);
    }, [streamModalOpen, streamSession?.infoHash]);

    // Active heartbeat and beforeunload teardown so streams never linger on tab close
    useEffect(() => {
        if (!streamModalOpen || !streamSession?.infoHash) return;
        const hash = streamSession.infoHash;

        const heartbeatTimer = setInterval(() => {
            fetch('/api/torrent-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'heartbeat', infoHash: hash }),
            }).catch(() => {});
        }, 10000);

        const handleBeforeUnload = () => {
            navigator.sendBeacon(
                '/api/torrent-stream',
                new Blob([JSON.stringify({ action: 'stop', infoHash: hash })], { type: 'application/json' })
            );
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            clearInterval(heartbeatTimer);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [streamModalOpen, streamSession?.infoHash]);

    const fetchCloud = async () => {
        try {
            const res = await fetch('/api/cloud');
            const data = await res.json();
            if (data.config?.enabled || data.status?.online || data.status?.configured) {
                setCloudAvailable(true);
                const defaultCloud = localStorage.getItem('lflix-cloud-default');
                if (defaultCloud === 'true') {
                    setCloudMode(true);
                    setGdriveMode(false);
                }
            }
        } catch { /* ignore */ }
    };

    const fetchGdrive = async () => {
        try {
            const res = await fetch('/api/gdrive');
            const data = await res.json();
            if (data.configured && data.enabled) {
                setGdriveAvailable(true);
                const defaultMode = localStorage.getItem('lflix-gdrive-default');
                if (defaultMode === 'true') setGdriveMode(true);
            }
        } catch { /* ignore */ }
    };

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

    const searchAbortRef = useRef<AbortController | null>(null);

    const executeSearch = async (query: string) => {
        if (query.trim().length < 2) return;

        if (searchAbortRef.current) {
            searchAbortRef.current.abort();
        }

        const controller = new AbortController();
        searchAbortRef.current = controller;

        setSearching(true);
        setError(null);
        setSearched(false);
        setResults([]);
        setSourceStatuses([]);

        try {
            const res = await fetch(`/api/torrent-search?q=${encodeURIComponent(query.trim())}`, {
                signal: controller.signal,
            });
            const data = await res.json();
            setSourceStatuses(data.sources || []);
            if (data.error) {
                setError(data.error);
            } else {
                setResults(data.results || []);
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                setError('Search failed. Please try again.');
            }
        } finally {
            if (!controller.signal.aborted) {
                setSearching(false);
                setSearched(true);
            }
        }
    };

    const searchTorrents = async () => {
        await executeSearch(searchQuery);
    };

    useEffect(() => {
        if (!initialQuery || initialQuery.trim().length < 2) return;
        setSearchQuery(initialQuery);
        void executeSearch(initialQuery);
    }, [initialQuery]);

    // --- Torrent Streaming Actions (Instant Seek & Stream) ---
    const startStreaming = async (magnetUri: string, title?: string, fileIndex?: number) => {
        if (!magnetUri || !magnetUri.trim().startsWith('magnet:')) {
            setError('Please provide a valid magnet link');
            return;
        }

        setStreamingTarget(magnetUri);
        setStreamModalOpen(true);
        try {
            const res = await fetch('/api/torrent-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnetUri: magnetUri.trim(), fileIndex }),
            });
            const data = await res.json();
            if (data.success && data.stream) {
                setStreamSession({
                    ...data.stream,
                    name: title || data.stream.name,
                });
            } else {
                setError(data.error || 'Failed to start instant stream');
                setStreamModalOpen(false);
            }
        } catch {
            setError('Failed to connect to torrent streaming service');
            setStreamModalOpen(false);
        } finally {
            setStreamingTarget(null);
        }
    };

    const switchStreamFile = async (newIndex: number) => {
        if (!streamSession) return;
        await startStreaming(`magnet:?xt=urn:btih:${streamSession.infoHash}`, streamSession.name, newIndex);
    };

    const playStreamInBrowser = () => {
        if (!streamSession) return;
        const activeFile = streamSession.files?.[streamSession.selectedFileIndex] || streamSession.files?.[0];
        const preferredBrowserUrl = activeFile?.nextStreamUrl || streamSession.nextStreamUrl || streamSession.localStreamUrl || streamSession.streamUrl;
        if (onPlayStream) {
            onPlayStream({
                url: preferredBrowserUrl,
                localUrl: activeFile?.localStreamUrl || streamSession.localStreamUrl || preferredBrowserUrl,
                title: activeFile?.name ? `${streamSession.name} - ${activeFile.name}` : streamSession.name,
                fileName: activeFile?.name || streamSession.name,
            });
            setStreamModalOpen(false);
        } else {
            window.open(preferredBrowserUrl, '_blank');
        }
    };

    const playStreamOnHostPc = async () => {
        if (!streamSession) return;
        setLaunchingDesktopPlayer(true);
        try {
            const res = await fetch('/api/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    streamUrl: streamSession.localStreamUrl || streamSession.streamUrl,
                    title: streamSession.name,
                }),
            });
            const data = await res.json();
            if (data.success) {
                if (showToast) {
                    showToast(data.message || 'Player launched on Host PC', 'success');
                }
            } else {
                setError(data.error || 'Failed to launch desktop player');
            }
        } catch {
            setError('Failed to communicate with player service');
        } finally {
            setLaunchingDesktopPlayer(false);
        }
    };

    const stopStreamSession = async () => {
        if (!streamSession) {
            setStreamModalOpen(false);
            return;
        }
        const hash = streamSession.infoHash;
        setStreamSession(null);
        setStreamModalOpen(false);
        try {
            await fetch(`/api/torrent-stream?infoHash=${encodeURIComponent(hash)}`, {
                method: 'DELETE',
            });
            void fetchCacheStats();
        } catch { /* ignore */ }
    };

    // --- Standard Downloads ---
    const startDownload = async (magnetUri: string, forceTarget?: 'local' | 'gdrive' | 'cloud') => {
        const isCloud = forceTarget === 'cloud' || (forceTarget === undefined && cloudMode);
        const isDrive = !isCloud && (forceTarget === 'gdrive' || (forceTarget === undefined && gdriveMode));
        const targetMode = isCloud ? 'cloud' : (isDrive ? 'gdrive' : 'local');

        setDownloading(targetMode !== 'local' ? `${magnetUri}:${targetMode}` : magnetUri);
        try {
            const body: any = { magnetUri, target: targetMode };
            if (!isDrive && !isCloud && selectedFolder) {
                body.downloadPath = selectedFolder;
            }
            const res = await fetch('/api/downloads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
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

    const startManualDownload = async (forceTarget?: 'local' | 'gdrive' | 'cloud') => {
        const magnet = manualMagnet.trim();
        if (!magnet.startsWith('magnet:')) return;
        await startDownload(magnet, forceTarget);
        setManualMagnet('');
    };

    const openDetailsByTitle = async (title: string) => {
        if (!onOpenOnline) return;
        setResolvingDetails(title);
        try {
            const res = await fetch(`/api/tmdb-search?q=${encodeURIComponent(title)}&type=multi`);
            const data = await res.json();
            const best = (data.results || [])[0] as TMDBResult | undefined;
            if (!best) {
                setError(`No TMDB match found for "${title}"`);
                return;
            }
            onOpenOnline(best);
        } catch {
            setError('Could not fetch title details');
        } finally {
            setResolvingDetails(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') searchTorrents();
    };

    const qualityColor = (q: string) => {
        const ql = q.toLowerCase();
        if (ql.includes('2160') || ql.includes('4k') || ql.includes('uhd')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
        if (ql.includes('1080')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (ql.includes('720')) return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (ql.includes('bluray') || ql.includes('bdrip')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
        return 'bg-neutral-700/50 text-neutral-400 border-neutral-600';
    };

    const isDDL = (result: TorrentResult) => result.source === 'DDL';

    const sourceBadge = (result: TorrentResult): { label: string; className: string } => {
        const source = result.source.toUpperCase();
        if (source.includes('CINEJOY') || source === 'LFLIX') {
            return { label: 'LFLIX Direct', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' };
        }
        if (source === 'DDL') {
            return { label: '⬇ DDL', className: 'bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold' };
        }
        if (source === 'PSA') {
            return { label: 'PSA', className: 'bg-pink-500/20 text-pink-300 border border-pink-500/40 font-bold' };
        }
        if (source === 'YTS') {
            return { label: 'YTS', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' };
        }
        return { label: result.source, className: 'bg-neutral-800 text-neutral-500' };
    };

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
        <div className="pt-24 px-4 sm:px-6 md:px-12 pb-28 md:pb-20">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-gradient-to-br from-blue-600/30 to-blue-500/10 border border-blue-500/30 rounded-2xl text-blue-400 shadow-lg shadow-blue-500/10">
                        <Magnet className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Torrent Search & Stream</h1>
                        <p className="text-neutral-400 text-sm md:text-base mt-0.5">
                            Search for any torrent. Stream instantly with sub-second random seeking or download to your library.
                        </p>
                    </div>
                </div>
                {cacheStats && (
                    <div className="flex items-center gap-2.5 mt-3">
                        <span className="text-xs px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-neutral-300 flex items-center gap-1.5 shadow-sm">
                            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                            Stream Cache: <strong className="text-white font-semibold">{cacheStats.totalSizeFormatted}</strong>
                            <span className="text-neutral-500">({cacheStats.freeDiskFormatted} free)</span>
                        </span>
                        {cacheStats.totalSizeBytes > 0 && (
                            <button
                                onClick={clearStreamCache}
                                disabled={clearingCache}
                                className="text-xs px-3 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 hover:text-red-200 transition flex items-center gap-1.5 active:scale-95 shadow-sm"
                                title="Purge stream temporary files and free disk space immediately"
                            >
                                <Trash2 className="w-3 h-3" />
                                <span>{clearingCache ? 'Clearing...' : 'Clear Stream Cache'}</span>
                            </button>
                        )}
                    </div>
                )}
                {onSwitchToOnline && (
                    <button
                        onClick={onSwitchToOnline}
                        className="mt-3.5 px-4 py-2 liquid-glass-pill border border-white/15 hover:scale-105 transition-all text-sm text-neutral-200 hover:text-white flex items-center gap-2 shadow-lg"
                    >
                        <Globe className="w-4 h-4 text-blue-400" />
                        <span>Switch to Online</span>
                    </button>
                )}
            </div>

            {/* Search Bar */}
            <div className="liquid-glass-base border border-white/15 rounded-3xl p-4 sm:p-6 mb-6 shadow-2xl relative overflow-hidden">
                <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-blue-500/[0.03] rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col sm:flex-row gap-3 relative z-10">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search torrents... e.g. Vikings S01E01 2160p, Inception 1080p BluRay"
                            className="w-full bg-white/[0.04] border border-white/15 focus:border-blue-400/50 focus:bg-white/[0.08] text-white placeholder-neutral-500 rounded-2xl pl-12 pr-10 py-3.5 outline-none transition-all text-sm md:text-base shadow-inner"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); setResults([]); setSearched(false); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition text-neutral-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={searchTorrents}
                        disabled={searching || searchQuery.trim().length < 2}
                        className="px-6 py-3.5 liquid-btn-primary disabled:opacity-50 text-black font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl hover:scale-105 cursor-pointer text-sm sm:text-base"
                    >
                        {searching ? <Loader2 className="w-5 h-5 animate-spin text-black" /> : <Search className="w-5 h-5 text-black" />}
                        <span>Search</span>
                    </button>
                </div>

                {/* Search tips */}
                {!searched && !searching && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 relative z-10">
                        <span className="text-xs text-neutral-400 font-medium">Try:</span>
                        {['Vikings S01E01', 'Inception 2010 1080p', 'Breaking Bad S05E16 4K', 'Interstellar BluRay'].map(q => (
                            <button
                                key={q}
                                onClick={() => { setSearchQuery(q); executeSearch(q); }}
                                className="px-3 py-1 liquid-glass-pill border border-white/10 hover:border-white/20 text-neutral-300 hover:text-white text-xs rounded-xl transition-all"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Folder Chooser & GDrive / Cloud Toggle */}
            {(folders.length > 0 || gdriveAvailable || cloudAvailable) && (
                <div className="liquid-glass-base border border-white/15 rounded-3xl p-5 mb-6 shadow-xl flex items-center justify-between gap-4">
                    <div className="flex-1">
                        {!gdriveMode && !cloudMode && folders.length > 0 && (
                            <>
                                <label className="text-xs md:text-sm text-neutral-300 font-semibold flex items-center gap-2 mb-2.5">
                                    <Folder className="w-4 h-4 text-blue-400" />
                                    Save downloads to:
                                </label>
                                <LiquidDropdown
                                    label="Select Folder"
                                    title="Destination Folder"
                                    options={folders.map((f) => ({
                                        id: f.path,
                                        name: `${f.path} (${f.contentType})`,
                                    }))}
                                    value={selectedFolder}
                                    onChange={(val) => setSelectedFolder(val)}
                                    className="w-full"
                                    menuWidth="w-full"
                                />
                            </>
                        )}
                        {gdriveMode && (
                            <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl text-blue-300">
                                <Cloud className="w-6 h-6 flex-shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-base font-bold truncate">☁️ Google Drive (Local Rclone)</span>
                                    <span className="text-xs text-blue-400/80 truncate">Mounts to remote drive via local rclone</span>
                                </div>
                            </div>
                        )}
                        {cloudMode && (
                            <div className="flex items-center gap-3 p-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl text-purple-300">
                                <Cloud className="w-6 h-6 flex-shrink-0 text-purple-400" />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-base font-bold truncate">⚡ Cloud-to-Cloud Upload</span>
                                    <span className="text-xs text-purple-400/80 truncate">0 local disk & 0 local bandwidth (Cloud Worker straight to Drive)</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 self-end">
                        {cloudAvailable && (
                            <button
                                onClick={() => {
                                    const newVal = !cloudMode;
                                    setCloudMode(newVal);
                                    if (newVal) setGdriveMode(false);
                                    localStorage.setItem('lflix-cloud-default', newVal ? 'true' : 'false');
                                }}
                                className={`flex flex-col items-center justify-center p-3 sm:px-5 rounded-2xl transition-all shadow-md flex-shrink-0 min-w-[72px] sm:min-w-[84px] h-full ${cloudMode ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold' : 'bg-white/[0.04] text-neutral-400 border border-white/10 hover:bg-white/10'}`}
                                title="Cloud-to-Cloud: Download in cloud container directly to Google Drive"
                            >
                                <Cloud className="w-6 h-6 mb-1 text-purple-400" />
                                <span className="text-xs uppercase tracking-wider font-semibold">Cloud</span>
                            </button>
                        )}
                        {gdriveAvailable && (
                            <button
                                onClick={() => {
                                    const newVal = !gdriveMode;
                                    setGdriveMode(newVal);
                                    if (newVal) setCloudMode(false);
                                    localStorage.setItem('lflix-gdrive-default', newVal ? 'true' : 'false');
                                }}
                                className={`flex flex-col items-center justify-center p-3 sm:px-5 rounded-2xl transition-all shadow-md flex-shrink-0 min-w-[72px] sm:min-w-[84px] h-full ${gdriveMode ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold' : 'bg-white/[0.04] text-neutral-400 border border-white/10 hover:bg-white/10'}`}
                                title="Local Google Drive: Download directly into mounted Z:\ drive"
                            >
                                <Cloud className="w-6 h-6 mb-1 text-blue-400" />
                                <span className="text-xs uppercase tracking-wider font-semibold">GDrive</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-600/10 border border-red-500/30 rounded-2xl text-red-400 text-sm mb-4">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-600/20 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                </div>
            )}

            {/* Download started toast */}
            {downloadStarted.size > 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-600/10 border border-green-500/30 rounded-2xl text-green-400 text-sm mb-4">
                    <Download className="w-4 h-4" />
                    {downloadStarted.size} download{downloadStarted.size > 1 ? 's' : ''} started! Check the Downloads panel (⬇ icon in navbar).
                </div>
            )}

            {/* Source status */}
            {!searching && searched && sourceStatuses.length > 0 && (
                <div className={`flex flex-wrap items-center gap-2 p-3 border rounded-2xl text-xs mb-4 ${sourceIssues.length > 0
                    ? 'bg-yellow-600/10 border-yellow-500/30 text-yellow-300'
                    : 'liquid-glass-base border border-white/10 text-neutral-400'
                    }`}>
                    {sourceIssues.length > 0 && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                    {sourceStatuses.map(source => (
                        <span
                            key={source.name}
                            title={source.error || `${source.durationMs}ms`}
                            className={`px-2.5 py-1 rounded-xl border ${source.status === 'ok'
                                ? 'bg-white/[0.05] border-white/15 text-neutral-200'
                                : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                                }`}
                        >
                            {source.name} {source.status === 'ok' ? source.results : source.status}
                        </span>
                    ))}
                    {sourceStatuses.some(source => source.cached) && (
                        <span className="px-2.5 py-1 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300">cached</span>
                    )}
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
                <div className="space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                        <h2 className="text-sm md:text-base font-bold text-neutral-200">{results.length} results</h2>
                        <div className="flex items-center gap-1 sm:gap-1.5 liquid-glass-pill p-1 border border-white/10 rounded-xl overflow-x-auto max-w-full scrollbar-none">
                            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 mr-1 ml-1 flex-shrink-0" />
                            {(['seeds', 'time_desc', 'size_desc', 'size_asc'] as SortMode[]).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setSortBy(mode)}
                                    className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${sortBy === mode
                                        ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                                        : 'text-neutral-300 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    {mode === 'seeds' ? 'Seeds' : mode === 'time_desc' ? 'Time ↓' : mode === 'size_desc' ? 'Size ↓' : 'Size ↑'}
                                </button>
                            ))}
                        </div>
                    </div>
                    {sortedResults.map((result, i) => {
                        const isStarted = downloadStarted.has(result.magnet);
                        const source = sourceBadge(result);
                        const isStreaming = streamingTarget === result.magnet;
                        return (
                            <div
                                key={i}
                                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 liquid-glass-base border border-white/10 hover:border-white/25 rounded-2xl transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_15px_rgba(255,255,255,0.04)] group"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm md:text-base font-semibold mb-1.5 break-words group-hover:text-white transition-colors" title={result.title}>{result.title}</p>
                                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
                                        <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${qualityColor(result.quality)}`}>
                                            {result.quality}
                                        </span>
                                        {extractTags(result.title).map((tag, ti) => (
                                            <span key={ti} className={`px-1.5 py-0.5 rounded-lg border text-[10px] font-bold ${tag.className}`}>{tag.label}</span>
                                        ))}
                                        <span className="text-neutral-300 font-medium">{result.size}</span>
                                        {!isDDL(result) && <span className="text-green-400 font-semibold">↑ {result.seeds}</span>}
                                        {!isDDL(result) && <span className="text-red-400">↓ {result.leeches}</span>}
                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${source.className}`}>{source.label}</span>
                                        {result.uploadDate && <span className="text-neutral-500">{result.uploadDate}</span>}
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end pt-1 sm:pt-0">
                                    {/* ⚡ Instant Stream Button (TorrentPlayer Feature) */}
                                    {!isDDL(result) && result.magnet.startsWith('magnet:') && (
                                        <button
                                            onClick={() => startStreaming(result.magnet, result.title)}
                                            disabled={streamingTarget !== null}
                                            className="flex-1 sm:flex-initial justify-center px-4 py-2.5 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer min-h-[38px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-lg shadow-orange-500/20 hover:scale-105"
                                            title="Stream immediately with instant random seeking without waiting for full download"
                                        >
                                            {isStreaming ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                                            ) : (
                                                <Play className="w-3.5 h-3.5 fill-black text-black" />
                                            )}
                                            <span>⚡ Stream</span>
                                        </button>
                                    )}

                                    <button
                                        onClick={() => openDetailsByTitle(result.title)}
                                        disabled={downloading !== null || resolvingDetails !== null}
                                        className="flex-1 sm:flex-initial justify-center px-3.5 py-2.5 liquid-glass-pill border border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-600/30 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all flex-shrink-0 min-h-[38px]"
                                    >
                                        {resolvingDetails === result.title ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                                        Details
                                    </button>

                                    <button
                                        onClick={() => startDownload(result.magnet)}
                                        disabled={downloading !== null || isStarted}
                                        className={`flex-1 sm:flex-initial justify-center px-3.5 py-2.5 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer min-h-[38px] ${isStarted
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default'
                                            : 'liquid-btn-primary shadow-md hover:scale-105'
                                            }`}
                                        title="Download to local library"
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

                                    <button
                                        onClick={() => startDownload(result.magnet, 'gdrive')}
                                        disabled={downloading !== null || isStarted}
                                        className="flex-1 sm:flex-initial justify-center px-3 py-2.5 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer min-h-[38px] bg-blue-600/85 hover:bg-blue-600 text-white shadow-md shadow-blue-500/15 hover:shadow-blue-500/30 hover:scale-105 border border-blue-400/30 disabled:opacity-50"
                                        title="Download torrent to Google Drive via local Rclone"
                                    >
                                        {downloading === `${result.magnet}:gdrive` ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <CloudUpload className="w-3.5 h-3.5" />
                                        )}
                                        <span>Drive</span>
                                    </button>

                                    {cloudAvailable && (
                                        <button
                                            onClick={() => startDownload(result.magnet, 'cloud')}
                                            disabled={downloading !== null || isStarted}
                                            className="flex-1 sm:flex-initial justify-center px-3 py-2.5 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer min-h-[38px] bg-purple-600/85 hover:bg-purple-600 text-white shadow-md shadow-purple-500/15 hover:shadow-purple-500/30 hover:scale-105 border border-purple-400/30 disabled:opacity-50"
                                            title="Cloud-to-Cloud: Download in cloud container directly to Drive (0 local disk/network)"
                                        >
                                            {downloading === `${result.magnet}:cloud` ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Cloud className="w-3.5 h-3.5" />
                                            )}
                                            <span>Cloud</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* No results */}
            {!searching && searched && results.length === 0 && !error && (
                <div className="text-center py-16 liquid-glass-base border border-white/10 rounded-3xl shadow-xl">
                    <Search className="w-12 h-12 text-neutral-500 mx-auto mb-3" />
                    <p className="text-neutral-300 text-sm md:text-base font-semibold">No torrents found for &quot;{searchQuery}&quot;</p>
                    <p className="text-neutral-500 text-xs md:text-sm mt-1">Try a different search query or paste a magnet link below</p>
                </div>
            )}

            {/* Trending section (shown when no search performed) */}
            {!searching && !searched && (
                <div>
                    {/* Trending header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-red-500" />
                            <h2 className="text-lg md:text-xl font-bold tracking-tight">Trending Now</h2>
                        </div>
                        <div className="flex items-center gap-1 liquid-glass-pill p-1 border border-white/10">
                            <button
                                onClick={() => setTrendingTab('movie')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${trendingTab === 'movie'
                                    ? 'liquid-glass-pill-active shadow-md text-white'
                                    : 'text-neutral-300 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Film className="w-3.5 h-3.5" />
                                Movies
                            </button>
                            <button
                                onClick={() => setTrendingTab('tv')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${trendingTab === 'tv'
                                    ? 'liquid-glass-pill-active shadow-md text-white'
                                    : 'text-neutral-300 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Tv className="w-3.5 h-3.5" />
                                TV Shows
                            </button>
                        </div>
                    </div>

                    {/* Trending Grid */}
                    {loadingTrending ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="aspect-[2/3] rounded-2xl bg-white/[0.04] animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {(trendingTab === 'movie' ? trendingMovies : trendingTv).map(item => (
                                <div
                                    key={item.tmdbId}
                                    onClick={() => {
                                        const q = item.year ? `${item.title} ${item.year}` : item.title;
                                        setSearchQuery(q);
                                        executeSearch(q);
                                    }}
                                    className="group relative cursor-pointer rounded-2xl overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:scale-[1.03] hover:shadow-xl bg-neutral-900/40"
                                >
                                    <div className="aspect-[2/3] bg-neutral-800 relative">
                                        {item.posterPath ? (
                                            <img
                                                src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                                                alt={item.title}
                                                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-neutral-600">
                                                <Film className="w-8 h-8" />
                                            </div>
                                        )}
                                        {item.rating && (
                                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[11px] font-bold text-amber-400">
                                                ★ {item.rating.toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-2.5">
                                        <p className="text-xs md:text-sm font-semibold leading-tight line-clamp-2 mb-1 group-hover:text-white transition-colors">{item.title}</p>
                                        {item.year && (
                                            <p className="text-[10px] md:text-xs text-neutral-400 font-medium">{item.year}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Manual Magnet Input */}
            <div className="mt-8 liquid-glass-base border border-white/15 rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/[0.02] rounded-full blur-3xl pointer-events-none" />
                <h3 className="text-xs md:text-sm font-bold text-neutral-300 uppercase tracking-wider mb-3 flex items-center gap-2 relative z-10">
                    <Link2 className="w-4 h-4 text-blue-400" />
                    Or paste a magnet link directly
                </h3>
                <div className="flex flex-col sm:flex-row gap-3 relative z-10">
                    <input
                        type="text"
                        value={manualMagnet}
                        onChange={(e) => setManualMagnet(e.target.value)}
                        placeholder="magnet:?xt=urn:btih:..."
                        className="flex-1 bg-white/[0.04] border border-white/15 focus:border-blue-400/50 focus:bg-white/[0.08] rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all font-mono shadow-inner"
                    />

                    {/* Instant Stream Magnet button */}
                    <button
                        onClick={() => startStreaming(manualMagnet.trim(), 'Magnet Stream')}
                        disabled={!manualMagnet.trim().startsWith('magnet:') || streamingTarget !== null}
                        className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                        title="Stream magnet instantly"
                    >
                        <Play className="w-4 h-4 fill-black text-black" />
                        <span>⚡ Stream</span>
                    </button>

                    <button
                        onClick={() => startManualDownload('local')}
                        disabled={!manualMagnet.trim().startsWith('magnet:') || downloading !== null}
                        className="px-5 py-3 liquid-glass-pill hover:scale-105 border border-white/20 disabled:opacity-40 disabled:hover:scale-100 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg"
                        title="Download magnet to local library folder"
                    >
                        <ArrowDown className="w-4 h-4 text-blue-400" />
                        <span>Download</span>
                    </button>
                    {gdriveAvailable && (
                        <button
                            onClick={() => startManualDownload('gdrive')}
                            disabled={!manualMagnet.trim().startsWith('magnet:') || downloading !== null}
                            className="px-5 py-3 bg-blue-600/85 hover:bg-blue-600 border border-blue-400/30 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/15 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                            title="Download magnet directly to Google Drive via local Rclone"
                        >
                            <CloudUpload className="w-4 h-4" />
                            <span>To Drive</span>
                        </button>
                    )}
                    {cloudAvailable && (
                        <button
                            onClick={() => startManualDownload('cloud')}
                            disabled={!manualMagnet.trim().startsWith('magnet:') || downloading !== null}
                            className="px-5 py-3 bg-purple-600/85 hover:bg-purple-600 border border-purple-400/30 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/15 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                            title="Cloud-to-Cloud: Download magnet straight to Google Drive via Cloud Worker"
                        >
                            <Cloud className="w-4 h-4 text-purple-300" />
                            <span>To Cloud</span>
                        </button>
                    )}
                </div>
            </div>

            {/* --- TorrentPlayer Stream Control Modal --- */}
            {streamModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="liquid-glass-base border border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl relative overflow-hidden">
                        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl">
                                    <Radio className="w-6 h-6 animate-pulse" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white leading-tight">Instant Torrent Stream</h3>
                                    <p className="text-xs text-amber-400 font-medium">Powered by Swarm Playhead Streaming</p>
                                </div>
                            </div>
                            <button
                                onClick={stopStreamSession}
                                className="p-2 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition"
                                title="Close & Stop Stream"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {streamSession ? (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-sm font-semibold text-neutral-200 break-words mb-1">
                                        {streamSession.name}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                                        <span>Total Size: {formatBytes(streamSession.totalSize)}</span>
                                        <span className="text-neutral-600">•</span>
                                        <span>Buffered: {formatBytes(streamSession.downloaded)}</span>
                                        {cacheStats && (
                                            <>
                                                <span className="text-neutral-600">•</span>
                                                <span className="text-amber-400 font-medium">Free Space: {cacheStats.freeDiskFormatted}</span>
                                            </>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-neutral-500 mt-1">
                                        On-demand stream buffers playback pieces only (does not download the entire movie). Cache is automatically cleaned when closed.
                                    </p>
                                </div>

                                {/* Live Swarm Telemetry */}
                                <div className="grid grid-cols-3 gap-2 p-3 bg-white/[0.03] border border-white/10 rounded-2xl text-center">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="flex items-center gap-1 text-xs text-neutral-400 mb-0.5">
                                            <Gauge className="w-3.5 h-3.5 text-amber-400" />
                                            <span>Speed</span>
                                        </div>
                                        <span className="text-sm font-bold text-white">
                                            {formatSpeed(streamSession.downloadSpeed)}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-center justify-center border-x border-white/10">
                                        <div className="flex items-center gap-1 text-xs text-neutral-400 mb-0.5">
                                            <Users className="w-3.5 h-3.5 text-blue-400" />
                                            <span>Peers</span>
                                        </div>
                                        <span className="text-sm font-bold text-white">
                                            {streamSession.numPeers} connected
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="flex items-center gap-1 text-xs text-neutral-400 mb-0.5">
                                            <Radio className="w-3.5 h-3.5 text-green-400" />
                                            <span>Buffered</span>
                                        </div>
                                        <span className="text-sm font-bold text-white">
                                            {(streamSession.progress * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>

                                {/* Multi-file selector (if torrent has multiple videos) */}
                                {streamSession.files && streamSession.files.filter(f => f.isVideo).length > 1 && (
                                    <div>
                                        <label className="text-xs text-neutral-300 font-semibold mb-1.5 block">
                                            Select Video Track / Episode:
                                        </label>
                                        <select
                                            value={streamSession.selectedFileIndex}
                                            onChange={(e) => switchStreamFile(Number(e.target.value))}
                                            className="w-full bg-neutral-900 border border-white/15 text-white rounded-xl p-2.5 text-xs outline-none focus:border-amber-400"
                                        >
                                            {streamSession.files
                                                .filter(f => f.isVideo)
                                                .map(file => (
                                                    <option key={file.index} value={file.index}>
                                                        {file.name} ({formatBytes(file.length)})
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                    <button
                                        onClick={playStreamInBrowser}
                                        className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 hover:scale-[1.02] transition"
                                    >
                                        <Play className="w-4 h-4 fill-black" />
                                        <span>Play in Browser</span>
                                    </button>

                                    <button
                                        onClick={playStreamOnHostPc}
                                        disabled={launchingDesktopPlayer}
                                        className="flex-1 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition"
                                        title="Play in desktop MPV / VLC player on Host PC"
                                    >
                                        {launchingDesktopPlayer ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <MonitorPlay className="w-4 h-4 text-amber-400" />
                                        )}
                                        <span>Play in MPV / VLC</span>
                                    </button>
                                </div>

                                <div className="flex items-center justify-between pt-1">
                                    <button
                                        onClick={() => {
                                            if (streamSession?.infoHash) {
                                                void startDownload(`magnet:?xt=urn:btih:${streamSession.infoHash}`);
                                                setStreamModalOpen(false);
                                            }
                                        }}
                                        className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition"
                                    >
                                        <Download className="w-3.5 h-3.5 text-neutral-500" />
                                        <span>Save full torrent to library in background</span>
                                    </button>

                                    <button
                                        onClick={stopStreamSession}
                                        className="text-xs text-red-400 hover:text-red-300 font-semibold transition"
                                    >
                                        Stop Stream
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                                <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
                                <p className="text-sm font-semibold text-white">Connecting to BitTorrent Swarm...</p>
                                <p className="text-xs text-neutral-400 max-w-sm">
                                    Fetching metadata and pre-buffering container headers for instant playback.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
