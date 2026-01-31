'use client';

import { useState, useEffect } from 'react';
import { X, Folder, Trash2, RefreshCw, Plus, AlertCircle, FolderOpen } from 'lucide-react';
import FileBrowser from './FileBrowser';

type ScannedFolder = {
    id: number;
    folderPath: string;
    folderName: string;
    contentType: string;
    addedAt: string;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onScan: (folderPath: string) => Promise<void>;
    onRefresh: () => void;
};

export default function FolderManager({ isOpen, onClose, onScan, onRefresh }: Props) {
    const [folders, setFolders] = useState<ScannedFolder[]>([]);
    const [loading, setLoading] = useState(false);
    const [newPath, setNewPath] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showBrowser, setShowBrowser] = useState(false);

    // Helper for authenticated fetch - browser sends cookies automatically
    const authFetch = (url: string, options: RequestInit = {}) => {
        return fetch(url, {
            ...options,
            credentials: 'include' // Ensure cookies are sent across origins
        });
    };

    useEffect(() => {
        if (isOpen) {
            fetchFolders();
        }
    }, [isOpen]);

    const fetchFolders = async () => {
        setLoading(true);
        try {
            const res = await authFetch('/api/folders');
            if (res.status === 401) {
                setError('Unauthorized. Please login with PIN.');
                setFolders([]);
                return;
            }
            const data = await res.json();
            setFolders(Array.isArray(data) ? data : []);
        } catch (e) {
            setError('Failed to load folders');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (pathToScan?: string) => {
        const folderPath = pathToScan || newPath.trim();
        if (!folderPath) return;

        setError(null);
        setIsAdding(true);

        try {
            await onScan(folderPath);
            setNewPath('');
            // Restart watcher to include new folder
            await authFetch('/api/watcher', { method: 'POST' });
            await fetchFolders();
            onRefresh();
        } catch (e: any) {
            setError(e.message || 'Failed to scan folder');
        } finally {
            setIsAdding(false);
        }
    };

    const handleBrowseSelect = (selectedPath: string) => {
        setShowBrowser(false);
        setNewPath(selectedPath);
        // Automatically scan the selected folder
        handleAdd(selectedPath);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Remove this folder and all its content from the library?')) return;

        try {
            const res = await authFetch(`/api/folders?id=${id}`, { method: 'DELETE' });
            if (res.status === 401) {
                setError('Unauthorized. Please login with PIN.');
                return;
            }
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to remove folder');
                return;
            }
            // Restart watcher to update folder list
            await authFetch('/api/watcher', { method: 'POST' });
            await fetchFolders();
            onRefresh();
        } catch (e) {
            setError('Failed to remove folder');
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-neutral-900 rounded-2xl w-full max-w-2xl border border-neutral-800 shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-neutral-800">
                        <div className="flex items-center gap-3">
                            <Folder className="w-6 h-6 text-red-500" />
                            <h2 className="text-xl font-bold">Library Folders</h2>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mx-6 mt-4 p-4 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-3 text-red-300">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="flex-1">{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Add New Folder */}
                    <div className="p-6 border-b border-neutral-800">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Enter folder path or use Browse..."
                                value={newPath}
                                onChange={(e) => setNewPath(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                className="flex-1 bg-black border border-neutral-700 rounded-lg px-4 py-3 outline-none focus:border-red-600 transition"
                            />
                            <button
                                onClick={() => setShowBrowser(true)}
                                className="px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium flex items-center gap-2 transition border border-neutral-700"
                                title="Browse folders"
                            >
                                <FolderOpen className="w-4 h-4" />
                                Browse
                            </button>
                            <button
                                onClick={() => handleAdd()}
                                disabled={isAdding || !newPath.trim()}
                                className="px-5 py-3 bg-red-600 hover:bg-red-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center gap-2 transition"
                            >
                                {isAdding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Scan
                            </button>
                        </div>
                    </div>

                    {/* Folder List */}
                    <div className="p-6 max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <RefreshCw className="w-6 h-6 animate-spin text-neutral-500" />
                            </div>
                        ) : folders.length === 0 ? (
                            <div className="text-center py-8 text-neutral-500">
                                <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>No folders added yet.</p>
                                <p className="text-sm mt-1">Click <strong>Browse</strong> to select a folder from your computer.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {folders.map((folder) => (
                                    <div
                                        key={folder.id}
                                        className="flex items-center gap-4 p-4 bg-neutral-800/50 rounded-xl border border-neutral-700"
                                    >
                                        <Folder className="w-8 h-8 text-yellow-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-white truncate">{folder.folderName}</h4>
                                            <p className="text-sm text-neutral-400 truncate">{folder.folderPath}</p>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(folder.id)}
                                            className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-900/20 rounded-lg transition"
                                            title="Remove folder"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-neutral-800 bg-neutral-800/30">
                        <p className="text-xs text-neutral-500 text-center">
                            Removing a folder will delete all its content from the library. Original files are not affected.
                        </p>
                    </div>
                </div>
            </div>

            {/* File Browser Modal */}
            {showBrowser && (
                <FileBrowser
                    onSelect={handleBrowseSelect}
                    onCancel={() => setShowBrowser(false)}
                />
            )}
        </>
    );
}
