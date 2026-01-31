'use client';

import { useState } from 'react';
import { Home, Film, Tv, Settings, Menu, X, Smartphone } from 'lucide-react';
import clsx from 'clsx';

type Tab = 'all' | 'movie' | 'show';

type Props = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onShowQR: () => void;
  onShowSettings: () => void;
};

export default function MobileNav({ activeTab, onTabChange, onShowQR, onShowSettings }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const tabs = [
    { id: 'all' as Tab, label: 'Home', icon: Home },
    { id: 'movie' as Tab, label: 'Movies', icon: Film },
    { id: 'show' as Tab, label: 'TV Shows', icon: Tv },
  ];

  return (
    <>
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-neutral-800 md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold tracking-tighter text-red-600">LOCALFLIX</h1>
          <div className="flex items-center gap-2">
            <button 
              onClick={onShowQR}
              className="p-2 hover:bg-neutral-800 rounded-full transition"
              title="Connect Mobile"
            >
              <Smartphone className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 hover:bg-neutral-800 rounded-full transition"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
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
                  "w-full flex items-center gap-3 px-4 py-3 transition",
                  activeTab === tab.id 
                    ? 'bg-red-600 text-white' 
                    : 'text-neutral-400 hover:bg-neutral-800'
                )}
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
                className="w-full flex items-center gap-3 px-4 py-3 text-neutral-400 hover:bg-neutral-800 transition"
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
              className={clsx(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition",
                activeTab === tab.id 
                  ? 'text-red-500' 
                  : 'text-neutral-500 hover:text-neutral-300'
              )}
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
