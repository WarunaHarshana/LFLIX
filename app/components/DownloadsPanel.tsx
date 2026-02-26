'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2, Trash2, CheckCircle, AlertCircle, ArrowDown, Pause, Play, HardDrive, AlertTriangle } from 'lucide-react';

type DownloadItem = {
    id: number;
    magnetUri: string;
    infoHash: string | null;
    name: string | null;
    watchlistId: number | null;
    status: 'downloading' | 'completed' | 'error' | 'paused';
    progress: number;
    downloadSpeed: number;
    totalSize: number;
    downloadedSize: number;
    downloadPath: string | null;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

export default function DownloadsPanel({ isOpen, onClose }: Props) {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState<DownloadItem | null>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        fetchDownloads();
        pollRef.current = setInterval(fetchDownloads, 2000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [isOpen]);

    const fetchDownloads = async () => {
        try {
            const res = await fetch('/api/downloads');
            const data = await res.json();
            setDownloads(data.downloads || []);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    };

    const removeDownload = async (id: number) => {
        // Stop polling so it doesn't re-add the item
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setRemovingIds(prev => new Set(prev).add(id));
        setConfirmDelete(null);

        try {
            const res = await fetch(`/api/downloads?id=${id}&deleteFiles=0`, { method: 'DELETE' });
            if (res.ok) {
                setDownloads(prev => prev.filter(d => d.id !== id));
            }
        } catch (e) {
            console.error('Delete failed:', e);
        } finally {
            setRemovingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
            // Re-fetch and restart polling
            await fetchDownloads();
            pollRef.current = setInterval(fetchDownloads, 2000);
        }
    };

    const pauseDownload = async (id: number) => {
        try {
            await fetch('/api/downloads', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action: 'pause' })
            });
            await fetchDownloads();
        } catch { /* ignore */ }
    };

    const resumeDownload = async (id: number) => {
        try {
            await fetch('/api/downloads', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action: 'resume' })
            });
            await fetchDownloads();
        } catch { /* ignore */ }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    };

    const formatSpeed = (bps: number) => {
        if (bps === 0) return '—';
        return `${formatBytes(bps)}/s`;
    };

    const statusIcon = (status: string) => {
        switch (status) {
            case 'downloading': return <ArrowDown className="w-4 h-4 text-blue-400 animate-bounce" />;
            case 'completed': return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
            case 'paused': return <Pause className="w-4 h-4 text-yellow-400" />;
            default: return null;
        }
    };

    const progressColor = (status: string) => {
        switch (status) {
            case 'downloading': return 'bg-blue-500';
            case 'completed': return 'bg-green-500';
            case 'error': return 'bg-red-500';
            case 'paused': return 'bg-yellow-500';
            default: return 'bg-neutral-500';
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-[100] flex items-start justify-end">
                <div className="absolute inset-0 bg-black/50" onClick={onClose} />
                <div className="relative w-full max-w-md h-full bg-neutral-900 border-l border-neutral-700 overflow-hidden flex flex-col">

                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                        <div className="flex items-center gap-2">
                            <Download className="w-5 h-5 text-amber-500" />
                            <h2 className="text-lg font-bold">Downloads</h2>
                            {downloads.filter(d => d.status === 'downloading').length > 0 && (
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-full">
                                    {downloads.filter(d => d.status === 'downloading').length} active
                                </span>
                            )}
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                            </div>
                        ) : downloads.length === 0 ? (
                            <div className="text-center py-12">
                                <HardDrive className="w-12 h-12 text-neutral-700 mx-auto mb-3" />
                                <p className="text-neutral-400 font-medium">No downloads</p>
                                <p className="text-neutral-600 text-sm mt-1">Downloads will appear here</p>
                            </div>
                        ) : (
                            downloads.map((dl) => (
                                <div
                                    key={dl.id}
                                    className={`p-3 bg-neutral-800/60 rounded-xl border border-neutral-700/50 transition ${removingIds.has(dl.id) ? 'opacity-40 pointer-events-none' : ''}`}
                                >
                                    {/* Name + status */}
                                    <div className="flex items-start gap-2 mb-2">
                                        {statusIcon(dl.status)}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{dl.name || 'Loading metadata...'}</p>
                                            <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                                                {dl.status === 'downloading' && (
                                                    <span className="text-blue-400">{formatSpeed(dl.downloadSpeed)}</span>
                                                )}
                                                {dl.totalSize > 0 && (
                                                    <span>{formatBytes(dl.downloadedSize)} / {formatBytes(dl.totalSize)}</span>
                                                )}
                                                {dl.status === 'completed' && (
                                                    <span className="text-green-400">Completed</span>
                                                )}
                                                {dl.status === 'paused' && (
                                                    <span className="text-yellow-400">Paused</span>
                                                )}
                                                {dl.status === 'error' && (
                                                    <span className="text-red-400 truncate">{dl.errorMessage || 'Error'}</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {/* Pause / Resume */}
                                            {dl.status === 'downloading' && (
                                                <button
                                                    onClick={() => pauseDownload(dl.id)}
                                                    className="p-1.5 hover:bg-yellow-600/20 text-neutral-500 hover:text-yellow-400 rounded-lg transition"
                                                    title="Pause"
                                                >
                                                    <Pause className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {dl.status === 'paused' && (
                                                <button
                                                    onClick={() => resumeDownload(dl.id)}
                                                    className="p-1.5 hover:bg-green-600/20 text-neutral-500 hover:text-green-400 rounded-lg transition"
                                                    title="Resume"
                                                >
                                                    <Play className="w-3.5 h-3.5" />
                                                </button>
                                            )}

                                            {/* Delete */}
                                            <button
                                                onClick={() => setConfirmDelete(dl)}
                                                disabled={removingIds.has(dl.id)}
                                                className="p-1.5 hover:bg-red-600/20 text-neutral-500 hover:text-red-400 rounded-lg transition disabled:opacity-30"
                                                title="Remove"
                                            >
                                                {removingIds.has(dl.id) ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    {dl.status !== 'error' && (
                                        <div className="w-full bg-neutral-700 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${progressColor(dl.status)}`}
                                                style={{ width: `${Math.min(dl.progress, 100)}%` }}
                                            />
                                        </div>
                                    )}
                                    {(dl.status === 'downloading' || dl.status === 'paused') && (
                                        <p className="text-[11px] text-neutral-500 mt-1 text-right">{dl.progress.toFixed(1)}%</p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Confirm Delete Dialog */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmDelete(null)} />
                    <div className="relative bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-sm w-full">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-red-600/20 rounded-full">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                            </div>
                            <h3 className="text-lg font-bold">Remove Download?</h3>
                        </div>
                        <p className="text-neutral-400 text-sm mb-1">
                            Are you sure you want to remove this download?
                        </p>
                        <p className="text-white text-sm font-medium mb-4 truncate">
                            {confirmDelete.name || 'Unknown'}
                        </p>
                        {confirmDelete.status === 'downloading' && (
                            <p className="text-yellow-400 text-xs mb-4 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                This download is still in progress!
                            </p>
                        )}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => removeDownload(confirmDelete.id)}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition text-sm"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
