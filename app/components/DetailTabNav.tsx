'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
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
  const [internalForceBrowserPlayer, setInternalForceBrowserPlayer] = useState(false);
  const [internalScanning, setInternalScanning] = useState(false);
  const [internalHdrDisplaySupported, setInternalHdrDisplaySupported] = useState(false);

  const activeDownloads = activeDownloadsProp ?? internalActiveDownloads;
  const forceBrowserPlayer = forceBrowserPlayerProp ?? internalForceBrowserPlayer;
  const scanning = scanningProp ?? internalScanning;
  const hdrDisplaySupported = hdrDisplaySupportedProp ?? internalHdrDisplaySupported;

  useEffect(() => {
    if (hdrDisplaySupportedProp != null || typeof window === 'undefined') return;

    const mq = window.matchMedia('(dynamic-range: high)');
    setInternalHdrDisplaySupported(mq.matches);
    const handler = (e: MediaQueryListEvent) => setInternalHdrDisplaySupported(e.matches);
    mq.addEventListener('change', handler);

    return () => mq.removeEventListener('change', handler);
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
      <nav className="fixed top-0 w-full z-40 glass-nav px-8 py-6 items-center justify-between hidden md:flex">
        <div className="flex items-center gap-8">
          <h1 className="text-3xl font-bold text-red-600 tracking-tighter">LFLIX</h1>
          <div className="flex gap-2 text-base font-medium">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={clsx(
                  'px-4 py-2 rounded-lg transition hover:text-white hover:bg-white/10 cursor-pointer min-w-[80px]',
                  tab.icon ? 'flex items-center gap-2' : '',
                  activeTab === tab.id ? 'text-white bg-white/10' : 'text-neutral-400'
                )}
              >
                {tab.icon === 'discover' && <Globe className="w-4 h-4" />}
                {tab.icon === 'live' && <Tv className="w-4 h-4" />}
                {tab.icon === 'watchlist' && <Bookmark className="w-4 h-4" />}
                {tab.label}
              </button>
            ))}

            <button
              onClick={() => {
                if (onShowLiveSports) {
                  onShowLiveSports();
                } else {
                  router.push('/?liveSports=1');
                }
              }}
              className={clsx(
                'px-4 py-2 rounded-lg transition hover:text-white hover:bg-white/10 cursor-pointer min-w-[80px] flex items-center gap-2',
                showLiveSportsActive ? 'text-white bg-white/10' : 'text-neutral-400'
              )}
            >
              <Trophy className="w-4 h-4" />
              Live Sports
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (onShowSearch) onShowSearch();
            }}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer min-w-[44px] min-h-[44px] items-center justify-center flex"
            title="Search (Press /)"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              if (onShowMobileConnect) {
                onShowMobileConnect();
              } else {
                setInternalShowMobileConnect(true);
              }
            }}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center"
            title="Connect Mobile"
          >
            <Smartphone className="w-6 h-6" />
          </button>

          <button
            onClick={() => {
              if (onShowDlna) {
                onShowDlna();
              } else {
                setInternalShowDlna(true);
              }
            }}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center"
            title="DLNA Server (VLC)"
          >
            <Cast className="w-6 h-6" />
          </button>

          <button
            onClick={() => {
              if (onToggleBrowserPlayer) {
                onToggleBrowserPlayer();
              } else {
                setInternalForceBrowserPlayer((prev) => !prev);
              }
            }}
            className={clsx(
              'p-3 hover:bg-white/10 rounded-full transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center',
              forceBrowserPlayer && 'text-blue-400'
            )}
            title={forceBrowserPlayer ? 'Browser Player ON (click to use VLC)' : 'Use Browser Player (for TV)'}
          >
            <Monitor className="w-6 h-6" />
          </button>

          <button
            onClick={handleRescan}
            disabled={scanning}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Refresh Library (Scan for new files)"
          >
            <RotateCw className={clsx('w-6 h-6', scanning && 'animate-spin')} />
          </button>

          <button
            onClick={() => {
              if (onShowFolderManager) {
                onShowFolderManager();
              } else {
                router.push('/?tab=all');
              }
            }}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Manage Folders"
          >
            <Plus className="w-7 h-7" />
          </button>

          <button
            onClick={() => {
              if (onShowDownloads) {
                onShowDownloads();
              } else {
                setInternalShowDownloads(true);
              }
            }}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center relative"
            title="Downloads"
          >
            <Download className="w-6 h-6" />
            {activeDownloads > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeDownloads}
              </span>
            )}
          </button>

          {/* Notification Bell */}
          <NotificationBell />

          <Link href={settingsHref} className="p-2 hover:bg-white/10 rounded-full transition" title="Settings">
            <Settings className="w-5 h-5" />
          </Link>

          <div
            className={clsx(
              'px-2 py-1 rounded text-[10px] font-bold tracking-wider border select-none',
              hdrDisplaySupported
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-neutral-800 text-neutral-500 border-neutral-700'
            )}
            title={hdrDisplaySupported ? 'This display supports HDR' : 'This display does not support HDR'}
          >
            HDR {hdrDisplaySupported ? 'ON' : 'OFF'}
          </div>

          <button
            onClick={async () => {
              if (onLogout) {
                await onLogout();
                return;
              }

              await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'same-origin' });
              router.push('/');
            }}
            className="p-2 hover:bg-white/10 rounded-full transition text-neutral-400 hover:text-white text-xs"
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
