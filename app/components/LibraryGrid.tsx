'use client';

import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { ArrowUpDown, LayoutGrid, Globe, ChevronDown, Tag } from 'lucide-react';
import clsx from 'clsx';
import ContentCard from './ContentCard';
import EmptyState from './EmptyState';
import type { ContentItem } from '@/app/types';

type LibraryGridProps = {
  filteredLibrary: ContentItem[];
  activeTab: string;
  genres?: string[];
  selectedGenre: string | null;
  onGenreSelect?: (genre: string | null) => void;
  languages?: string[];
  selectedLanguage?: string | null;
  onLanguageSelect?: (lang: string | null) => void;
  sortBy: string;
  onSortChange: (sort: any) => void;
  onGenreClear: () => void;
  focusedIndex: number;
  displayPrefs: {
    showTitles: boolean;
    showRatings: boolean;
    cinematicMode: boolean;
    gridColumns?: number;
  };
  onDisplayPrefChange?: (key: string, value: any) => void;
  onCardClick: (item: ContentItem) => void;
  onPlayClick?: (item: ContentItem) => void;
  onContextMenu: (e: React.MouseEvent, item: ContentItem) => void;
};

const SORT_OPTIONS = [
  { value: 'added', label: 'Date Added' },
  { value: 'title-asc', label: 'Title A–Z' },
  { value: 'title-desc', label: 'Title Z–A' },
  { value: 'year-new', label: 'Year (Newest)' },
  { value: 'year-old', label: 'Year (Oldest)' },
  { value: 'rating', label: 'Rating' },
  { value: 'language-asc', label: 'Language (A–Z)' },
  { value: 'language-desc', label: 'Language (Z–A)' },
];

const GRID_COLUMNS_OPTIONS = [
  { value: 4, label: '4 (Large)' },
  { value: 5, label: '5' },
  { value: 6, label: '6 (Medium)' },
  { value: 7, label: '7' },
  { value: 8, label: '8 (Default)' },
  { value: 10, label: '10 (Compact)' },
];

const GRID_CLASS_MAP: Record<number, string> = {
  4: 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6',
  7: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-7',
  8: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',
  10: 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10',
};

type LibraryGridItemProps = {
  item: ContentItem;
  index: number;
  columnCount: number;
  isFocused: boolean;
  showTitle: boolean;
  showRating: boolean;
  onCardClick: (item: ContentItem) => void;
  onPlayClick?: (item: ContentItem) => void;
  onContextMenu: (e: React.MouseEvent, item: ContentItem) => void;
};

const LibraryGridItem = memo(function LibraryGridItem({
  item,
  index,
  columnCount,
  isFocused,
  showTitle,
  showRating,
  onCardClick,
  onPlayClick,
  onContextMenu,
}: LibraryGridItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const handleClick = useCallback(() => onCardClick(item), [onCardClick, item]);
  const handlePlay = useMemo(() => onPlayClick ? () => onPlayClick(item) : undefined, [onPlayClick, item]);
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, item);
  }, [onContextMenu, item]);
  const handleHoverChange = useCallback((hovered: boolean) => {
    setIsHovered(hovered);
  }, []);

  const isLastCol = columnCount > 1 && (index % columnCount === columnCount - 1);

  return (
    <div
      className={clsx(
        "relative col-span-1",
        isHovered ? "z-40" : "z-10",
        isFocused && "ring-2 ring-white ring-offset-2 ring-offset-black rounded-lg",
        !isHovered && "[content-visibility:auto] [contain-intrinsic-size:auto_200px_auto_300px]"
      )}
    >
      <ContentCard
        item={item}
        reflowMode={false}
        horizontalOrigin={isLastCol ? 'right' : 'left'}
        isExpanded={isHovered}
        onHoverChange={handleHoverChange}
        onClick={handleClick}
        onPlay={handlePlay}
        showTitle={showTitle}
        showRating={showRating}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
});

