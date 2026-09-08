'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
  Globe,
  Tv,
  Trophy,
  Bookmark,
  Smartphone,
  Cast,
  Download,
  Monitor,
  RotateCw,
  Plus,
  Settings,
} from 'lucide-react';
import { apiUrl } from '@/lib/mobileConfig';
import { Search } from 'lucide-react';
import MobileConnectModal from './MobileConnectModal';
import DlnaModal from './DlnaModal';
import DownloadsPanel from './DownloadsPanel';
import NotificationBell from './NotificationBell';

type TabId = 'all' | 'movie' | 'show' | 'live' | 'watchlist' | 'discover';

type OnlineSearchItem = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
};

type ShowSearchItem = {
  id: number;
};

type DetailTabNavProps = {
  activeTab?: TabId;
  showLiveSportsActive?: boolean;
  onTabChange?: (tab: TabId) => void;
  onShowLiveSports?: () => void;
  onShowSearch?: () => void;
  onShowMobileConnect?: () => void;
  onShowDlna?: () => void;
  onShowDownloads?: () => void;
  activeDownloads?: number;
  forceBrowserPlayer?: boolean;
  onToggleBrowserPlayer?: () => void;
  onRescan?: () => void | Promise<void>;
  scanning?: boolean;
  onShowFolderManager?: () => void;
  settingsHref?: string;
  hdrDisplaySupported?: boolean;
  onLogout?: () => void | Promise<void>;
};

const tabs: Array<{ id: TabId; label: string; icon?: 'discover' | 'live' | 'watchlist' }> = [
  { id: 'all', label: 'Home' },
  { id: 'discover', label: 'Discover', icon: 'discover' },
  { id: 'movie', label: 'Movies' },
  { id: 'show', label: 'TV Shows' },
  { id: 'live', label: 'Live TV', icon: 'live' },
  { id: 'watchlist', label: 'Watchlist', icon: 'watchlist' },
];

