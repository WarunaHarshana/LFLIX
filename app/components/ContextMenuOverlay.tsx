'use client';

import { Eye, EyeOff, Trash2, BookmarkMinus } from 'lucide-react';
import type { ContentItem } from '@/app/types';

type ContextMenuOverlayProps = {
  contextMenu: { x: number; y: number; item: ContentItem };
  onClose: () => void;
  onMarkWatched: (item: ContentItem, watched: boolean) => void;
  onRemoveFromLibrary: (item: ContentItem) => void;
  onDelete: (item: ContentItem) => void;
};

export default function ContextMenuOverlay({
  contextMenu,
  onClose,
  onMarkWatched,
  onRemoveFromLibrary,
  onDelete,
}: ContextMenuOverlayProps) {
  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden min-w-48"
        style={{
          left: Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 200),
          top: Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 1080) - 160)
        }}
      >
        <div className="px-4 py-2 border-b border-neutral-700">
          <p className="text-sm font-medium truncate max-w-48">{contextMenu.item.title}</p>
        </div>
        {contextMenu.item.watchProgress?.completed ? (
          <button
            onClick={() => onMarkWatched(contextMenu.item, false)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-700 transition w-full text-left text-neutral-200"
          >
            <EyeOff className="w-4 h-4" />
            Mark as Unwatched
          </button>
        ) : (
          <button
            onClick={() => onMarkWatched(contextMenu.item, true)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-700 transition w-full text-left text-neutral-200"
          >
            <Eye className="w-4 h-4" />
            Mark as Watched
          </button>
        )}
        <button
          onClick={() => onRemoveFromLibrary(contextMenu.item)}
          className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-700 transition w-full text-left border-t border-neutral-700 text-neutral-200"
        >
          <BookmarkMinus className="w-4 h-4" />
          Remove from Library
        </button>
        <button
          onClick={() => onDelete(contextMenu.item)}
          className="flex items-center gap-3 px-4 py-3 hover:bg-red-600 transition w-full text-left border-t border-neutral-700 text-red-400"
        >
          <Trash2 className="w-4 h-4" />
          Delete Permanently
        </button>
      </div>
    </>
  );
}
