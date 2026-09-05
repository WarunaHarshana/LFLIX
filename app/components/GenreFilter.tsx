'use client';

import { Tag } from 'lucide-react';

type Props = {
    genres: string[];
    selectedGenre: string | null;
    onSelect: (genre: string | null) => void;
};

export default function GenreFilter({ genres, selectedGenre, onSelect }: Props) {
    if (genres.length === 0) return null;

    return (
        <div className="px-4 md:px-12 mb-6">
            <div className="flex items-center gap-3 mb-3">
                <Tag className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-sm text-[var(--text-secondary)]">Filter by Genre</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-neutral-700">
                <button
                    onClick={() => onSelect(null)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap cursor-pointer ${selectedGenre === null
                            ? 'bg-white text-black font-semibold'
                            : 'bg-[var(--surface-3)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-white'
                        }`}
                >
                    All
                </button>

                {genres.map((genre) => (
                    <button
                        key={genre}
                        onClick={() => onSelect(genre === selectedGenre ? null : genre)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap cursor-pointer ${selectedGenre === genre
                                ? 'bg-white text-black font-semibold'
                                : 'bg-[var(--surface-3)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-white'
                            }`}
                    >
                        {genre}
                    </button>
                ))}
            </div>
        </div>
    );
}
