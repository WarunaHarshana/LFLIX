'use client';

import Link from 'next/link';
import clsx from 'clsx';

type TabId = 'all' | 'movie' | 'show' | 'live' | 'watchlist' | 'discover';

type DetailTabNavProps = {
  activeTab?: TabId;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'Home' },
  { id: 'movie', label: 'Movies' },
  { id: 'show', label: 'TV Shows' },
  { id: 'live', label: 'Live TV' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'discover', label: 'Discover' },
];

export default function DetailTabNav({ activeTab = 'discover' }: DetailTabNavProps) {
  return (
    <div className="fixed left-0 right-0 z-50 pt-[env(safe-area-inset-top)]">
      <div className="border-b border-white/10 bg-gradient-to-b from-black/85 via-black/65 to-black/15 backdrop-blur-md">
        <div className="hide-scrollbar mx-2 flex items-center gap-1.5 overflow-x-auto px-2 py-3 md:mx-4 md:px-4">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/?tab=${tab.id}`}
              className={clsx(
                'min-h-[40px] whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition',
                activeTab === tab.id
                  ? 'bg-white/20 text-white border border-white/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                  : 'text-white/75 hover:bg-white/10 hover:text-white border border-transparent'
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
