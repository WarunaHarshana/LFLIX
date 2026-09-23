'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Keyboard, X } from 'lucide-react';
import clsx from 'clsx';
import { Capacitor } from '@capacitor/core';
import { apiUrl } from '@/lib/mobileConfig';
import { cachedFetch, invalidateQuery } from '@/lib/clientQueryCache';
import { useAppStore } from './store/useAppStore';
import type { ContentItem, Season, DiscoverOnlineItem, TabId } from './types';
import { isValidTab } from './types';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

// Hooks
import { useToast } from './hooks/useToast';
import { useAuth } from './hooks/useAuth';
import { useLibrary } from './hooks/useLibrary';
import { usePlayback } from './hooks/usePlayback';
import { useIPTV } from './hooks/useIPTV';
import { useContinueWatching } from './hooks/useContinueWatching';
import { useHero } from './hooks/useHero';
import { useDownloads } from './hooks/useDownloads';

// Components — always visible or lightweight (static imports)
import EmptyState from './components/EmptyState';
import { HeroSkeleton, CardGridSkeleton } from './components/LoadingStates';
import MobileNav from './components/MobileNav';
import FloatingQRButton from './components/FloatingQRButton';
import DetailTabNav from './components/DetailTabNav';
import GlobalDropzone from './components/GlobalDropzone';

// Section components (lightweight, used on main page)
import HeroSection from './components/HeroSection';
import LibraryGrid from './components/LibraryGrid';
import LiveTVSection from './components/LiveTVSection';
import ContextMenuOverlay from './components/ContextMenuOverlay';
import ToastNotification from './components/ToastNotification';

// Heavy modals & pages — lazy loaded (only fetched when opened)
const VideoPlayer = dynamic(() => import('./components/VideoPlayer'), { ssr: false });
const SetupWizard = dynamic(() => import('./components/SetupWizard'), { ssr: false });
const LoginScreen = dynamic(() => import('./components/LoginScreen'), { ssr: false });
const FolderManager = dynamic(() => import('./components/FolderManager'), { ssr: false });
const MobileSearchModal = dynamic(() => import('./components/MobileSearchModal'), { ssr: false });
const EpisodeModal = dynamic(() => import('./components/EpisodeModal'), { ssr: false });
const ContentDetailModal = dynamic(() => import('./components/ContentDetailModal'), { ssr: false });
const TitleDetailPage = dynamic(() => import('./components/TitleDetailPage'), { ssr: false });
const GlobalSearchModal = dynamic(() => import('./components/GlobalSearchModal'), { ssr: false });
const DiscoverPage = dynamic(() => import('./components/DiscoverPage'), { ssr: false });
const TorrentSearchPage = dynamic(() => import('./components/TorrentSearchPage'), { ssr: false });
const WatchlistPage = dynamic(() => import('./components/WatchlistPage'), { ssr: false });
const LiveSports = dynamic(() => import('./components/LiveSports'), { ssr: false });
const IPTVManager = dynamic(() => import('./components/IPTVManager'), { ssr: false });
const DlnaModal = dynamic(() => import('./components/DlnaModal'), { ssr: false });
const MobileConnectModal = dynamic(() => import('./components/MobileConnectModal'), { ssr: false });
const DownloadsPanel = dynamic(() => import('./components/DownloadsPanel'), { ssr: false });
const FixMatchModal = dynamic(() => import('./components/FixMatchModal'), { ssr: false });
const PlayChoiceModal = dynamic(() => import('./components/PlayChoiceModal'), { ssr: false });

