'use client';

import { FolderPlus, Film, Tv, Search, RefreshCw } from 'lucide-react';

type Props = {
    type: 'empty' | 'no-results' | 'loading';
    searchQuery?: string;
    onAddFolder?: () => void;
};

export default function EmptyState({ type, searchQuery, onAddFolder }: Props) {
    if (type === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center">
                <RefreshCw className="w-12 h-12 text-neutral-500 animate-spin mb-6" />
                <h3 className="text-xl font-semibold text-neutral-300 mb-2">Loading your library...</h3>
                <p className="text-neutral-500">Please wait while we fetch your content</p>
            </div>
        );
    }

    if (type === 'no-results') {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center">
                <Search className="w-16 h-16 text-neutral-600 mb-6" />
                <h3 className="text-xl font-semibold text-neutral-300 mb-2">No results found</h3>
                <p className="text-neutral-500 max-w-md">
                    No content matches "{searchQuery}". Try adjusting your filters or search terms.
                </p>
            </div>
        );
    }

    // Empty library
    return (
        <div className="flex flex-col items-center justify-center py-32 text-center px-8">
            <div className="relative mb-8">
                <div className="absolute -left-8 top-0 opacity-50">
                    <Film className="w-16 h-16 text-neutral-700" />
                </div>
                <FolderPlus className="w-24 h-24 text-neutral-500 relative z-10" />
                <div className="absolute -right-8 top-0 opacity-50">
                    <Tv className="w-16 h-16 text-neutral-700" />
                </div>
            </div>

            <h3 className="text-2xl font-bold text-neutral-200 mb-3">Your library is empty</h3>
            <p className="text-neutral-400 max-w-md mb-8">
                Add a folder to start building your personal streaming library. Localflix will
                automatically detect and organize your movies and TV shows.
            </p>

            {onAddFolder && (
                <button
                    onClick={onAddFolder}
                    className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center gap-3 transition shadow-lg shadow-red-900/30"
                >
                    <FolderPlus className="w-5 h-5" />
                    Add Library Folder
                </button>
            )}

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl text-left">
                <div className="p-6 bg-neutral-800/50 rounded-xl border border-neutral-700">
                    <h4 className="font-semibold text-white mb-2">📁 Organize Files</h4>
                    <p className="text-sm text-neutral-400">
                        Put your movies and TV shows in separate folders for best results.
                    </p>
                </div>
                <div className="p-6 bg-neutral-800/50 rounded-xl border border-neutral-700">
                    <h4 className="font-semibold text-white mb-2">🎬 Auto Detection</h4>
                    <p className="text-sm text-neutral-400">
                        We'll automatically fetch posters, ratings, and metadata from TMDB.
                    </p>
                </div>
                <div className="p-6 bg-neutral-800/50 rounded-xl border border-neutral-700">
                    <h4 className="font-semibold text-white mb-2">▶️ One-Click Play</h4>
                    <p className="text-sm text-neutral-400">
                        Click any title to instantly play in VLC with full-screen mode.
                    </p>
                </div>
            </div>
        </div>
    );
}
