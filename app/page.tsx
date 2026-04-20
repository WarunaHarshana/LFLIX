'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { apiUrl } from '@/lib/mobileConfig';
import { useAppStore } from './store/useAppStore';
import type { ContentItem, Season, DiscoverOnlineItem, TabId } from './types';
import { isValidTab } from './types';
import dynamic from 'next/dynamic';

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
import ContinueWatching from './components/ContinueWatching';
import GenreFilter from './components/GenreFilter';
import EmptyState from './components/EmptyState';
import { HeroSkeleton, CardGridSkeleton, ContinueWatchingSkeleton } from './components/LoadingStates';
import FolderManager from './components/FolderManager';
import LoginScreen from './components/LoginScreen';
import SetupWizard from './components/SetupWizard';
import VideoPlayer from './components/VideoPlayer';
import MobileNav from './components/MobileNav';
import FloatingQRButton from './components/FloatingQRButton';
import MobileSearchModal from './components/MobileSearchModal';
import PlayChoiceModal from './components/PlayChoiceModal';
import DetailTabNav from './components/DetailTabNav';
import GlobalDropzone from './components/GlobalDropzone';

// Section components (lightweight, used on main page)
import HeroSection from './components/HeroSection';
import LibraryGrid from './components/LibraryGrid';
import LiveTVSection from './components/LiveTVSection';
import ContextMenuOverlay from './components/ContextMenuOverlay';
import ToastNotification from './components/ToastNotification';

// Heavy modals & pages — lazy loaded (only fetched when opened)
const EpisodeModal = dynamic(() => import('./components/EpisodeModal'), { ssr: false });
const ContentDetailModal = dynamic(() => import('./components/ContentDetailModal'), { ssr: false });
const GlobalSearchModal = dynamic(() => import('./components/GlobalSearchModal'), { ssr: false });
const DiscoverPage = dynamic(() => import('./components/DiscoverPage'), { ssr: false });
const TorrentSearchPage = dynamic(() => import('./components/TorrentSearchPage'), { ssr: false });
const WatchlistPage = dynamic(() => import('./components/WatchlistPage'), { ssr: false });
const LiveSports = dynamic(() => import('./components/LiveSports'), { ssr: false });
const IPTVManager = dynamic(() => import('./components/IPTVManager'), { ssr: false });
const DlnaModal = dynamic(() => import('./components/DlnaModal'), { ssr: false });
const MobileConnectModal = dynamic(() => import('./components/MobileConnectModal'), { ssr: false });
const DownloadsPanel = dynamic(() => import('./components/DownloadsPanel'), { ssr: false });