export default function Home() {
  const router = useRouter();
  // ──────────────────── Hooks ────────────────────
  const { toast, showToast } = useToast();
  const { setupComplete, setSetupComplete, isAuthenticated, setIsAuthenticated, authChecked, logout } = useAuth();
  const {
    library, genres, languages, loading, setLoading,
    selectedGenre, setSelectedGenre,
    selectedLanguage, setSelectedLanguage,
    sortBy, setSortBy,
    displayPrefs, updateDisplayPref,
    fetchLibrary, handleScan, getFilteredLibrary,
  } = useLibrary(showToast);
  const { fetchContinueWatching } = useContinueWatching();
  const iptv = useIPTV();
  const { activeDownloads, showDownloads, setShowDownloads } = useDownloads();
  const playback = usePlayback(library, showToast);

  // ──────────────────── Local State (Zustand) ────────────────────
  const {
    activeTab, setActiveTab,
    showShortcutHelp, setShowShortcutHelp,
    selectedShow, setSelectedShow,
    seasons, setSeasons,
    loadingEpisodes, setLoadingEpisodes,
    showFolderManager, setShowFolderManager,
    contextMenu, setContextMenu,
    selectedDetail, setSelectedDetail,
    focusedIndex, setFocusedIndex,
    showMobileConnect, setShowMobileConnect,
    showDlna, setShowDlna,
    showMobileSearch, setShowMobileSearch,
    showLiveSports, setShowLiveSports,
    showSearchModal, setShowSearchModal,
    discoverInitialItem, setDiscoverInitialItem,
    discoverMode, setDiscoverMode,
    torrentInitialQuery, setTorrentInitialQuery
  } = useAppStore();

  const [fixMatchItem, setFixMatchItem] = useState<ContentItem | null>(null);

  // ──────────────────── Computed ────────────────────
  const filteredLibrary = useMemo(() => getFilteredLibrary(activeTab), [getFilteredLibrary, activeTab]);
  const hero = useHero(filteredLibrary);

  // Available genres and languages dynamically computed for the active tab
  const availableGenres = useMemo(() => {
    const tabItems = activeTab === 'all'
      ? library
      : library.filter(item => item.type === activeTab);
    const genreSet = new Set<string>();
    for (const item of tabItems) {
      if (item.genres) {
        item.genres.split(',').forEach(g => {
          const trimmed = g.trim();
          if (trimmed) genreSet.add(trimmed);
        });
      }
    }
    return Array.from(genreSet).sort();
  }, [library, activeTab]);

  const availableLanguages = useMemo(() => {
    const tabItems = activeTab === 'all'
      ? library
      : library.filter(item => item.type === activeTab);
    const langSet = new Set<string>();
    for (const item of tabItems) {
      if (item.language) {
        const trimmed = item.language.trim();
        if (trimmed) langSet.add(trimmed);
      }
    }
    return Array.from(langSet).sort();
  }, [library, activeTab]);

  // If active genre/language is not in available options for this tab, clear it
  useEffect(() => {
    if (selectedGenre && !availableGenres.includes(selectedGenre)) {
      setSelectedGenre(null);
    }
  }, [availableGenres, selectedGenre, setSelectedGenre]);

  useEffect(() => {
    if (selectedLanguage && !availableLanguages.includes(selectedLanguage)) {
      setSelectedLanguage(null);
    }
  }, [availableLanguages, selectedLanguage, setSelectedLanguage]);

  // ──────────────────── Refs ────────────────────
  const libraryRef = useRef(library);
  const filteredLibraryRef = useRef(filteredLibrary);
  const activeTabRef = useRef(activeTab);
  const selectedGenreRef = useRef(selectedGenre);
  const focusedIndexRef = useRef(focusedIndex);
  const playbackRef = useRef(playback);
  const selectedShowRef = useRef(selectedShow);
  const selectedDetailRef = useRef(selectedDetail);
  const previousLibraryScrollY = useRef(0);
  const [detailInitialSection, setDetailInitialSection] = useState<'top' | 'episodes'>('top');

  useEffect(() => {
    libraryRef.current = library;
    filteredLibraryRef.current = filteredLibrary;
    activeTabRef.current = activeTab;
    selectedGenreRef.current = selectedGenre;
    focusedIndexRef.current = focusedIndex;
    playbackRef.current = playback;
    selectedShowRef.current = selectedShow;
    selectedDetailRef.current = selectedDetail;
  }, [library, filteredLibrary, activeTab, selectedGenre, focusedIndex, playback, selectedShow, selectedDetail]);

  // ──────────────────── Tab Switching ────────────────────
  const switchTab = (tab: TabId) => {
    setFocusedIndex(-1);
    setSelectedGenre(null);
    setSelectedLanguage(null);
    setSelectedDetail(null);
    setDiscoverInitialItem(null);
    if (tab === 'discover') {
      setDiscoverMode('online');
      setTorrentInitialQuery('');
    }
    if (tab !== 'discover' && activeTab === 'discover') {
      setDiscoverMode('online');
      setTorrentInitialQuery('');
    }
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = tab === 'all' ? window.location.pathname : `?tab=${tab}`;
      window.history.replaceState(null, '', url);
    }
  };

  // Tab from URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateTabFromUrl = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const requestedTab = searchParams.get('tab');
      const openLiveSports = searchParams.get('liveSports') === '1';
      if (openLiveSports) setShowLiveSports(true);
      if (isValidTab(requestedTab)) {
        if (requestedTab === 'all') setSelectedGenre(null);
        if (requestedTab === 'discover') {
          setDiscoverMode('online');
          setTorrentInitialQuery('');
          setDiscoverInitialItem(null);
        }
        setActiveTab(requestedTab);
      }

      // Title detail page navigation sync
      const titleParam = searchParams.get('title');
      if (titleParam) {
        const [tType, tIdStr] = titleParam.split(':');
        const tId = parseInt(tIdStr, 10);
        if (tId && libraryRef.current.length > 0) {
          const found = libraryRef.current.find(
            (i) => (i.type === tType || (tType === 'tv' && i.type === 'show')) && (i.id === tId || i.tmdbId === tId)
          );
          if (found) setSelectedDetail(found);
        }
      } else if (selectedDetailRef.current) {
        setSelectedDetail(null);
      }
    };

    updateTabFromUrl();
    window.addEventListener('popstate', updateTabFromUrl);
    return () => window.removeEventListener('popstate', updateTabFromUrl);
  }, [setActiveTab, setDiscoverMode, setTorrentInitialQuery, setDiscoverInitialItem, setSelectedGenre, setShowLiveSports, setSelectedDetail]);

  const openOnlineInDiscover = (item: DiscoverOnlineItem) => {
    closeTitleDetail();
    setDiscoverMode('online');
    setDiscoverInitialItem(null);
    setActiveTab('discover');
    router.push(`/discover/${item.mediaType}/${item.tmdbId}`);
  };

  // ──────────────────── Data Fetch on Mount ────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchLibrary();
    fetchContinueWatching();
    iptv.fetchIPTVChannels();
  }, [isAuthenticated, fetchLibrary, fetchContinueWatching, iptv.fetchIPTVChannels]);

  // ──────────────────── SSE Watcher ────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connect = () => {
      eventSource = new EventSource('/api/watcher');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_file') {
            showToast('New video detected, scanning...', 'success');
          } else if (data.type === 'scan_complete' && data.added > 0) {
            showToast(`Added ${data.added} new item${data.added > 1 ? 's' : ''} to library`, 'success');
            invalidateQuery(/\/api\/episodes/);
            fetchLibrary();
            fetchContinueWatching();
            if (selectedShowRef.current) {
              openShow(selectedShowRef.current, true);
            }
          } else if (data.type === 'file_removed') {
            showToast('Item removed from library', 'success');
            invalidateQuery(/\/api\/episodes/);
            fetchLibrary();
            fetchContinueWatching();
            if (selectedShowRef.current) {
              openShow(selectedShowRef.current, true);
            }
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };
      eventSource.onerror = () => {
        eventSource?.close();
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [isAuthenticated, fetchLibrary, fetchContinueWatching]);

  // ──────────────────── Android Back Button ────────────────────
  useEffect(() => {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', () => {
        if (!!document.querySelector('.fixed.inset-0.z-\\[100\\]')) { playback.setVideoPlayer(null); return; }
        if (selectedShow) { setSelectedShow(null); return; }
        if (showFolderManager) { setShowFolderManager(false); return; }
        if (showMobileConnect) { setShowMobileConnect(false); return; }
        if (showDlna) { setShowDlna(false); return; }
        if (showMobileSearch) { setShowMobileSearch(false); return; }
        if (showLiveSports) { setShowLiveSports(false); return; }
        if (iptv.showIPTVManager) { iptv.setShowIPTVManager(false); return; }
        if (activeTabRef.current !== 'all') { setActiveTab('all'); return; }
        App.exitApp();
      });
    }).catch(() => {});
    return () => {
      import('@capacitor/app').then(({ App }) => { App.removeAllListeners(); }).catch(() => {});
    };
  }, [selectedShow, showFolderManager, showMobileConnect, showDlna, showMobileSearch, showLiveSports, iptv.showIPTVManager]);

  // ──────────────────── Keyboard Navigation ────────────────────
  const getGridColumns = useCallback(() => {
    if (typeof window === 'undefined') return displayPrefs.gridColumns || 8;
    const width = window.innerWidth;
    const pref = displayPrefs.gridColumns || 8;
    if (width >= 1536) return pref;
    if (width >= 1280) return Math.min(pref, 6);
    if (width >= 1024) return Math.min(pref, 6);
    if (width >= 768) return Math.min(pref, 4);
    return 2;
  }, [displayPrefs.gridColumns]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const cols = getGridColumns();
      const filtered = filteredLibraryRef.current;
      switch (e.key) {
        case '/': e.preventDefault(); setShowSearchModal(true); break;
        case 'f': case 'F': e.preventDefault(); setShowFolderManager(true); break;
        case '?': e.preventDefault(); setShowShortcutHelp(prev => !prev); break;
        case 'Escape':
          setSelectedShow(null); setShowFolderManager(false); setShowShortcutHelp(false);
          setContextMenu(null); setFocusedIndex(-1); break;
        case 'ArrowRight': e.preventDefault(); setFocusedIndex(prev => Math.min(prev + 1, filtered.length - 1)); break;
        case 'ArrowLeft': e.preventDefault(); setFocusedIndex(prev => Math.max(prev - 1, 0)); break;
        case 'ArrowDown': e.preventDefault(); setFocusedIndex(prev => Math.min(prev + cols, filtered.length - 1)); break;
        case 'ArrowUp': e.preventDefault(); setFocusedIndex(prev => Math.max(prev - cols, 0)); break;
        case 'Enter':
          const fi = focusedIndexRef.current;
          if (fi >= 0 && filtered[fi]) setSelectedDetail(filtered[fi]);
          break;
      }
    };

    const handlePointerInteraction = (e: MouseEvent) => {
      if (focusedIndexRef.current !== -1 && (e.movementX !== 0 || e.movementY !== 0)) {
        setFocusedIndex(-1);
      }
    };

    const handlePointerDown = () => {
      if (focusedIndexRef.current !== -1) {
        setFocusedIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('mousemove', handlePointerInteraction, { passive: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerInteraction);
    };
  }, [setFocusedIndex]);

  // If filtered list changes and focused index is now out-of-bounds, reset it
  useEffect(() => {
    if (focusedIndex >= filteredLibrary.length) {
      setFocusedIndex(-1);
    }
  }, [filteredLibrary.length, focusedIndex, setFocusedIndex]);

  // ──────────────────── Cross-Hook Handlers ────────────────────
  const openTitleDetail = useCallback((item: ContentItem, targetSection: 'top' | 'episodes' = 'top') => {
    setFocusedIndex(-1);
    if (typeof window !== 'undefined') {
      previousLibraryScrollY.current = window.scrollY;
    }
    setDetailInitialSection(targetSection);
    setSelectedDetail(item);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('title', `${item.type}:${item.id}`);
      window.history.pushState({ titleId: item.id }, '', url.toString());
      if (targetSection === 'top') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    }
  }, [setSelectedDetail, setFocusedIndex]);

  const closeTitleDetail = useCallback(() => {
    setSelectedDetail(null);
    setDetailInitialSection('top');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('title')) {
        url.searchParams.delete('title');
        window.history.pushState(null, '', url.toString());
      }
      const restoreY = previousLibraryScrollY.current;
      requestAnimationFrame(() => {
        window.scrollTo({ top: restoreY, left: 0, behavior: 'instant' });
      });
    }
  }, [setSelectedDetail]);

  const openShow = useCallback((show: ContentItem, _forceFresh?: boolean) => {
    openTitleDetail(show, 'episodes');
  }, [openTitleDetail]);

  const handleCardClick = useCallback((item: ContentItem) => {
    openTitleDetail(item, 'top');
  }, [openTitleDetail]);

  const handlePlayClick = useCallback((item: ContentItem) => {
    setFocusedIndex(-1);
    if (item.type === 'movie') {
      playbackRef.current.playFile('movie', item.id, undefined, item.watchProgress?.progress);
    } else {
      openTitleDetail(item, 'episodes');
    }
  }, [openTitleDetail, setFocusedIndex]);

  const handleContextMenu = useCallback((e: React.MouseEvent, item: ContentItem) => {
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, [setContextMenu]);

  const handleGenreClear = useCallback(() => {
    setSelectedGenre(null);
  }, [setSelectedGenre]);

  const handleRescanAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/rescan'), { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        showToast(`Rescanned ${data.folders} folders. Added ${data.added} new items.`, 'success');
        await fetchLibrary();
        await fetchContinueWatching();
      } else {
        showToast(data.error || 'Rescan failed', 'error');
      }
    } catch (e) {
      showToast('Failed to rescan folders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromLibrary = async (item: ContentItem) => {
    const confirmed = confirm(`Remove "${item.title}" from library? The file will remain on disk.`);
    if (!confirmed) return;
    try {
      const res = await fetch(apiUrl(`/api/delete?type=${item.type}&id=${item.id}&deleteFile=0`), {
        method: 'DELETE', credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Remove failed');
      showToast(`"${item.title}" removed from library`, 'success');
      invalidateQuery(`/api/episodes?showId=${item.id}`);
      if (selectedShow && selectedShow.id === item.id) {
        setSelectedShow(null);
      }
      setContextMenu(null);
      await fetchLibrary();
    } catch (e) {
      showToast('Failed to remove item from library', 'error');
    }
  };

  const handleDelete = async (item: ContentItem) => {
    const confirmed = confirm(`Delete "${item.title}" from library AND local disk permanently?`);
    if (!confirmed) return;
    try {
      const res = await fetch(apiUrl(`/api/delete?type=${item.type}&id=${item.id}&deleteFile=1`), {
        method: 'DELETE', credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (data.fileErrors && data.fileErrors[0]) || 'Delete failed');
      }
      showToast(`Deleted (${data.filesDeleted ?? 0} file(s) removed from disk)`, 'success');
      invalidateQuery(`/api/episodes?showId=${item.id}`);
      if (selectedShow && selectedShow.id === item.id) {
        setSelectedShow(null);
      }
      setContextMenu(null);
      await fetchLibrary();
    } catch (e: any) {
      showToast(e.message || 'Failed to delete item', 'error');
      await fetchLibrary();
    }
  };

  const handleDeleteEpisode = async (episodeId: number) => {
    const confirmed = confirm('Delete this episode from library AND local disk permanently?');
    if (!confirmed) return;
    // Optimistically update UI immediately so deleted episode disappears with zero lag
    setSeasons(prev =>
      (Array.isArray(prev) ? prev : [])
        .map(s => ({
          ...s,
          episodes: s.episodes.filter(ep => ep.id !== episodeId)
        }))
        .filter(s => s.episodes.length > 0)
    );
    try {
      const res = await fetch(apiUrl(`/api/delete?type=episode&id=${episodeId}&deleteFile=1`), {
        method: 'DELETE', credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (data.fileErrors && data.fileErrors[0]) || 'Delete failed');
      }
      showToast(`Episode deleted (${data.filesDeleted ?? 0} file removed)`, 'success');
      if (selectedShow) {
        invalidateQuery(`/api/episodes?showId=${selectedShow.id}`);
        await openShow(selectedShow, true);
      }
      await fetchLibrary();
    } catch (e: any) {
      showToast(e.message || 'Failed to delete episode', 'error');
      if (selectedShow) openShow(selectedShow, true);
      await fetchLibrary();
    }
  };

  const handleRemoveEpisodeFromLibrary = async (episodeId: number) => {
    const confirmed = confirm('Remove this episode from library? The file will remain on disk.');
    if (!confirmed) return;
    // Optimistically update UI immediately
    setSeasons(prev =>
      (Array.isArray(prev) ? prev : [])
        .map(s => ({
          ...s,
          episodes: s.episodes.filter(ep => ep.id !== episodeId)
        }))
        .filter(s => s.episodes.length > 0)
    );
    try {
      const res = await fetch(apiUrl(`/api/delete?type=episode&id=${episodeId}&deleteFile=0`), {
        method: 'DELETE', credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Remove failed');
      showToast('Episode removed from library', 'success');
      if (selectedShow) {
        invalidateQuery(`/api/episodes?showId=${selectedShow.id}`);
        await openShow(selectedShow, true);
      }
      await fetchLibrary();
    } catch (e) {
      showToast('Failed to remove episode from library', 'error');
      if (selectedShow) openShow(selectedShow, true);
    }
  };

  const handleMarkWatched = async (item: ContentItem, watched: boolean, episodeId?: number) => {
    try {
      const res = await fetch(apiUrl('/api/history/mark'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ contentType: item.type, contentId: item.id, episodeId, watched })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast(watched ? `Marked "${item.title}" as watched` : `Marked "${item.title}" as unwatched`, 'success');
      setContextMenu(null);
      await fetchContinueWatching();
      await fetchLibrary();
    } catch (e) {
      showToast('Failed to update watch status', 'error');
    }
  };

  // ──────────────────── Guards ────────────────────
  if (setupComplete === false) return <SetupWizard onComplete={() => setSetupComplete(true)} />;
  // Hold the splash until the session probe answers too, otherwise an already
  // signed-in user sees the login screen flash before being let through.
  if (setupComplete === null || !authChecked) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-pulse"><h1 className="text-4xl font-bold accent-text tracking-tighter">LFLIX</h1></div>
      </div>
    );
  }
  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  // ──────────────────── Render ────────────────────
  return (
    <main className="min-h-screen bg-[var(--background)] text-white font-sans selection:bg-red-900 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">

      {/* Sticky Global Top Navbar (visible across both library and detail pages) */}
      <DetailTabNav
        activeTab={activeTab}
        showLiveSportsActive={showLiveSports}
        onBack={selectedDetail ? closeTitleDetail : undefined}
        onTabChange={(tab) => {
          if (selectedDetail) {
            closeTitleDetail();
          }
          switchTab(tab);
        }}
        onShowLiveSports={() => {
          if (selectedDetail) closeTitleDetail();
          setShowLiveSports(true);
        }}
        onShowSearch={() => setShowSearchModal(true)}
        onShowMobileConnect={() => setShowMobileConnect(true)}
        onShowDlna={() => setShowDlna(true)}
        onShowDownloads={() => setShowDownloads(true)}
        activeDownloads={activeDownloads}
        forceBrowserPlayer={playback.forceBrowserPlayer}
        onToggleBrowserPlayer={() => {
          const next = !playback.forceBrowserPlayer;
          playback.setForceBrowserPlayer(next);
          showToast(next ? 'Browser Player activated (for TV & web playback)' : 'Browser Player deactivated (using native VLC/MPV)', 'success');
        }}
        onRescan={handleRescanAll}
        scanning={loading}
        onShowFolderManager={() => setShowFolderManager(true)}
        hdrDisplaySupported={playback.hdrDisplaySupported}
        onLogout={logout}
      />

      {/* Main Library View (hidden when TitleDetailPage is active to preserve scroll position and DOM cache) */}
      <div className={selectedDetail ? "hidden" : "contents"}>

        {/* Library Content (movie/show/all tabs) */}
        {activeTab !== 'live' && activeTab !== 'watchlist' && activeTab !== 'discover' && (loading ? (
          <>
            <HeroSkeleton />
            <div className="px-12 pb-20 pt-6 sm:pt-8 relative z-20">
              <CardGridSkeleton count={16} />
            </div>
          </>
        ) : library.length === 0 ? (
          <div className="pt-24">
            <EmptyState type="empty" onAddFolder={() => setShowFolderManager(true)} />
          </div>
        ) : (
          <>
            {/* Hero Section */}
            {hero.featured && (
              <HeroSection
                featured={hero.featured}
                featuredLogoUrl={hero.featuredLogoUrl}
                heroCandidates={hero.heroCandidates}
                heroIndex={hero.heroIndex}
                onSetHeroIndex={hero.setHeroIndex}
                onPlay={() => playback.playFile('movie', hero.featured.id)}
                onMoreInfo={() => openTitleDetail(hero.featured, 'top')}
                onViewEpisodes={() => openTitleDetail(hero.featured, 'episodes')}
              />
            )}

            <div className={clsx(hero.featured ? "pt-10 sm:pt-14 md:pt-16" : "pt-24 sm:pt-28", "relative z-20")}>
              {/* Content Grid with integrated Genre, Language, Grid, and Sort dropdowns */}
              <LibraryGrid
                filteredLibrary={filteredLibrary}
                activeTab={activeTab}
                genres={availableGenres}
                selectedGenre={selectedGenre}
                onGenreSelect={setSelectedGenre}
                languages={availableLanguages}
                selectedLanguage={selectedLanguage}
                onLanguageSelect={setSelectedLanguage}
                sortBy={sortBy}
                onSortChange={setSortBy}
                onGenreClear={handleGenreClear}
                focusedIndex={focusedIndex}
                displayPrefs={displayPrefs}
                onDisplayPrefChange={updateDisplayPref}
                onCardClick={handleCardClick}
                onPlayClick={handlePlayClick}
                onContextMenu={handleContextMenu}
              />
            </div>
          </>
        ))}

        {/* Live TV Section */}
        {activeTab === 'live' && (
          <LiveTVSection
            iptvChannels={iptv.iptvChannels}
            iptvCategories={iptv.iptvCategories}
            iptvCountries={iptv.iptvCountries}
            selectedIPTVCategory={iptv.selectedIPTVCategory}
            setSelectedIPTVCategory={iptv.setSelectedIPTVCategory}
            selectedIPTVCountry={iptv.selectedIPTVCountry}
            setSelectedIPTVCountry={iptv.setSelectedIPTVCountry}
            iptvSearchQuery={iptv.iptvSearchQuery}
            setIptvSearchQuery={iptv.setIptvSearchQuery}
            selectedIPTVChannel={iptv.selectedIPTVChannel}
            setSelectedIPTVChannel={iptv.setSelectedIPTVChannel}
            loadingIPTV={iptv.loadingIPTV}
            onManageChannels={() => iptv.setShowIPTVManager(true)}
            onDeleteChannel={iptv.deleteIPTVChannel}
          />
        )}

        {/* Watchlist Section */}
        {activeTab === 'watchlist' && (
          <WatchlistPage
            libraryTmdbIds={library.map(item => item.tmdbId).filter((id): id is number => id != null)}
            onOpenOnline={(item) => openOnlineInDiscover(item)}
          />
        )}

        {/* Discover Section */}
        {activeTab === 'discover' && (
          discoverMode === 'online' ? (
            <DiscoverPage
              initialItem={discoverInitialItem}
              onSwitchToTorrents={(query) => { if (query) setTorrentInitialQuery(query); setDiscoverMode('torrents'); }}
            />
          ) : (
            <TorrentSearchPage
              initialQuery={torrentInitialQuery}
              onSwitchToOnline={() => setDiscoverMode('online')}
              onOpenOnline={(item) => openOnlineInDiscover(item)}
            />
          )
        )}
      </div>

      {/* Cinejoy Master Title Detail Page (Full-screen, unified movies & TV shows) */}
      {selectedDetail && (
        <TitleDetailPage
          item={selectedDetail}
          initialSection={detailInitialSection}
          isLocal={library.some(l => (l.id === selectedDetail.id || (l.tmdbId && l.tmdbId === selectedDetail.tmdbId)) && l.type === selectedDetail.type)}
          onBack={closeTitleDetail}
          onPlayLocal={(item, epId, start) => {
            const matchedLocal = library.find(l =>
              (l.id === item.id || (l.tmdbId && l.tmdbId === item.tmdbId)) &&
              l.type === item.type
            ) || item;
            playback.playFile(matchedLocal.type, matchedLocal.id, epId, start);
          }}
          onDeleteEpisode={handleDeleteEpisode}
          onRemoveEpisodeFromLibrary={handleRemoveEpisodeFromLibrary}
          onMarkWatched={async (item, watched, epId) => {
            await handleMarkWatched(item, watched, epId);
            fetchLibrary();
            fetchContinueWatching();
          }}
          onFixMatch={(item) => setFixMatchItem(item)}
          onOpenOnline={(onlineItem) => {
            closeTitleDetail();
            openOnlineInDiscover(onlineItem);
          }}
          onSelectSimilar={(sim) => {
            closeTitleDetail();
            openOnlineInDiscover(sim);
          }}
        />
      )}

      {/* Folder Manager */}
      <FolderManager
        isOpen={showFolderManager}
        onClose={() => setShowFolderManager(false)}
        onScan={handleScan}
        onRefresh={fetchLibrary}
      />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenuOverlay
          contextMenu={contextMenu}
          onClose={() => setContextMenu(null)}
          onMarkWatched={(item, watched) => handleMarkWatched(item, watched)}
          onRemoveFromLibrary={handleRemoveFromLibrary}
          onDelete={handleDelete}
          onFixMatch={(item) => setFixMatchItem(item)}
        />
      )}

      {/* Fix Match Modal */}
      {fixMatchItem && (
        <FixMatchModal
          item={fixMatchItem}
          isOpen={!!fixMatchItem}
          onClose={() => setFixMatchItem(null)}
          onMatched={async () => {
            await fetchLibrary();
            await fetchContinueWatching();
            if (selectedDetail && fixMatchItem && selectedDetail.id === fixMatchItem.id) {
              setSelectedDetail(null);
            }
          }}
          onShowToast={showToast}
        />
      )}

      {/* Global Search Modal */}
      {(showMobileConnect || showDlna || showSearchModal) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" />
      )}
      <GlobalSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onPlay={(filePath: string) => {
          const movie = library.find((m) => m.type === 'movie' && m.filePath === filePath);
          if (movie) {
            playback.playFile('movie', movie.id);
          }
        }}
        onOpenShow={(result) => {
          const showItem = library.find(i => i.id === result.id && i.type === 'show');
          if (showItem) openShow(showItem);
          else {
            setSelectedGenre(null);
            setActiveTab('show');
          }
        }}
        onOpenOnline={(item) => openOnlineInDiscover(item as DiscoverOnlineItem)}
        onSwitchToTorrents={(query) => {
          setActiveTab('discover');
          setDiscoverMode('torrents');
          setTorrentInitialQuery(query);
          setShowSearchModal(false);
        }}
      />

      {/* Keyboard Shortcut Help Overlay */}
      {showShortcutHelp && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm" onClick={() => setShowShortcutHelp(false)} />
          <div className="fixed inset-0 z-[91] flex items-center justify-center p-4" onClick={() => setShowShortcutHelp(false)}>
            <div className="bg-neutral-900 border border-neutral-700/50 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <Keyboard className="w-5 h-5 text-red-400" />
                  <h3 className="text-lg font-bold text-white">Keyboard Shortcuts</h3>
                </div>
                <button onClick={() => setShowShortcutHelp(false)} className="p-1.5 hover:bg-neutral-800 rounded-lg transition">
                  <X className="w-5 h-5 text-neutral-400" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                {[
                  { title: 'Navigation', shortcuts: [
                    { keys: ['←', '→', '↑', '↓'], desc: 'Navigate through library grid' },
                    { keys: ['Enter'], desc: 'Open selected item details' },
                    { keys: ['Esc'], desc: 'Close modals / clear selection' },
                  ]},
                  { title: 'Actions', shortcuts: [
                    { keys: ['/'], desc: 'Focus search bar' },
                    { keys: ['F'], desc: 'Open folder manager' },
                    { keys: ['?'], desc: 'Toggle this help overlay' },
                  ]},
                ].map((section) => (
                  <div key={section.title}>
                    <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">{section.title}</h4>
                    <div className="space-y-2">
                      {section.shortcuts.map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5">
                          <span className="text-sm text-neutral-300">{s.desc}</span>
                          <div className="flex items-center gap-1.5">
                            {s.keys.map((k, j) => (
                              <span key={j}>
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-md text-xs font-mono text-neutral-200 shadow-sm min-w-[28px] text-center inline-block">{k}</kbd>
                                {j < s.keys.length - 1 && s.keys.length > 1 && <span className="text-neutral-600 mx-0.5"></span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-neutral-800">
                  <p className="text-xs text-neutral-500 text-center">Right-click any item for more options</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast Notifications */}
      {toast && <ToastNotification toast={toast} />}

      {/* Video Player (Mobile) */}
      {playback.videoPlayer && (
        <VideoPlayer
          src={playback.videoPlayer.src}
          title={playback.videoPlayer.title}
          initialTime={playback.videoPlayer.initialTime}
          isHDR={playback.videoPlayer.isHDR}
          audioCodec={playback.videoPlayer.audioCodec}
          videoCodec={playback.videoPlayer.videoCodec}
          fileName={playback.videoPlayer.fileName}
          onClose={() => playback.setVideoPlayer(null)}
        />
      )}

      {/* Play Choice Modal (Choose destination before browser playback) */}
      {playback.playChoiceItem && (
        <PlayChoiceModal
          item={playback.playChoiceItem}
          onClose={() => playback.setPlayChoiceItem(null)}
          onPlayInBrowser={() => playback.launchBrowserPlayer(playback.playChoiceItem!)}
          onPlayOnHostPc={async () => {
            if (!playback.playChoiceItem) return;
            const { contentType, contentId, episodeId, startTime } = playback.playChoiceItem;
            try {
              const res = await fetch('/api/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ contentType, contentId, episodeId, startTime })
              });
              const data = await res.json();
              if (res.ok) {
                showToast(`Playing on Host PC (${data.message || 'Player'})`, 'success');
              } else {
                showToast(data.error || 'Failed to launch player on PC', 'error');
              }
            } catch (e: any) {
              showToast('Error: ' + e.message, 'error');
            }
          }}
          onOpenDlna={() => setShowDlna(true)}
          showToast={showToast}
        />
      )}

      {/* Mobile Connect QR Modal */}
      {showMobileConnect && <MobileConnectModal onClose={() => setShowMobileConnect(false)} />}

      {/* DLNA Server Modal */}
      {showDlna && <DlnaModal onClose={() => setShowDlna(false)} />}

      {/* Mobile Search Modal */}
      {showMobileSearch && (
        <MobileSearchModal
          isOpen={showMobileSearch}
          onClose={() => setShowMobileSearch(false)}
          library={library}
          onPlay={(contentType, contentId, episodeId) => playback.playFile(contentType, contentId, episodeId)}
          onOpenShow={openShow}
        />
      )}

      {/* Mobile Navigation */}
      {!selectedDetail && !selectedShow && !showLiveSports && !playback.videoPlayer && (
        <>
          <MobileNav
            activeTab={activeTab}
            onTabChange={switchTab}
            onShowQR={() => setShowMobileConnect(true)}
            onShowSettings={() => window.location.href = '/settings'}
            onShowSearch={() => setShowMobileSearch(true)}
            onShowLiveSports={() => setShowLiveSports(true)}
          />

          {/* Floating QR Button (Mobile) */}
          <FloatingQRButton />
        </>
      )}

      {/* Live Sports Modal */}
      {showLiveSports && <LiveSports onClose={() => setShowLiveSports(false)} />}

      {/* IPTV Manager */}
      {iptv.showIPTVManager && (
        <IPTVManager
          onClose={() => iptv.setShowIPTVManager(false)}
          onChannelsUpdated={iptv.fetchIPTVChannels}
        />
      )}

      {/* Downloads Panel */}
      <DownloadsPanel isOpen={showDownloads} onClose={() => setShowDownloads(false)} />

      {/* Global Drag & Drop Zone */}
      <GlobalDropzone />

    </main>
  );
}
