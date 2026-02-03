'use client';

import { useState } from 'react';
import { Home, Film, Tv, Settings, Menu, X, Smartphone, Search, Radio } from 'lucide-react';
import clsx from 'clsx';

type Tab = 'all' | 'movie' | 'show' | 'live';

type Props = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onShowQR: () => void;
  onShowSettings: () => void;
  onShowSearch: () => void;
};

export default function MobileNav({ activeTab, onTabChange, onShowQR, onShowSettings, onShowSearch }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const tabs = [
    { id: 'all' as Tab, label: 'Home', icon: Home },
    { id: 'movie' as Tab, label: 'Movies', icon: Film },
    { id: 'show' as Tab, label: 'Shows', icon: Tv },
    { id: 'live' as Tab, label: 'Live TV', icon: Radio },
  ];

  return (
    <>
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-neutral-800 md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold tracking-tighter text-red-600">LFLIX</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={onShowSearch}
              onTouchStart={onShowSearch}
              className="p-3 hover:bg-neutral-800 rounded-full transition min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Search"
              style={{ touchAction: 'manipulation' }}
            >
              <Search className="w-5 h-5 pointer-events-none" />
            </button>
            <button
              onClick={onShowQR}
              onTouchStart={onShowQR}
              className="p-3 hover:bg-neutral-800 rounded-full transition min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Connect Mobile"
              style={{ touchAction: 'manipulation' }}
            >
              <Smartphone className="w-5 h-5 pointer-events-none" />
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              onTouchStart={() => setIsOpen(!isOpen)}
              className="p-3 hover:bg-neutral-800 rounded-full transition min-w-[44px] min-h-[44px] flex items-center justify-center"
              style={{ touchAction: 'manipulation' }}
            >
              {isOpen ? <X className="w-6 h-6 pointer-events-none" /> : <Menu className="w-6 h-6 pointer-events-none" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="border-t border-neutral-800 py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  setIsOpen(false);
                }}
                className={clsx(
                  "w-full flex items-center gap-3 px-4 py-4 transition",
                  activeTab === tab.id
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:bg-neutral-800'
                )}
                style={{ touchAction: 'manipulation' }}
              >
                <tab.icon className="w-5 h-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
            <div className="border-t border-neutral-800 mt-2 pt-2">
              <button
                onClick={() => {
                  onShowSettings();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-4 text-neutral-400 hover:bg-neutral-800 transition"
                style={{ touchAction: 'manipulation' }}
              >
                <Settings className="w-5 h-5" />
                <span className="font-medium">Settings</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-t border-neutral-800 md:hidden">
        <div className="flex justify-around py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              onTouchStart={() => onTabChange(tab.id)}
              className={clsx(
                "flex flex-col items-center gap-1 px-4 py-3 rounded-lg transition min-w-[64px]",
                activeTab === tab.id
                  ? 'text-red-500'
                  : 'text-neutral-500 hover:text-neutral-300'
              )}
              style={{ touchAction: 'manipulation' }}
            >
              <tab.icon className={clsx("w-6 h-6", activeTab === tab.id && "fill-current")} />
              <span className="text-xs">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
