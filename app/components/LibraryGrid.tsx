'use client';

import { useRef } from 'react';
import { ArrowUpDown } from 'lucide-react';
import clsx from 'clsx';
import ContentCard from './ContentCard';
import EmptyState from './EmptyState';
import type { ContentItem } from '@/app/types';

type LibraryGridProps = {
  filteredLibrary: ContentItem[];
  activeTab: string;
  selectedGenre: string | null;
  sortBy: string;
  onSortChange: (sort: any) => void;
  onGenreClear: () => void;
  focusedIndex: number;
  displayPrefs: { showTitles: boolean; showRatings: boolean; cinematicMode: boolean };
  onCardClick: (item: ContentItem) => void;
  onContextMenu: (e: React.MouseEvent, item: ContentItem) => void;
};

const SORT_OPTIONS = [
  { value: 'added', label: 'Date Added' },
  { value: 'title-asc', label: 'Title A–Z' },
  { value: 'title-desc', label: 'Title Z–A' },
  { value: 'year-new', label: 'Year (Newest)' },
  { value: 'year-old', label: 'Year (Oldest)' },
  { value: 'rating', label: 'Rating' },
];

export default function LibraryGrid({
  filteredLibrary,
  activeTab,
  selectedGenre,
  sortBy,
  onSortChange,
  onGenreClear,
  focusedIndex,
  displayPrefs,
  onCardClick,
  onContextMenu,
}: LibraryGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const sortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Date Added';

  return (
    <div className="px-12 pb-20 relative z-20">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-neutral-200 flex items-center gap-3">
          {activeTab === 'all' ? 'My Library' : activeTab === 'movie' ? 'Movies' : 'TV Shows'}
          {selectedGenre && (
            <span className="text-sm font-normal px-3 py-1 bg-neutral-800 rounded-full text-neutral-400">
              {selectedGenre}
              <button
                onClick={onGenreClear}
                className="ml-2 text-neutral-500 hover:text-white"
              >
                ×
              </button>
            </span>
          )}
          <span className="text-sm font-normal text-neutral-500">
            ({filteredLibrary.length} items)
          </span>
        </h3>
        <div className="relative group/sort">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/80 hover:bg-neutral-700 rounded-lg text-sm text-neutral-300 hover:text-white transition-colors border border-neutral-700/50">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {sortLabel}
            </span>
          </button>
          <div className="absolute right-0 top-full mt-1 w-44 bg-neutral-900 border border-neutral-700/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden opacity-0 invisible group-hover/sort:opacity-100 group-hover/sort:visible transition-all duration-200 z-30">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onSortChange(opt.value)}
                className={clsx(
                  'w-full text-left px-4 py-2.5 text-sm transition-colors',
                  sortBy === opt.value
                    ? 'bg-red-600/20 text-red-400 font-medium'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredLibrary.length === 0 ? (
        <EmptyState type="no-results" searchQuery={selectedGenre || ''} />
      ) : (
        <div
          ref={gridRef}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4"
        >
          {filteredLibrary.map((item, index) => (
            <div
              key={`${item.type}-${item.id}`}
              className={clsx(
                "transition-all duration-200",
                focusedIndex === index && "ring-2 ring-white ring-offset-2 ring-offset-black rounded-lg"
              )}
            >
              <ContentCard
                item={item}
                onClick={() => onCardClick(item)}
                showTitle={displayPrefs.showTitles}
                showRating={displayPrefs.showRatings}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu(e, item);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
