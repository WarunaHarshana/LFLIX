'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Download, Loader2, Star, ArrowDown, Link2, Film, Tv, AlertTriangle, Magnet, Folder, ArrowUpDown } from 'lucide-react';

type SortMode = 'seeds' | 'size_asc' | 'size_desc';

type TorrentResult = {
    title: string;
    magnet: string;
    size: string;
    sizeBytes: number;
    seeds: number;
    leeches: number;
    quality: string;
    source: string;
};

type ScannedFolder = {
    id: number;
    path: string;
    contentType: string;
};

type Props = {
    isOpen: boolean;
    title: string;
    year?: string | null;
    mediaType: 'movie' | 'tv';
    posterPath?: string | null;
    watchlistId?: number;
    onClose: () => void;
    onDownloadStarted?: () => void;
};

export default function DownloadModal({ isOpen, title, year, mediaType, posterPath, watchlistId, onClose, onDownloadStarted }: Props) {
    const [results, setResults] = useState<TorrentResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [manualMagnet, setManualMagnet] = useState('');
    const [downloadStarted, setDownloadStarted] = useState(false);
    const [folders, setFolders] = useState<ScannedFolder[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [sortBy, setSortBy] = useState<SortMode>('seeds');

    const sortedResults = useMemo(() => {
        const sorted = [...results];
        switch (sortBy) {
            case 'size_asc': return sorted.sort((a, b) => a.sizeBytes - b.sizeBytes);
            case 'size_desc': return sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
            default: return sorted.sort((a, b) => b.seeds - a.seeds);
        }
    }, [results, sortBy]);

    // Fetch folders + auto-search on open
    useEffect(() => {
        if (isOpen && title) {
            fetchFolders();
            searchTorrents();
        }
        return () => {
            setResults([]);
            setSearched(false);
            setError(null);
            setDownloading(null);
            setDownloadStarted(false);
            setManualMagnet('');
        };
    }, [isOpen, title]);

    const fetchFolders = async () => {
        try {
            const res = await fetch('/api/folders');
            const data = await res.json();
            const allFolders = data.folders || [];
            setFolders(allFolders);
            // Auto-select the matching folder type (movies/shows)
            const matching = allFolders.find((f: ScannedFolder) =>
                mediaType === 'movie' ? f.contentType === 'movies' : f.contentType === 'shows'
            );
            setSelectedFolder(matching?.path || allFolders[0]?.path || '');
        } catch { /* ignore */ }
    };

    const searchTorrents = async () => {
        setSearching(true);
        setError(null);
        try {
            const params = new URLSearchParams({ q: title });
            if (year) params.set('year', year);
            if (mediaType) params.set('type', mediaType);
            const res = await fetch(`/api/torrent-search?${params}`);
            const data = await res.json();
            if (data.error) setError(data.error);
            else setResults(data.results || []);
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
            const body: any = { magnetUri, watchlistId };
            if (selectedFolder) body.downloadPath = selectedFolder;
            const res = await fetch('/api/downloads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                setDownloadStarted(true);
                onDownloadStarted?.();
                setTimeout(() => onClose(), 1500);
            } else {
                setError(data.error || 'Download failed');
            }
        } catch {
            setError('Failed to start download');
        } finally {
            setDownloading(null);
        }
    };

    const qualityColor = (q: string) => {
        const ql = q.toLowerCase();
        if (ql.includes('2160') || ql.includes('4k')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
        if (ql.includes('1080')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (ql.includes('720')) return 'bg-green-500/20 text-green-400 border-green-500/30';
        return 'bg-neutral-700/50 text-neutral-400 border-neutral-600';
    };

    const isDDL = (result: TorrentResult) => result.source === 'DDL';

    /** Extract format tags (HDR, IMAX, Remux, Atmos, etc.) from a title */
    const extractTags = (title: string): { label: string; className: string }[] => {
        const t = title.toUpperCase();
        const tags: { label: string; className: string }[] = [];

        // Video format tags
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

        // Audio format tags
        if (/\bATMOS\b/i.test(title))
            tags.push({ label: 'Atmos', className: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' });
        if (/\bDTS[\s.-]?HD/i.test(title))
            tags.push({ label: 'DTS-HD', className: 'bg-sky-500/20 text-sky-400 border-sky-500/30' });
        if (/\bTRUEHD\b|\bTRUE[\s.-]?HD\b/i.test(title))
            tags.push({ label: 'TrueHD', className: 'bg-sky-500/20 text-sky-400 border-sky-500/30' });

        // If no HDR/DV tag found, label as SDR
        if (!tags.some(t => ['DV', 'HDR10+', 'HDR10', 'HDR'].includes(t.label)))
            tags.push({ label: 'SDR', className: 'bg-neutral-600/30 text-neutral-400 border-neutral-600/40' });

        return tags;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl max-h-[85vh] bg-neutral-900 rounded-2xl border border-neutral-700 overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex items-center gap-4 p-5 border-b border-neutral-800">
                    {posterPath && (
                        <img src={`https://image.tmdb.org/t/p/w92${posterPath}`} alt={title} className="w-12 h-16 object-cover rounded-lg" />
                    )}
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold truncate">{title}</h2>
                        <div className="flex items-center gap-2 text-sm text-neutral-400">
                            {mediaType === 'movie' ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                            <span>{mediaType === 'movie' ? 'Movie' : 'TV Show'}</span>
                            {year && <span>• {year}</span>}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Folder Chooser */}
                {folders.length > 0 && (
                    <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-800/30">
                        <label className="text-xs text-neutral-400 font-medium flex items-center gap-1.5 mb-1.5">
                            <Folder className="w-3.5 h-3.5" />
                            Save to library folder:
                        </label>
                        <select
                            value={selectedFolder}
                            onChange={(e) => setSelectedFolder(e.target.value)}
                            className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 transition"
                        >
                            {folders.map((f) => (
                                <option key={f.id} value={f.path}>
                                    {f.path} ({f.contentType})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Download Started Banner */}
                {downloadStarted && (
                    <div className="px-5 py-3 bg-green-600/20 border-b border-green-500/30 flex items-center gap-2 text-green-400 text-sm font-medium">
                        <Download className="w-4 h-4" />
                        Download started! Check the Downloads panel for progress.
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Searching */}
                    {searching && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
                            <p className="text-neutral-400 text-sm">Searching for torrents...</p>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-600/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Results */}
                    {!searching && searched && results.length > 0 && (
                        <>
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-neutral-300">{results.length} torrents found</h3>
                                <div className="flex items-center gap-1">
                                    <ArrowUpDown className="w-3 h-3 text-neutral-500 mr-0.5" />
                                    {(['seeds', 'size_desc', 'size_asc'] as SortMode[]).map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => setSortBy(mode)}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition ${sortBy === mode
                                                    ? 'bg-amber-500 text-black'
                                                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                                                }`}
                                        >
                                            {mode === 'seeds' ? 'Seeds' : mode === 'size_desc' ? 'Size ↓' : 'Size ↑'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                {sortedResults.map((result, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 bg-neutral-800/60 hover:bg-neutral-800 rounded-xl transition">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate mb-1" title={result.title}>{result.title}</p>
                                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${qualityColor(result.quality)}`}>{result.quality}</span>
                                                {extractTags(result.title).map((tag, ti) => (
                                                    <span key={ti} className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${tag.className}`}>{tag.label}</span>
                                                ))}
                                                <span className="text-neutral-400">{result.size}</span>
                                                {!isDDL(result) && <span className="text-green-500">↑{result.seeds}</span>}
                                                {!isDDL(result) && <span className="text-red-400">↓{result.leeches}</span>}
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${isDDL(result)
                                                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold'
                                                    : 'bg-neutral-700/50 text-neutral-500'
                                                    }`}>{isDDL(result) ? '⬇ DDL' : result.source}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => startDownload(result.magnet)}
                                            disabled={downloading !== null}
                                            className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-neutral-600 text-black font-semibold rounded-lg text-xs flex items-center gap-1.5 transition flex-shrink-0"
                                        >
                                            {downloading === result.magnet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                            Download
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* No results */}
                    {!searching && searched && results.length === 0 && !error && (
                        <div className="text-center py-8">
                            <Search className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                            <p className="text-neutral-400 text-sm">No torrents found for &quot;{title}&quot;</p>
                            <p className="text-neutral-600 text-xs mt-1">Paste a magnet link manually below</p>
                        </div>
                    )}

                    {/* Manual magnet */}
                    <div className="border-t border-neutral-800 pt-4">
                        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Link2 className="w-3.5 h-3.5" /> Manual Magnet Link
                        </h3>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={manualMagnet}
                                onChange={(e) => setManualMagnet(e.target.value)}
                                placeholder="magnet:?xt=urn:btih:..."
                                className="flex-1 bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500 transition"
                            />
                            <button
                                onClick={() => manualMagnet.trim() && startDownload(manualMagnet.trim())}
                                disabled={!manualMagnet.trim().startsWith('magnet:') || downloading !== null}
                                className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-white font-medium rounded-lg text-sm transition flex items-center gap-1.5"
                            >
                                <ArrowDown className="w-4 h-4" /> Go
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