export default function LibraryGrid({
  filteredLibrary,
  activeTab,
  genres = [],
  selectedGenre,
  onGenreSelect,
  languages = [],
  selectedLanguage = null,
  onLanguageSelect,
  sortBy,
  onSortChange,
  onGenreClear,
  focusedIndex,
  displayPrefs,
  onDisplayPrefChange,
  onCardClick,
  onPlayClick,
  onContextMenu,
}: LibraryGridProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isGenreOpen, setIsGenreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gridDropdownRef = useRef<HTMLDivElement>(null);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const genreDropdownRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState<number>(() => displayPrefs.gridColumns || 8);

  useEffect(() => {
    const updateCols = () => {
      if (!gridRef.current) return;
      // 1. Try computed grid-template-columns from the browser layout engine
      const style = window.getComputedStyle(gridRef.current);
      const templateColumns = style.getPropertyValue('grid-template-columns');
      if (templateColumns && templateColumns !== 'none') {
        const tracks = templateColumns.split(' ').filter(Boolean);
        if (tracks.length > 0) {
          setColumnCount(tracks.length);
          return;
        }
      }

      // 2. Measure DOM children if at least one subsequent child wrapped to row 2
      const children = Array.from(gridRef.current.children) as HTMLElement[];
      if (children.length > 1) {
        const firstTop = children[0].offsetTop;
        let cols = 0;
        while (cols < children.length && children[cols].offsetTop === firstTop) {
          cols++;
        }
        // ONLY trust this count if at least one subsequent child wrapped (offsetTop > firstTop)
        if (cols > 0 && cols < children.length) {
          setColumnCount(cols);
          return;
        }
      }

      // 3. Fallback: calculate from window width matching Tailwind breakpoints for GRID_CLASS_MAP
      const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const targetCols = displayPrefs.gridColumns || 8;
      let effectiveCols = targetCols;
      if (targetCols === 4) {
        effectiveCols = width < 768 ? 2 : width < 1024 ? 3 : 4;
      } else if (targetCols === 5) {
        effectiveCols = width < 640 ? 2 : width < 768 ? 3 : width < 1024 ? 4 : 5;
      } else if (targetCols === 6) {
        effectiveCols = width < 640 ? 2 : width < 768 ? 3 : width < 1024 ? 4 : 6;
      } else if (targetCols === 7) {
        effectiveCols = width < 640 ? 2 : width < 768 ? 3 : width < 1024 ? 5 : 7;
      } else if (targetCols === 8) {
        effectiveCols = width < 768 ? 2 : width < 1024 ? 4 : width < 1280 ? 6 : 8;
      } else if (targetCols === 10) {
        effectiveCols = width < 640 ? 2 : width < 768 ? 4 : width < 1024 ? 6 : width < 1280 ? 8 : 10;
      }
      setColumnCount(effectiveCols);
    };

    updateCols();

    const resizeObserver = typeof ResizeObserver !== 'undefined' && gridRef.current
      ? new ResizeObserver(updateCols)
      : null;
    if (resizeObserver && gridRef.current) {
      resizeObserver.observe(gridRef.current);
    }
    window.addEventListener('resize', updateCols);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateCols);
    };
  }, [displayPrefs.gridColumns, filteredLibrary.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
      if (gridDropdownRef.current && !gridDropdownRef.current.contains(target)) {
        setIsGridOpen(false);
      }
      if (langDropdownRef.current && !langDropdownRef.current.contains(target)) {
        setIsLangOpen(false);
      }
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(target)) {
        setIsGenreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsGridOpen(false);
        setIsLangOpen(false);
        setIsGenreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const sortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Date Added';
  const currentColumns = displayPrefs.gridColumns || 8;
  const gridColumnsClass = GRID_CLASS_MAP[currentColumns] || GRID_CLASS_MAP[8];

  return (
    <div className="px-4 md:px-12 pb-16 relative z-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5 sm:gap-3 flex-wrap">
          {activeTab === 'all' ? 'My Library' : activeTab === 'movie' ? 'Movies' : 'TV Shows'}
          {selectedGenre && (
            <span className="text-sm sm:text-base font-medium px-3.5 py-1 liquid-glass-pill rounded-xl text-neutral-200 flex items-center">
              {selectedGenre}
              <button
                onClick={onGenreClear}
                className="ml-2 text-neutral-400 hover:text-white cursor-pointer"
              >
                ×
              </button>
            </span>
          )}
          {selectedLanguage && (
            <span className="text-sm sm:text-base font-medium px-3.5 py-1 liquid-glass-pill rounded-xl text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              {selectedLanguage}
              <button
                onClick={() => onLanguageSelect?.(null)}
                className="ml-1 text-neutral-400 hover:text-white cursor-pointer"
              >
                ×
              </button>
            </span>
          )}
          <span className="text-sm sm:text-base font-semibold text-neutral-400">
            ({filteredLibrary.length} items)
          </span>
        </h3>
        {/* Mobile backdrop for open dropdowns */}
        {(isGenreOpen || isLangOpen || isGridOpen || isOpen) && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] sm:hidden transition-opacity duration-200"
            onClick={() => {
              setIsGenreOpen(false);
              setIsLangOpen(false);
              setIsGridOpen(false);
              setIsOpen(false);
            }}
            aria-hidden="true"
          />
        )}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5 sm:flex-wrap w-full sm:w-auto">
          {/* Genre filter dropdown */}
          {genres.length > 0 && onGenreSelect && (
            <div ref={genreDropdownRef} className="relative group/genre w-full sm:w-auto">
              <button
                onClick={() => {
                  setIsLangOpen(false);
                  setIsGridOpen(false);
                  setIsOpen(false);
                  setIsGenreOpen(prev => !prev);
                }}
                aria-expanded={isGenreOpen}
                className={clsx(
                  "w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all select-none min-h-[42px] cursor-pointer shadow-md",
                  selectedGenre
                    ? "liquid-glass-pill-active font-bold shadow-sm text-white"
                    : "liquid-glass-pill text-neutral-200 hover:text-white"
                )}
              >
                <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-300 shrink-0" />
                  <span className="truncate max-w-[105px] sm:max-w-none">
                    {selectedGenre || 'All Genres'}
                  </span>
                </span>
                <ChevronDown className={clsx("w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 shrink-0 ml-1", isGenreOpen ? "rotate-180 text-white" : "sm:group-hover/genre:rotate-180 sm:group-hover/genre:text-white")} />
              </button>
              <div
                className={clsx(
                  "absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-56 sm:w-56 max-w-[calc(100vw-2rem)] max-h-[50vh] sm:max-h-[480px] overflow-y-auto overscroll-contain scrollbar-thin liquid-glass-menu rounded-2xl shadow-2xl p-1.5 transition-all duration-200 z-50 before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:content-['']",
                  isGenreOpen ? "opacity-100 visible" : "opacity-0 invisible sm:group-hover/genre:opacity-100 sm:group-hover/genre:visible"
                )}
              >
                <div className="px-3.5 py-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-300 border-b border-white/10 sticky top-0 bg-neutral-900/95 backdrop-blur-xl rounded-t-xl z-10">
                  Genres
                </div>
                <button
                  onClick={() => {
                    onGenreSelect(null);
                    setIsGenreOpen(false);
                  }}
                  className={clsx(
                    'w-full text-left px-3.5 py-2.5 text-xs sm:text-sm rounded-xl transition-all flex items-center justify-between font-medium cursor-pointer liquid-dropdown-item min-h-[40px]',
                    selectedGenre === null
                      ? 'liquid-dropdown-item-active'
                      : 'text-neutral-200 hover:text-white'
                  )}
                >
                  <span className="drop-shadow-sm">All Genres</span>
                  {selectedGenre === null && <span className="text-xs font-bold">✓</span>}
                </button>
                {genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => {
                      onGenreSelect(genre);
                      setIsGenreOpen(false);
                    }}
                    className={clsx(
                      'w-full text-left px-3.5 py-2.5 text-xs sm:text-sm rounded-xl transition-all flex items-center justify-between font-medium cursor-pointer liquid-dropdown-item min-h-[40px]',
                      selectedGenre === genre
                        ? 'liquid-dropdown-item-active'
                        : 'text-neutral-200 hover:text-white'
                    )}
                  >
                    <span className="drop-shadow-sm">{genre}</span>
                    {selectedGenre === genre && <span className="text-xs font-bold">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Language filter dropdown */}
          {languages.length > 0 && onLanguageSelect && (
            <div ref={langDropdownRef} className="relative group/lang w-full sm:w-auto">
              <button
                onClick={() => {
                  setIsGenreOpen(false);
                  setIsGridOpen(false);
                  setIsOpen(false);
                  setIsLangOpen(prev => !prev);
                }}
                aria-expanded={isLangOpen}
                className={clsx(
                  "w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all select-none min-h-[42px] cursor-pointer shadow-md",
                  selectedLanguage
                    ? "liquid-glass-pill-active font-bold shadow-sm text-white"
                    : "liquid-glass-pill text-neutral-200 hover:text-white"
                )}
              >
                <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-300 shrink-0" />
                  <span className="truncate max-w-[105px] sm:max-w-none">
                    {selectedLanguage || 'All Languages'}
                  </span>
                </span>
                <ChevronDown className={clsx("w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 shrink-0 ml-1", isLangOpen ? "rotate-180 text-white" : "sm:group-hover/lang:rotate-180 sm:group-hover/lang:text-white")} />
              </button>
              <div
                className={clsx(
                  "absolute right-0 top-full mt-2 w-56 sm:w-56 max-w-[calc(100vw-2rem)] max-h-[50vh] sm:max-h-[480px] overflow-y-auto overscroll-contain scrollbar-thin liquid-glass-menu rounded-2xl shadow-2xl p-1.5 transition-all duration-200 z-50 before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:content-['']",
                  isLangOpen ? "opacity-100 visible" : "opacity-0 invisible sm:group-hover/lang:opacity-100 sm:group-hover/lang:visible"
                )}
              >
                <div className="px-3.5 py-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-300 border-b border-white/10 sticky top-0 bg-neutral-900/95 backdrop-blur-xl rounded-t-xl z-10">
                  Language
                </div>
                <button
                  onClick={() => {
                    onLanguageSelect(null);
                    setIsLangOpen(false);
                  }}
                  className={clsx(
                    'w-full text-left px-3.5 py-2.5 text-xs sm:text-sm rounded-xl transition-all flex items-center justify-between font-medium cursor-pointer liquid-dropdown-item min-h-[40px]',
                    selectedLanguage === null
                      ? 'liquid-dropdown-item-active'
                      : 'text-neutral-200 hover:text-white'
                  )}
                >
                  <span className="drop-shadow-sm">All Languages</span>
                  {selectedLanguage === null && <span className="text-xs font-bold">✓</span>}
                </button>
                {languages.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      onLanguageSelect(lang);
                      setIsLangOpen(false);
                    }}
                    className={clsx(
                      'w-full text-left px-3.5 py-2.5 text-xs sm:text-sm rounded-xl transition-all flex items-center justify-between font-medium cursor-pointer liquid-dropdown-item min-h-[40px]',
                      selectedLanguage === lang
                        ? 'liquid-dropdown-item-active'
                        : 'text-neutral-200 hover:text-white'
                    )}
                  >
                    <span className="drop-shadow-sm">{lang}</span>
                    {selectedLanguage === lang && <span className="text-xs font-bold">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tiles per row / Grid columns dropdown */}
          <div ref={gridDropdownRef} className="relative group/grid w-full sm:w-auto">
            <button
              onClick={() => {
                setIsGenreOpen(false);
                setIsLangOpen(false);
                setIsOpen(false);
                setIsGridOpen(prev => !prev);
              }}
              aria-expanded={isGridOpen}
              title="Tiles per row"
              className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-4 py-2 sm:py-2.5 liquid-glass-pill rounded-xl text-xs sm:text-sm font-semibold text-neutral-200 hover:text-white transition-all select-none min-h-[42px] cursor-pointer shadow-md"
            >
              <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-300 shrink-0" />
                <span className="truncate max-w-[105px] sm:max-w-none">
                  {currentColumns} tiles
                </span>
              </span>
              <ChevronDown className={clsx("w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 shrink-0 ml-1", isGridOpen ? "rotate-180 text-white" : "sm:group-hover/grid:rotate-180 sm:group-hover/grid:text-white")} />
            </button>
            <div
              className={clsx(
                "absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-52 sm:w-48 max-w-[calc(100vw-2rem)] max-h-[50vh] sm:max-h-[480px] overflow-y-auto overscroll-contain scrollbar-thin liquid-glass-menu rounded-2xl shadow-2xl p-1.5 transition-all duration-200 z-50 before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:content-['']",
                isGridOpen ? "opacity-100 visible" : "opacity-0 invisible sm:group-hover/grid:opacity-100 sm:group-hover/grid:visible"
              )}
            >
              <div className="px-3.5 py-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-300 border-b border-white/10 sticky top-0 bg-neutral-900/95 backdrop-blur-xl rounded-t-xl z-10">
                Tiles Per Row
              </div>
              {GRID_COLUMNS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onDisplayPrefChange?.('gridColumns', opt.value);
                    setIsGridOpen(false);
                  }}
                  className={clsx(
                    'w-full text-left px-3.5 py-2.5 text-xs sm:text-sm rounded-xl transition-all flex items-center justify-between font-medium cursor-pointer liquid-dropdown-item min-h-[40px]',
                    currentColumns === opt.value
                      ? 'liquid-dropdown-item-active'
                      : 'text-neutral-200 hover:text-white'
                  )}
                >
                  <span className="drop-shadow-sm">{opt.label}</span>
                  {currentColumns === opt.value && <span className="text-xs font-bold">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Sort dropdown */}
          <div ref={dropdownRef} className="relative group/sort w-full sm:w-auto">
            <button
              onClick={() => {
                setIsGenreOpen(false);
                setIsLangOpen(false);
                setIsOpen(false);
                setIsGridOpen(false);
                setIsOpen(prev => !prev);
              }}
              aria-expanded={isOpen}
              className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-4 py-2 sm:py-2.5 liquid-glass-pill rounded-xl text-xs sm:text-sm font-semibold text-neutral-200 hover:text-white transition-all select-none min-h-[42px] cursor-pointer shadow-md"
            >
              <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <ArrowUpDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-300 shrink-0" />
                <span className="truncate max-w-[105px] sm:max-w-none">
                  {sortLabel}
                </span>
              </span>
              <ChevronDown className={clsx("w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 shrink-0 ml-1", isOpen ? "rotate-180 text-white" : "sm:group-hover/sort:rotate-180 sm:group-hover/sort:text-white")} />
            </button>
            <div
              className={clsx(
                "absolute right-0 top-full mt-2 w-56 sm:w-52 max-w-[calc(100vw-2rem)] max-h-[50vh] sm:max-h-[480px] overflow-y-auto overscroll-contain scrollbar-thin liquid-glass-menu rounded-2xl shadow-2xl p-1.5 transition-all duration-200 z-50 before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:content-['']",
                isOpen ? "opacity-100 visible" : "opacity-0 invisible sm:group-hover/sort:opacity-100 sm:group-hover/sort:visible"
              )}
            >
              <div className="px-3.5 py-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-300 border-b border-white/10 sticky top-0 bg-neutral-900/95 backdrop-blur-xl rounded-t-xl z-10">
                Sort By
              </div>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onSortChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    'w-full text-left px-3.5 py-2.5 text-xs sm:text-sm rounded-xl transition-all flex items-center justify-between font-medium cursor-pointer liquid-dropdown-item min-h-[40px]',
                    sortBy === opt.value
                      ? 'liquid-dropdown-item-active'
                      : 'text-neutral-200 hover:text-white'
                  )}
                >
                  <span className="drop-shadow-sm">{opt.label}</span>
                  {sortBy === opt.value && <span className="text-xs font-bold">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {filteredLibrary.length === 0 ? (
        <EmptyState
          type="no-results"
          searchQuery={selectedGenre || selectedLanguage || ''}
          onClearFilter={() => {
            onGenreClear();
            onLanguageSelect?.(null);
          }}
        />
      ) : (
        <div
          ref={gridRef}
          className={clsx("grid gap-4", gridColumnsClass)}
        >
          {filteredLibrary.map((item, index) => (
            <LibraryGridItem
              key={`${item.type}-${item.id}`}
              item={item}
              index={index}
              columnCount={columnCount}
              isFocused={focusedIndex === index}
              showTitle={displayPrefs.showTitles}
              showRating={displayPrefs.showRatings}
              onCardClick={onCardClick}
              onPlayClick={onPlayClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
