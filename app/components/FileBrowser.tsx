'use client';

import { useState, useEffect } from 'react';
import { Folder, HardDrive, ChevronRight, ArrowUp, RefreshCw, FolderOpen, Check, X } from 'lucide-react';

type FileItem = {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
};

type Props = {
    onSelect: (path: string) => void;
    onCancel: () => void;
    initialPath?: string;
};

export default function FileBrowser({ onSelect, onCancel, initialPath = '' }: Props) {
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [parentPath, setParentPath] = useState<string | null>(null);
    const [items, setItems] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);

    const fetchDirectory = async (dirPath: string) => {
        setLoading(true);
        setError(null);
        try {
            // Browser automatically sends cookies, including httpOnly ones
            const res = await fetch(`/api/browse?path=${encodeURIComponent(dirPath)}`, {
                credentials: 'include' // Ensure cookies are sent across origins
            });
            const data = await res.json();

            if (res.status === 401) {
                throw new Error('Unauthorized. Please login with valid PIN.');
            }
            if (!res.ok) {
                throw new Error(data.error || 'Failed to browse directory');
            }

            setCurrentPath(data.currentPath || '');
            setParentPath(data.parentPath);
            setItems(data.items || []);
            setSelectedPath(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDirectory(initialPath);
    }, [initialPath]);

    const handleItemClick = (item: FileItem) => {
        if (item.isDirectory) {
            setSelectedPath(item.path);
        }
    };

    const handleItemDoubleClick = (item: FileItem) => {
        if (item.isDirectory) {
            fetchDirectory(item.path);
        }
    };

    const handleGoUp = () => {
        if (parentPath !== null) {
            fetchDirectory(parentPath);
        }
    };

    const handleConfirm = () => {
        if (selectedPath) {
            onSelect(selectedPath);
        } else if (currentPath) {
            onSelect(currentPath);
        }
    };

    const formatSize = (bytes?: number) => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={onCancel}>
            <div
                className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
                    <FolderOpen className="w-5 h-5 text-yellow-500" />
                    <h2 className="text-lg font-bold">Browse Folders</h2>
                </div>

                {/* Breadcrumb / Current Path */}
                <div className="px-4 py-3 bg-neutral-800/50 border-b border-neutral-800 flex items-center gap-2">
                    <button
                        onClick={handleGoUp}
                        disabled={parentPath === null}
                        className="p-1.5 hover:bg-neutral-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="Go up"
                    >
                        <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => fetchDirectory(currentPath)}
                        className="p-1.5 hover:bg-neutral-700 rounded transition"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <div className="flex-1 px-3 py-1.5 bg-neutral-800 rounded text-sm font-mono text-neutral-300 truncate">
                        {currentPath || 'My Computer'}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-[300px]">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <RefreshCw className="w-8 h-8 text-neutral-500 animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                            <p className="text-red-400">{error}</p>
                            <button
                                onClick={() => fetchDirectory('')}
                                className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
                            >
                                Go to root
                            </button>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-neutral-500">
                            <p>This folder is empty</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-neutral-800">
                            {items.filter(item => item.isDirectory).map((item) => (
                                <div
                                    key={item.path}
                                    onClick={() => handleItemClick(item)}
                                    onDoubleClick={() => handleItemDoubleClick(item)}
                                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${selectedPath === item.path
                                            ? 'bg-red-600/20 border-l-2 border-red-600'
                                            : 'hover:bg-neutral-800 border-l-2 border-transparent'
                                        }`}
                                >
                                    {item.path.match(/^[A-Z]:\\?$/i) ? (
                                        <HardDrive className="w-5 h-5 text-blue-400 shrink-0" />
                                    ) : (
                                        <Folder className="w-5 h-5 text-yellow-500 shrink-0" />
                                    )}
                                    <span className="flex-1 truncate">{item.name}</span>
                                    <ChevronRight className="w-4 h-4 text-neutral-600" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected folder indicator */}
                {selectedPath && (
                    <div className="px-4 py-2 bg-green-600/10 border-t border-neutral-800 text-sm">
                        <span className="text-green-400">Selected: </span>
                        <span className="font-mono text-neutral-300">{selectedPath}</span>
                    </div>
                )}

                {/* Footer */}
                <div className="p-4 border-t border-neutral-800 flex justify-between items-center gap-4">
                    <p className="text-xs text-neutral-500">
                        Double-click to open folder • Single-click to select
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition flex items-center gap-2"
                        >
                            <X className="w-4 h-4" />
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!selectedPath && !currentPath}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-neutral-700 disabled:cursor-not-allowed rounded-lg transition flex items-center gap-2 font-medium"
                        >
                            <Check className="w-4 h-4" />
                            Select Folder
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
