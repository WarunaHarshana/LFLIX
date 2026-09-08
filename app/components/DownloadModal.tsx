'use client';

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { X, Search, Download, Loader2, Star, ArrowDown, Link2, Film, Tv, AlertTriangle, Magnet, Folder, ArrowUpDown, Zap, Copy, Check, ExternalLink } from 'lucide-react';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';

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

type DirectDownloadItem = {
    source: string;
    name: string;
    quality: number;
    qualityLabel: string;
    qualityTags: string[];
    size: string;
    sizeBytes: number;
    url: string;
    provider: string;
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
    tmdbId?: number;
    season?: number;
    episode?: number;
    onClose: () => void;
    onDownloadStarted?: () => void;
};

function isDDL(result: TorrentResult): boolean {
    return result.source === 'DDL' || result.magnet.startsWith('http-direct:');
}

function qualityColor(q: string): string {
    const ql = q.toLowerCase();
    if (ql.includes('2160') || ql.includes('4k')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (ql.includes('1080')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (ql.includes('720')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    return 'bg-neutral-700/50 text-neutral-400 border-neutral-600';
}

function sourceBadge(result: TorrentResult): { label: string; className: string } {
    const source = result.source.toUpperCase();
    if (source === 'DDL') {
        return { label: '⚡ Direct DDL', className: 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold' };
    }
    if (source === 'PSA') {
        return { label: 'PSA', className: 'bg-pink-500/20 text-pink-300 border border-pink-500/40 font-bold' };
    }
    if (source === 'YTS') {
        return { label: 'YTS', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' };
    }
    return { label: result.source, className: 'bg-neutral-700/50 text-neutral-500' };
}

/** Extract format tags (HDR, IMAX, Remux, Atmos, etc.) from a title */
function extractTags(title: string): { label: string; className: string }[] {
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
}

export default function DownloadModal({ isOpen, title, year, mediaType, posterPath, watchlistId, tmdbId, season, episode, onClose, onDownloadStarted }: Props) {
    const modalRef = useModalBehavior(isOpen, onClose, { trapFocus: true });

    const [results, setResults] = useState<TorrentResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [activeTab, setActiveTab] = useState<'direct' | 'torrents'>('direct');
    const [directDownloads, setDirectDownloads] = useState<DirectDownloadItem[]>([]);
    const [searchingDirect, setSearchingDirect] = useState(false);
    const [searchedDirect, setSearchedDirect] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [manualMagnet, setManualMagnet] = useState('');
    const [downloadStarted, setDownloadStarted] = useState(false);
    const [folders, setFolders] = useState<ScannedFolder[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [sortBy, setSortBy] = useState<SortMode>('seeds');

    const pureTorrentResults = useMemo(() => {
        return results.filter((r) => !isDDL(r));
    }, [results]);

    const sortedResults = useMemo(() => {
        const sorted = [...pureTorrentResults];
        switch (sortBy) {
            case 'size_asc': return sorted.sort((a, b) => a.sizeBytes - b.sizeBytes);
            case 'size_desc': return sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
            default: return sorted.sort((a, b) => b.seeds - a.seeds);
        }
    }, [pureTorrentResults, sortBy]);

    // Fetch folders + auto-search on open
    useEffect(() => {
        if (isOpen && title) {
            fetchFolders();
            searchTorrents();
            searchDirect();
        }
        return () => {
            setResults([]);
            setDirectDownloads([]);
            setSearched(false);
            setSearchedDirect(false);
            setError(null);
            setDownloading(null);
            setDownloadStarted(false);
            setManualMagnet('');
            setCopiedUrl(null);
            setActiveTab('direct');
        };
    }, [isOpen, title, tmdbId, season, episode]);

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
            if (mediaType === 'movie') params.set('goodOnly', '1');
            if (tmdbId) params.set('tmdbId', String(tmdbId));
            if (season) params.set('season', String(season));
            if (episode) params.set('episode', String(episode));
            const res = await fetch(`/api/torrent-search?${params}`);
            const data = await res.json();
            if (data.error) setError(data.error);
            else {
                const torrentList: TorrentResult[] = data.results || [];
                setResults(torrentList);

                // Convert any DDL / http-direct results into DirectDownloadItems and merge into directDownloads
                const ddlItems: DirectDownloadItem[] = torrentList
                    .filter(isDDL)
                    .map((r) => {
                        const rawUrl = r.magnet.replace(/^http-direct:/, '');
                        return {
                            source: 'Direct DDL',
                            name: r.title,
                            quality: parseInt(r.quality, 10) || 1080,
                            qualityLabel: r.quality || 'HD',
                            qualityTags: extractTags(r.title).map((t) => t.label).filter((t) => t !== 'SDR'),
                            size: r.size,
                            sizeBytes: r.sizeBytes,
                            url: rawUrl,
                            provider: 'ddl',
                        };
                    });

                if (ddlItems.length > 0) {
                    setDirectDownloads((prev) => {
                        const existingUrls = new Set(prev.map((p) => p.url));
                        const merged = [...prev];
                        for (const item of ddlItems) {
                            if (!existingUrls.has(item.url)) {
                                existingUrls.add(item.url);
                                merged.push(item);
                            }
                        }
                        return merged;
                    });
                }
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

    const searchDirect = async () => {
        setSearchingDirect(true);
        try {
            const params = new URLSearchParams();
            if (tmdbId) params.set('tmdbId', String(tmdbId));
            params.set('type', mediaType);
            if (title) {
                params.set('q', title);
                params.set('title', title);
            }
            if (year) params.set('year', String(year));
            if (season) params.set('season', String(season));
            if (episode) params.set('episode', String(episode));

            const res = await fetch(`/api/direct-downloads?${params.toString()}`);
            const data = await res.json();
            if (data.success && Array.isArray(data.downloads)) {
                setDirectDownloads((prev) => {
                    const existingUrls = new Set(data.downloads.map((d: DirectDownloadItem) => d.url));
                    const previousNonDuplicates = prev.filter((p) => !existingUrls.has(p.url));
                    return [...data.downloads, ...previousNonDuplicates];
                });
                if (data.downloads.length > 0) {
                    setActiveTab('direct');
                }
            }
        } catch {
            // Keep any existing merged DDL downloads
        } finally {
            setSearchingDirect(false);
            setSearchedDirect(true);
        }
    };

    const startDirectDownload = async (item: DirectDownloadItem) => {
        setDownloading(item.url);
        try {
            let cleanFilename = '';
            const isJunkName = !item.name ||
                /cinejoy/i.test(item.name) ||
                /fsl\s*server/i.test(item.name) ||
                /^4k\s*\[/i.test(item.name);

            if (!isJunkName) {
                cleanFilename = item.name.endsWith('.mkv') || item.name.endsWith('.mp4')
                    ? item.name
                    : `${item.name}.mkv`;
            } else {
                if (mediaType === 'tv' && season && episode) {
                    cleanFilename = `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} [${item.qualityLabel || '1080p'}].mkv`;
                } else {
                    cleanFilename = `${title}${year ? ` (${year})` : ''} [${item.qualityLabel || '1080p'}].mkv`;
                }
            }

            const body: any = {
                httpUrl: item.url,
                watchlistId,
                filename: cleanFilename,
            };
            if (selectedFolder) body.downloadPath = selectedFolder;
            const res = await fetch('/api/downloads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
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

    const copyLink = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopiedUrl(url);
            setTimeout(() => setCopiedUrl(null), 2500);
        } catch {
            /* ignore */
        }
    };

    if (!isOpen) return null;

    return (
        <div ref={modalRef as React.RefObject<HTMLDivElement>} role="dialog" aria-modal="true" aria-label="Download options" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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

                {/* Tabs: Direct Downloads vs Torrents */}
                <div className="flex items-center gap-2 px-5 pt-3 border-b border-neutral-800 bg-neutral-900/50">
                    <button
                        type="button"
                        onClick={() => setActiveTab('direct')}
                        className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 transition ${
                            activeTab === 'direct'
                                ? 'border-amber-500 text-amber-400'
                                : 'border-transparent text-neutral-400 hover:text-neutral-200'
                        }`}
                    >
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Direct Downloads</span>
                        {searchingDirect ? (
                            <Loader2 className="w-3 h-3 animate-spin ml-1 text-amber-500" />
                        ) : directDownloads.length > 0 ? (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                                {directDownloads.length}
                            </span>
                        ) : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('torrents')}
                        className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-1.5 transition ${
                            activeTab === 'torrents'
                                ? 'border-amber-500 text-amber-400'
                                : 'border-transparent text-neutral-400 hover:text-neutral-200'
                        }`}
                    >
                        <Magnet className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Torrents</span>
                        {searching ? (
                            <Loader2 className="w-3 h-3 animate-spin ml-1 text-neutral-500" />
                        ) : pureTorrentResults.length > 0 ? (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[10px] font-bold border border-neutral-700">
                                {pureTorrentResults.length}
                            </span>
                        ) : null}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-600/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {activeTab === 'direct' ? (
                        <>
                            {/* Direct searching */}
                            {searchingDirect && (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
                                    <p className="text-neutral-400 text-sm">Searching direct high-speed streams...</p>
                                </div>
                            )}

                            {/* Direct Results */}
                            {!searchingDirect && directDownloads.length > 0 && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                                            {directDownloads.length} direct stream{directDownloads.length === 1 ? '' : 's'} available
                                        </h3>
                                        <span className="text-[11px] text-neutral-500">
                                            Instant HTTP • 0 seeds needed
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {directDownloads.map((item, i) => (
                                            <div
                                                key={i}
                                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-neutral-800/60 hover:bg-neutral-800/90 rounded-xl transition border border-neutral-700/40"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${qualityColor(item.qualityLabel)}`}>
                                                            {item.qualityLabel}
                                                        </span>
                                                        {item.size && (
                                                            <span className="text-xs font-semibold text-neutral-200">
                                                                {item.size}
                                                            </span>
                                                        )}
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                                                            ⚡ Fast Direct
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-medium truncate text-neutral-200" title={item.name}>
                                                        {item.name}
                                                    </p>
                                                    {item.qualityTags && item.qualityTags.length > 0 && (
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                            {item.qualityTags.map((tag, ti) => (
                                                                <span key={ti} className="px-1.5 py-0.5 rounded bg-neutral-700/60 text-neutral-300 text-[10px]">
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => copyLink(item.url)}
                                                        className="px-2.5 py-2 bg-neutral-700/80 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs transition border border-neutral-600/50 flex items-center gap-1.5"
                                                        title="Copy direct download link"
                                                        aria-label="Copy direct download link"
                                                    >
                                                        {copiedUrl === item.url ? (
                                                            <>
                                                                <Check className="w-3.5 h-3.5 text-green-400" />
                                                                <span className="text-[11px] text-green-400 font-medium">Copied</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy className="w-3.5 h-3.5" />
                                                                <span className="text-[11px]">Copy</span>
                                                            </>
                                                        )}
                                                    </button>

                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        download
                                                        className="px-2.5 py-2 bg-neutral-700/80 hover:bg-neutral-700 text-white font-medium rounded-lg text-xs flex items-center gap-1.5 transition border border-neutral-600/50"
                                                        title="Download directly in browser"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                        <span className="text-[11px] hidden sm:inline">Browser</span>
                                                    </a>

                                                    <button
                                                        type="button"
                                                        onClick={() => startDirectDownload(item)}
                                                        disabled={downloading !== null}
                                                        className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-neutral-600 text-black font-semibold rounded-lg text-xs flex items-center gap-1.5 transition flex-shrink-0"
                                                        title="Download directly to library folder"
                                                    >
                                                        {downloading === item.url ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                        <span>Save to Library</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {/* No direct results */}
                            {!searchingDirect && searchedDirect && directDownloads.length === 0 && (
                                <div className="text-center py-10">
                                    <Zap className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                                    <p className="text-neutral-400 text-sm">No direct downloads available for &quot;{title}&quot;</p>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('torrents')}
                                        className="mt-3 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition"
                                    >
                                        Switch to Torrents ({pureTorrentResults.length})
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Torrent searching */}
                            {searching && (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
                                    <p className="text-neutral-400 text-sm">Searching for torrents...</p>
                                </div>
                            )}

                            {/* Torrent Results */}
                            {!searching && searched && pureTorrentResults.length > 0 && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-neutral-300">{pureTorrentResults.length} torrent{pureTorrentResults.length === 1 ? '' : 's'} found</h3>
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
                                        {sortedResults.map((result, i) => {
                                            const source = sourceBadge(result);
                                            return (
                                                <div key={i} className="flex items-center gap-3 p-3 bg-neutral-800/60 hover:bg-neutral-800 rounded-xl transition">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium truncate mb-1" title={result.title}>{result.title}</p>
                                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${qualityColor(result.quality)}`}>{result.quality}</span>
                                                            {extractTags(result.title).map((tag, ti) => (
                                                                <span key={ti} className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${tag.className}`}>{tag.label}</span>
                                                            ))}
                                                            <span className="text-neutral-400">{result.size}</span>
                                                            <span className="text-green-500">↑{result.seeds}</span>
                                                            <span className="text-red-400">↓{result.leeches}</span>
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${source.className}`}>{source.label}</span>
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
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* No torrent results */}
                            {!searching && searched && pureTorrentResults.length === 0 && !error && (
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