export default function DetailTabNav({
  activeTab = 'discover',
  showLiveSportsActive = false,
  onTabChange,
  onShowLiveSports,
  onShowSearch,
  onShowMobileConnect,
  onShowDlna,
  onShowDownloads,
  activeDownloads: activeDownloadsProp,
  forceBrowserPlayer: forceBrowserPlayerProp,
  onToggleBrowserPlayer,
  onRescan,
  scanning: scanningProp,
  onShowFolderManager,
  settingsHref = '/settings',
  hdrDisplaySupported: hdrDisplaySupportedProp,
  onLogout,
}: DetailTabNavProps) {
  const router = useRouter();
  const [internalShowMobileConnect, setInternalShowMobileConnect] = useState(false);
  const [internalShowDlna, setInternalShowDlna] = useState(false);
  const [internalShowDownloads, setInternalShowDownloads] = useState(false);
  const [internalActiveDownloads, setInternalActiveDownloads] = useState(0);
  const [internalForceBrowserPlayer, setInternalForceBrowserPlayer] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('lflix-force-browser-player') === 'true';
    } catch {
      return false;
    }
  });
  const [internalScanning, setInternalScanning] = useState(false);
  const [internalHdrDisplaySupported, setInternalHdrDisplaySupported] = useState(false);

  const activeDownloads = activeDownloadsProp ?? internalActiveDownloads;
  const forceBrowserPlayer = forceBrowserPlayerProp ?? internalForceBrowserPlayer;
  const scanning = scanningProp ?? internalScanning;
  const hdrDisplaySupported = hdrDisplaySupportedProp ?? internalHdrDisplaySupported;

  const handleToggleBrowserPlayer = () => {
    if (onToggleBrowserPlayer) {
      onToggleBrowserPlayer();
    } else {
      setInternalForceBrowserPlayer((prev) => {
        const next = !prev;
        try {
          localStorage.setItem('lflix-force-browser-player', String(next));
        } catch {}
        return next;
      });
    }
  };

  // HDR Display Auto-Detection (live — auto-toggles when moving between SDR and HDR monitors)
  useEffect(() => {
    if (hdrDisplaySupportedProp != null || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    let mqDynamicRange: MediaQueryList | null = null;
    let mqVideoDynamicRange: MediaQueryList | null = null;

    const checkHdr = () => {
      try {
        const dr = window.matchMedia('(dynamic-range: high)');
        const vdr = window.matchMedia('(video-dynamic-range: high)');
        setInternalHdrDisplaySupported(!!(dr?.matches || vdr?.matches));
      } catch {}
    };

    checkHdr();

    const handler = () => checkHdr();

    try {
      mqDynamicRange = window.matchMedia('(dynamic-range: high)');
      if (typeof mqDynamicRange.addEventListener === 'function') {
        mqDynamicRange.addEventListener('change', handler);
      } else if (typeof (mqDynamicRange as any).addListener === 'function') {
        (mqDynamicRange as any).addListener(handler);
      }
    } catch {}

    try {
      mqVideoDynamicRange = window.matchMedia('(video-dynamic-range: high)');
      if (typeof mqVideoDynamicRange.addEventListener === 'function') {
        mqVideoDynamicRange.addEventListener('change', handler);
      } else if (typeof (mqVideoDynamicRange as any).addListener === 'function') {
        (mqVideoDynamicRange as any).addListener(handler);
      }
    } catch {}

    window.addEventListener('resize', handler);
    window.addEventListener('focus', handler);
    const interval = setInterval(checkHdr, 2000);

    return () => {
      try {
        if (mqDynamicRange) {
          if (typeof mqDynamicRange.removeEventListener === 'function') {
            mqDynamicRange.removeEventListener('change', handler);
          } else if (typeof (mqDynamicRange as any).removeListener === 'function') {
            (mqDynamicRange as any).removeListener(handler);
          }
        }
        if (mqVideoDynamicRange) {
          if (typeof mqVideoDynamicRange.removeEventListener === 'function') {
            mqVideoDynamicRange.removeEventListener('change', handler);
          } else if (typeof (mqVideoDynamicRange as any).removeListener === 'function') {
            (mqVideoDynamicRange as any).removeListener(handler);
          }
        }
      } catch {}
      window.removeEventListener('resize', handler);
      window.removeEventListener('focus', handler);
      clearInterval(interval);
    };
  }, [hdrDisplaySupportedProp]);

  useEffect(() => {
    if (activeDownloadsProp != null) return;

    let cancelled = false;

    const fetchActiveDownloads = async () => {
      try {
        const res = await fetch('/api/downloads', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const downloads = Array.isArray(data.downloads) ? data.downloads : [];
        const count = downloads.filter((d: any) =>
          d.status === 'metadata' || d.status === 'downloading' || d.status === 'stalled' || d.status === 'paused'
        ).length;
        if (!cancelled) {
          setInternalActiveDownloads(count);
        }
      } catch {
        // Ignore polling errors in navbar.
      }
    };

    void fetchActiveDownloads();
    const interval = setInterval(fetchActiveDownloads, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeDownloadsProp]);

  const switchTab = (tab: TabId) => {
    if (onTabChange) {
      onTabChange(tab);
      return;
    }

    router.push(`/?tab=${tab}`);
  };

  const handleRescan = async () => {
    if (onRescan) {
      await onRescan();
      return;
    }

    setInternalScanning(true);
    try {
      await fetch(apiUrl('/api/rescan'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore and keep nav responsive.
    } finally {
      setInternalScanning(false);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 w-full z-40 px-6 sm:px-8 lg:px-10 py-4 sm:py-5 items-center justify-between hidden md:flex transition-all duration-300 bg-gradient-to-b from-black/65 via-black/20 to-transparent">
        <div className="flex items-center gap-6 lg:gap-8">
          <h1 className="text-3xl sm:text-4xl font-black accent-text tracking-tighter select-none drop-shadow-md">LFLIX</h1>
          
          {/* Navigation Tabs */}
          <div className="flex items-center gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id && !showLiveSportsActive;
              return (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={clsx(
                    'relative px-4 sm:px-4.5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 cursor-pointer min-w-[76px] flex items-center justify-center gap-2 select-none min-h-[44px]',
                    isActive
                      ? 'text-white font-bold bg-white/20 border border-white/40 shadow-[0_2px_14px_rgba(255,255,255,0.25)] backdrop-blur-xl'
                      : 'liquid-glass-pill text-neutral-300 hover:text-white'
                  )}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2 drop-shadow-sm">
                    {tab.icon === 'discover' && <Globe className="w-4.5 h-4.5" />}
                    {tab.icon === 'live' && <Tv className="w-4.5 h-4.5" />}
                    {tab.icon === 'watchlist' && <Bookmark className="w-4.5 h-4.5" />}
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => {
                if (onShowLiveSports) {
                  onShowLiveSports();
                } else {
                  router.push('/?liveSports=1');
                }
              }}
              className={clsx(
                'relative px-4 sm:px-4.5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition-all duration-200 cursor-pointer min-w-[76px] flex items-center justify-center gap-2 select-none min-h-[44px]',
                showLiveSportsActive
                  ? 'text-white font-bold bg-white/20 border border-white/40 shadow-[0_2px_14px_rgba(255,255,255,0.25)] backdrop-blur-xl'
                  : 'liquid-glass-pill text-neutral-300 hover:text-white'
              )}
            >
              <span className="relative z-10 flex items-center justify-center gap-2 drop-shadow-sm">
                <Trophy className="w-4.5 h-4.5" />
                <span>Live Sports</span>
              </span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            aria-label="Search (Press /)"
            onClick={() => {
              if (onShowSearch) onShowSearch();
            }}
            className="liquid-glass-pill p-2.5 sm:p-3 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Search (Press /)"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            aria-label="Connect Mobile"
            onClick={() => {
              if (onShowMobileConnect) {
                onShowMobileConnect();
              } else {
                setInternalShowMobileConnect(true);
              }
            }}
            className="liquid-glass-pill p-2.5 sm:p-3 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center"
            title="Connect Mobile"
          >
            <Smartphone className="w-5 h-5" />
          </button>

          <button
            aria-label="Cast to Smart TV (DLNA)"
            onClick={() => {
              if (onShowDlna) {
                onShowDlna();
              } else {
                setInternalShowDlna(true);
              }
            }}
            className="liquid-glass-pill p-2.5 sm:p-3 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center"
            title="Cast to Smart TV (DLNA)"
          >
            <Cast className="w-5 h-5" />
          </button>

          <button
            type="button"
            aria-label={forceBrowserPlayer ? 'Browser Player: ON (click to use native player)' : 'Browser Player: OFF (click to enable for TV)'}
            onClick={handleToggleBrowserPlayer}
            className={clsx(
              'liquid-glass-pill px-3 py-2 sm:py-2.5 rounded-xl transition-all duration-200 cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center gap-1.5 relative select-none active:scale-95',
              forceBrowserPlayer
                ? 'border-sky-400 bg-sky-500/25 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.5)] ring-1 ring-sky-400/50 font-bold'
                : 'text-neutral-300 hover:text-white border-white/10 hover:border-white/20 bg-black/20'
            )}
            title={forceBrowserPlayer ? 'Browser Player: ON (Click to switch to VLC/MPV)' : 'Browser Player: OFF (Click to force Browser Player for TV/devices)'}
          >
            <Monitor className={clsx('w-5 h-5 flex-shrink-0', forceBrowserPlayer ? 'text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]' : 'text-neutral-300')} />
            <span className={clsx('text-xs font-black tracking-wider uppercase', forceBrowserPlayer ? 'text-sky-200' : 'text-neutral-400 hidden xl:inline')}>
              {forceBrowserPlayer ? 'WEB ON' : 'WEB'}
            </span>
            {forceBrowserPlayer && (
              <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-pulse flex-shrink-0" />
            )}
          </button>

          <button
            aria-label="Refresh Library (Scan for new files)"
            onClick={handleRescan}
            disabled={scanning}
            className="liquid-glass-pill p-2.5 sm:p-3 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Refresh Library (Scan for new files)"
          >
            <RotateCw className={clsx('w-5 h-5', scanning && 'animate-spin')} />
          </button>

          <button
            aria-label="Manage Folders"
            onClick={() => {
              if (onShowFolderManager) {
                onShowFolderManager();
              } else {
                router.push('/?tab=all');
              }
            }}
            className="liquid-glass-pill p-2.5 sm:p-3 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Manage Folders"
          >
            <Plus className="w-5 h-5" />
          </button>

          <button
            aria-label="Downloads"
            onClick={() => {
              if (onShowDownloads) {
                onShowDownloads();
              } else {
                setInternalShowDownloads(true);
              }
            }}
            className="liquid-glass-pill p-2.5 sm:p-3 text-neutral-200 hover:text-white rounded-xl transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center relative"
            title="Downloads"
          >
            <Download className="w-5 h-5" />
            {activeDownloads > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-tr from-amber-500 to-amber-300 text-black text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-amber-500/40 border border-white/40 animate-pulse">
                {activeDownloads}
              </span>
            )}
          </button>

          {/* Notification Bell */}
          <NotificationBell />

          <Link
            href={settingsHref}
            className="liquid-glass-pill p-2.5 sm:p-3 text-neutral-200 hover:text-white rounded-xl transition min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </Link>

          <div
            className={clsx(
              'liquid-glass-pill px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm tracking-wider select-none border flex items-center min-h-[44px] transition-all duration-300',
              hdrDisplaySupported
                ? 'border-amber-400 bg-amber-500/25 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.5)] ring-1 ring-amber-400/60 font-black'
                : 'border-white/10 text-neutral-400 bg-black/30 font-semibold'
            )}
            title={
              hdrDisplaySupported
                ? 'HDR Display: ACTIVE (High dynamic range display auto-detected)'
                : 'HDR Display: OFF (Standard dynamic range display auto-detected)'
            }
          >
            {hdrDisplaySupported ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_#fbbf24] mr-2 flex-shrink-0 animate-pulse" />
                <span>HDR ON</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-neutral-600 mr-2 flex-shrink-0" />
                <span>HDR OFF</span>
              </>
            )}
          </div>

          <button
            aria-label="Logout"
            onClick={async () => {
              if (onLogout) {
                await onLogout();
                return;
              }

              await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'same-origin' });
              router.push('/');
            }}
            className="liquid-glass-pill px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-neutral-300 hover:text-white hover:border-red-500/40 transition cursor-pointer min-h-[44px] flex items-center"
            title="Logout"
          >
            Exit
          </button>
        </div>
      </nav>

      {!onShowMobileConnect && internalShowMobileConnect && <MobileConnectModal onClose={() => setInternalShowMobileConnect(false)} />}
      {!onShowDlna && internalShowDlna && <DlnaModal onClose={() => setInternalShowDlna(false)} />}
      {!onShowDownloads && <DownloadsPanel isOpen={internalShowDownloads} onClose={() => setInternalShowDownloads(false)} />}
    </>
  );
}
