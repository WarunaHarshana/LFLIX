'use client';

import { Eye, EyeOff, Trash2, BookmarkMinus, Sparkles } from 'lucide-react';
import type { ContentItem } from '@/app/types';

type ContextMenuOverlayProps = {
  contextMenu: { x: number; y: number; item: ContentItem };
  onClose: () => void;
  onMarkWatched: (item: ContentItem, watched: boolean) => void;
  onRemoveFromLibrary: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
  onFixMatch?: (item: ContentItem) => void;
};

export default function ContextMenuOverlay({
  contextMenu,
  onClose,
  onMarkWatched,
  onRemoveFromLibrary,
  onDelete,
  onFixMatch,
}: ContextMenuOverlayProps) {
  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="fixed z-50 liquid-glass-menu rounded-2xl shadow-2xl overflow-hidden min-w-56 p-1.5"
        style={{
          left: Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 240),
          top: Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 1080) - 220)
        }}
      >
        <div className="px-3.5 py-2 border-b border-white/10">
          <p className="text-xs sm:text-sm font-bold text-white truncate max-w-56">{contextMenu.item.title}</p>
        </div>
        <div className="pt-1 space-y-0.5">
          {onFixMatch && (
            <button
              onClick={() => {
                onFixMatch(contextMenu.item);
                onClose();
              }}
              className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 rounded-xl transition w-full text-left text-amber-400 font-medium text-xs sm:text-sm liquid-dropdown-item"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              Fix Match / Metadata
            </button>
          )}
          {contextMenu.item.watchProgress?.completed ? (
            <button
              onClick={() => onMarkWatched(contextMenu.item, false)}
              className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 rounded-xl transition w-full text-left text-neutral-200 text-xs sm:text-sm liquid-dropdown-item"
            >
              <EyeOff className="w-4 h-4" />
              Mark as Unwatched
            </button>
          ) : (
            <button
              onClick={() => onMarkWatched(contextMenu.item, true)}
              className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 rounded-xl transition w-full text-left text-neutral-200 text-xs sm:text-sm liquid-dropdown-item"
            >
              <Eye className="w-4 h-4" />
              Mark as Watched
            </button>
          )}
          <button
            onClick={() => onRemoveFromLibrary(contextMenu.item)}
            className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10 rounded-xl transition w-full text-left border-t border-white/10 text-neutral-200 text-xs sm:text-sm liquid-dropdown-item"
          >
            <BookmarkMinus className="w-4 h-4" />
            Remove from Library
          </button>
          <button
            onClick={() => onDelete(contextMenu.item)}
            className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-red-500/20 hover:text-red-300 rounded-xl transition w-full text-left border-t border-white/10 text-red-400 text-xs sm:text-sm liquid-dropdown-item"
          >
            <Trash2 className="w-4 h-4" />
            Delete Permanently
          </button>
        </div>
      </div>
    </>
  );
}