export default function Home() {
  // ──────────────────── Hooks ────────────────────
  const { toast, showToast } = useToast();
  const { setupComplete, setSetupComplete, isAuthenticated, setIsAuthenticated, logout } = useAuth();
  const {
    library, genres, loading, setLoading,
    selectedGenre, setSelectedGenre,
    sortBy, setSortBy,
    displayPrefs,
    fetchLibrary, handleScan, getFilteredLibrary,
  } = useLibrary(showToast);
  const { continueWatching, fetchContinueWatching } = useContinueWatching();
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

  // ──────────────────── Computed ────────────────────
  const filteredLibrary = getFilteredLibrary(activeTab);
  const hero = useHero(filteredLibrary);

  // ──────────────────── Refs ────────────────────
  const libraryRef = useRef(library);
  const activeTabRef = useRef(activeTab);
  const selectedGenreRef = useRef(selectedGenre);
  const focusedIndexRef = useRef(focusedIndex);

  useEffect(() => {
    libraryRef.current = library;
    activeTabRef.current = activeTab;
    selectedGenreRef.current = selectedGenre;
    focusedIndexRef.current = focusedIndex;
  }, [library, activeTab, selectedGenre, focusedIndex]);

  // ──────────────────── Tab Switching ────────────────────
  const switchTab = (tab: TabId) => {
    if (tab === 'discover') {
      setDiscoverMode('online');
      setTorrentInitialQuery('');
    }
    if (tab !== 'discover' && activeTab === 'discover') {
      setDiscoverMode('online');
      setTorrentInitialQuery('');
    }
    setActiveTab(tab);
  };

  // Tab from URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const requestedTab = searchParams.get('tab');
    const openLiveSports = searchParams.get('liveSports') === '1';
    if (openLiveSports) setShowLiveSports(true);
    if (!isValidTab(requestedTab)) return;
    if (requestedTab === 'all') setSelectedGenre(null);
    if (requestedTab === 'discover') {
      setDiscoverMode('online');
      setTorrentInitialQuery('');
    }
    setActiveTab(requestedTab);
  }, []);

  const openOnlineInDiscover = (item: DiscoverOnlineItem) => {
    setDiscoverMode('online');
    setDiscoverInitialItem(item);
    setActiveTab('discover');
    setTimeout(() => setDiscoverInitialItem(null), 500);
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
            fetchLibrary();
            fetchContinueWatching();
          } else if (data.type === 'file_removed') {
            showToast('Item removed from library', 'success');
            fetchLibrary();
            fetchContinueWatching();
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
    if (typeof window === 'undefined') return 8;
    const width = window.innerWidth;
    if (width >= 1536) return 8;
    if (width >= 1280) return 6;
    if (width >= 1024) return 6;
    if (width >= 768) return 4;
    return 2;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const cols = getGridColumns();
      const currentLibrary = libraryRef.current;
      const currentTab = activeTabRef.current;
      const currentGenre = selectedGenreRef.current;
      const filtered = currentLibrary.filter(item => {
        const matchesTab = currentTab === 'all' || item.type === currentTab;
        const matchesGenre = !currentGenre || (item.genres && item.genres.includes(currentGenre));
        return matchesTab && matchesGenre;
      });
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
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ──────────────────── Cross-Hook Handlers ────────────────────
  const openShow = async (show: ContentItem) => {
    setSelectedShow(show);
    setLoadingEpisodes(true);
    try {
      const res = await fetch(apiUrl(`/api/episodes?showId=${show.id}`), { credentials: 'same-origin' });
      const data = await res.json();
      setSeasons(data.seasons || []);
    } catch (e) {
      showToast('Failed to load episodes', 'error');
    } finally {
      setLoadingEpisodes(false);
    }
  };

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

  const handleDelete = async (item: ContentItem) => {
    const confirmed = confirm(`Delete "${item.title}" from library AND local disk permanently?`);
    if (!confirmed) return;
    try {
      const res = await fetch(apiUrl(`/api/delete?type=${item.type}&id=${item.id}&deleteFile=1`), {
        method: 'DELETE', credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      showToast(`Deleted (${data.filesDeleted ?? 0} file(s) removed from disk)`, 'success');
      setContextMenu(null);
      await fetchLibrary();
    } catch (e) {
      showToast('Failed to delete item', 'error');
    }
  };

  const handleDeleteEpisode = async (episodeId: number) => {
    const confirmed = confirm('Delete this episode from library AND local disk permanently?');
    if (!confirmed) return;
    try {
      const res = await fetch(apiUrl(`/api/delete?type=episode&id=${episodeId}&deleteFile=1`), {
        method: 'DELETE', credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      showToast(`Episode deleted (${data.filesDeleted ?? 0} file removed)`, 'success');
      if (selectedShow) openShow(selectedShow);
      await fetchLibrary();
    } catch (e) {
      showToast('Failed to delete episode', 'error');
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
  if (setupComplete === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse"><h1 className="text-4xl font-bold text-red-600 tracking-tighter">LFLIX</h1></div>
      </div>
    );
  }
  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  // ──────────────────── Render ────────────────────
  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-red-900 pb-20 md:pb-0">

      {/* Navbar */}
      <DetailTabNav
        activeTab={activeTab}
        showLiveSportsActive={showLiveSports}
        onTabChange={(tab) => { if (tab === 'all') setSelectedGenre(null); switchTab(tab); }}
        onShowLiveSports={() => setShowLiveSports(true)}
        onShowSearch={() => setShowSearchModal(true)}
        onShowMobileConnect={() => setShowMobileConnect(true)}
        onShowDlna={() => setShowDlna(true)}
        onShowDownloads={() => setShowDownloads(true)}
        activeDownloads={activeDownloads}
        forceBrowserPlayer={playback.forceBrowserPlayer}
        onToggleBrowserPlayer={() => playback.setForceBrowserPlayer(!playback.forceBrowserPlayer)}
        onRescan={handleRescanAll}
        scanning={loading}
        onShowFolderManager={() => setShowFolderManager(true)}
        hdrDisplaySupported={playback.hdrDisplaySupported}
        onLogout={logout}
      />

      {/* Library Content (movie/show/all tabs) */}
      {activeTab !== 'live' && activeTab !== 'watchlist' && activeTab !== 'discover' && (loading ? (
        <>
          <HeroSkeleton />
          <div className="px-12 pb-20 -mt-20 relative z-20">
            <ContinueWatchingSkeleton />
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
              onMoreInfo={() => setSelectedDetail(hero.featured)}
              onViewEpisodes={() => openShow(hero.featured)}
            />
          )}

          {/* Continue Watching */}
          <div className="-mt-20 relative z-20">
            <ContinueWatching
              items={continueWatching}
              onPlay={(filePath, startTime) => {
                const movie = library.find(m => m.type === 'movie' && m.filePath === filePath);
                if (movie) playback.playFile('movie', movie.id, undefined, startTime);
              }}
              onOpenShow={(showId) => {
                const show = library.find(l => l.type === 'show' && l.id === showId);
                if (show) openShow(show);
              }}
            />
          </div>

          {/* Genre Filter */}
          {genres.length > 0 && (
            <GenreFilter genres={genres} selectedGenre={selectedGenre} onSelect={setSelectedGenre} />
          )}

          {/* Content Grid */}
          <LibraryGrid
            filteredLibrary={filteredLibrary}
            activeTab={activeTab}
            selectedGenre={selectedGenre}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onGenreClear={() => setSelectedGenre(null)}
            focusedIndex={focusedIndex}
            displayPrefs={displayPrefs}
            onCardClick={(item) => setSelectedDetail(item)}
            onContextMenu={(e, item) => setContextMenu({ x: e.clientX, y: e.clientY, item })}
          />
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

      {/* Content Detail Modal */}
      {selectedDetail && (
        <ContentDetailModal
          item={selectedDetail}
          onClose={() => setSelectedDetail(null)}
          onPlay={() => { playback.playFile('movie', selectedDetail.id, undefined, selectedDetail.watchProgress?.progress); setSelectedDetail(null); }}
          onViewEpisodes={() => { openShow(selectedDetail); setSelectedDetail(null); }}
          onOpenOnline={(item) => { openOnlineInDiscover(item); setSelectedDetail(null); }}
        />
      )}

      {/* Episode Modal */}
      {selectedShow && (
        <EpisodeModal
          show={selectedShow}
          seasons={seasons}
          loading={loadingEpisodes}
          onClose={() => setSelectedShow(null)}
          onPlayEpisode={(episodeId, startTime) => playback.playFile('show', selectedShow.id, episodeId, startTime)}
          onDeleteEpisode={handleDeleteEpisode}
          onMarkWatched={async (episode, watched) => {
            await handleMarkWatched({ ...selectedShow, type: 'show', title: episode.title } as ContentItem, watched, episode.id);
            if (selectedShow) openShow(selectedShow);
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
          onDelete={handleDelete}
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
          onClose={() => playback.setVideoPlayer(null)}
        />
      )}

      {/* Play Choice Modal (Mobile) */}
      {playback.playChoice && (
        <PlayChoiceModal
          title={playback.playChoice.title}
          streamUrl={playback.playChoice.streamUrl}
          contentType={playback.playChoice.contentType}
          contentId={playback.playChoice.contentId}
          episodeId={playback.playChoice.episodeId}
          onPlayBrowser={playback.playChoice.onPlayBrowser}
          onClose={() => playback.setPlayChoice(null)}
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
