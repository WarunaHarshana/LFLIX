'use client';

import { useState } from 'react';
import { Home, Film, Tv, Settings, Menu, X, Smartphone, Search, Radio, Trophy, Bookmark, Globe } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import NotificationBell from './NotificationBell';
import { triggerHaptic } from '@/lib/haptics';

type Tab = 'all' | 'movie' | 'show' | 'live' | 'watchlist' | 'discover';

type Props = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onShowQR: () => void;
  onShowSettings: () => void;
  onShowSearch: () => void;
  onShowLiveSports: () => void;
};

export default function MobileNav({ activeTab, onTabChange, onShowQR, onShowSettings, onShowSearch, onShowLiveSports }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const tabs = [
    { id: 'all' as Tab, label: 'Home', icon: Home },
    { id: 'discover' as Tab, label: 'Discover', icon: Globe },
    { id: 'movie' as Tab, label: 'Movies', icon: Film },
    { id: 'show' as Tab, label: 'Shows', icon: Tv },
    { id: 'live' as Tab, label: 'Live TV', icon: Radio },
    { id: 'watchlist' as Tab, label: 'Watchlist', icon: Bookmark },
  ];

    return (
    <>
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-[90] liquid-glass-dock border-b border-white/10 md:hidden pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <h1 className="text-xl font-black tracking-tighter accent-text">LFLIX</h1>
          <div className="flex items-center gap-1.5">
            <button aria-label="Search"
              onClick={() => {
                triggerHaptic('light');
                onShowSearch();
              }}
              className="liquid-orb p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-neutral-200 cursor-pointer"
              title="Search"
              style={{ touchAction: 'manipulation' }}
            >
              <Search className="w-4 h-4 pointer-events-none" />
            </button>
            <NotificationBell />
            <button aria-label="Connect Mobile"
              onClick={() => {
                triggerHaptic('light');
                onShowQR();
              }}
              className="liquid-orb p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-neutral-200 cursor-pointer"
              title="Connect Mobile"
              style={{ touchAction: 'manipulation' }}
            >
              <Smartphone className="w-4 h-4 pointer-events-none" />
            </button>
            <button
              onClick={() => {
                triggerHaptic('light');
                setIsOpen(!isOpen);
              }}
              className="liquid-orb p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-neutral-200 cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            >
              {isOpen ? <X className="w-4.5 h-4.5 pointer-events-none" /> : <Menu className="w-4.5 h-4.5 pointer-events-none" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="border-t border-white/10 p-3 space-y-1 bg-black/40 backdrop-blur-2xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  onTabChange(tab.id);
                  setIsOpen(false);
                }}
                className={clsx(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition",
                  activeTab === tab.id
                    ? 'liquid-glass-pill-active font-bold'
                    : 'liquid-glass-pill text-neutral-300 hover:text-white'
                )}
                style={{ touchAction: 'manipulation' }}
              >
                <tab.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{tab.label}</span>
              </button>
            ))}
            <div className="border-t border-white/10 mt-2 pt-2 space-y-1">
              <button
                onClick={() => {
                  onShowLiveSports();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl liquid-glass-pill text-neutral-300 hover:text-white transition"
                style={{ touchAction: 'manipulation' }}
              >
                <Trophy className="w-5 h-5" />
                <span className="font-medium text-sm">Live Sports</span>
              </button>
              <button
                onClick={() => {
                  onShowSettings();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl liquid-glass-pill text-neutral-300 hover:text-white transition"
                style={{ touchAction: 'manipulation' }}
              >
                <Settings className="w-5 h-5" />
                <span className="font-medium text-sm">Settings</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Liquid Glass Bottom Dock */}
      <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[90] liquid-glass-dock rounded-2xl md:hidden shadow-2xl p-1">
        <div className="flex items-center justify-around">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  triggerHaptic('selection');
                  onTabChange(tab.id);
                }}
                className={clsx(
                  "relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-2.5 rounded-xl transition-colors duration-200 select-none cursor-pointer",
                  isActive
                    ? 'text-black font-bold'
                    : 'text-neutral-400 hover:text-white'
                )}
                style={{ touchAction: 'manipulation' }}
              >
                {isActive && (
                  <motion.div
                    layoutId="mobileActiveTabIndicator"
                    className="absolute inset-0 rounded-xl liquid-glass-pill-active -z-10 shadow-sm"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                <tab.icon
                  className={clsx(
                    "w-5 h-5 transition-transform duration-200",
                    isActive && "scale-105"
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span className="text-[10px] font-semibold tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
