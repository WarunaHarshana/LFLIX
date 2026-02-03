'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import type { ContentItem } from './ContentCard';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  library: ContentItem[];
  onPlay: (contentType: 'movie' | 'show', contentId: number, episodeId?: number) => void;
  onOpenShow: (show: ContentItem) => void;
};

export default function MobileSearchModal({ isOpen, onClose, library, onPlay, onOpenShow }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }

      // Lock body scroll
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchTerm = query.toLowerCase();
    const filtered = library.filter(item =>
      item.title.toLowerCase().includes(searchTerm) ||
      (item.genres && item.genres.toLowerCase().includes(searchTerm))
    );
    setResults(filtered);
  }, [query, library]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col overscroll-none touch-none">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-neutral-800">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search movies & shows..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-full pl-12 pr-4 py-3 text-white placeholder-neutral-500 outline-none focus:border-red-600"
          />
        </div>
        <button
          onClick={onClose}
          onTouchStart={onClose}
          className="p-3 hover:bg-neutral-800 rounded-full transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          style={{ touchAction: 'manipulation' }}
        >
          <X className="w-6 h-6 pointer-events-none" />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4">
        {!query.trim() ? (
          <div className="text-center text-neutral-500 mt-12">
            <Search className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Start typing to search your library</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center text-neutral-500 mt-12">
            <p>No results found for "{query}"</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 mb-3">{results.length} results</p>
            {results.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => {
                  if (item.type === 'movie') {
                    onPlay('movie', item.id);
                  } else {
                    onOpenShow(item);
                  }
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-3 bg-neutral-900 rounded-xl hover:bg-neutral-800 transition"
              >
                <div className="w-16 h-24 bg-neutral-800 rounded-lg flex-shrink-0 overflow-hidden">
                  {item.posterPath ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w200${item.posterPath}`}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
                      No Image
                    </div>
                  )}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <h3 className="font-medium text-white truncate">{item.title}</h3>
                  <p className="text-sm text-neutral-400">
                    {item.type === 'movie' ? 'Movie' : 'TV Show'}
                    {item.year && ` • ${item.year}`}
                  </p>
                  {item.genres && (
                    <p className="text-xs text-neutral-500 truncate mt-1">
                      {item.genres.split(',').slice(0, 2).join(' • ')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
