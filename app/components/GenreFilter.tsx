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
        <div className="px-4 md:px-12 mb-5">
            <div className="flex items-center gap-2.5 mb-3">
                <Tag className="w-4.5 h-4.5 text-neutral-400" />
                <span className="text-sm sm:text-base font-bold text-neutral-200">Filter by Genre</span>
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-2.5 scrollbar-thin scrollbar-thumb-white/10">
                <button
                    onClick={() => onSelect(null)}
                    className={`px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition-all whitespace-nowrap cursor-pointer select-none min-h-[42px] sm:min-h-[44px] flex items-center ${selectedGenre === null
                            ? 'bg-white liquid-glass-pill-active font-bold shadow-md'
                            : 'liquid-glass-pill text-neutral-300 hover:text-white'
                        }`}
                >
                    All
                </button>

                {genres.map((genre) => (
                    <button
                        key={genre}
                        onClick={() => onSelect(genre === selectedGenre ? null : genre)}
                        className={`px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition-all whitespace-nowrap cursor-pointer select-none min-h-[42px] sm:min-h-[44px] flex items-center ${selectedGenre === genre
                                ? 'bg-white liquid-glass-pill-active font-bold shadow-md'
                                : 'liquid-glass-pill text-neutral-300 hover:text-white'
                            }`}
                    >
                        {genre}
                    </button>
                ))}
            </div>
        </div>
    );
}
