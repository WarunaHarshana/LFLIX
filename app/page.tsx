'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Plus, RefreshCw, Film, Tv, Settings, Trash2, Folder, Smartphone } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';

// Components
import SearchBar from './components/SearchBar';
import ContentCard from './components/ContentCard';
import ContinueWatching from './components/ContinueWatching';
import EpisodeModal from './components/EpisodeModal';
import GenreFilter from './components/GenreFilter';
import EmptyState from './components/EmptyState';
import { HeroSkeleton, CardGridSkeleton, ContinueWatchingSkeleton } from './components/LoadingStates';
import FolderManager from './components/FolderManager';
import LoginScreen from './components/LoginScreen';
import SetupWizard from './components/SetupWizard';
import VideoPlayer from './components/VideoPlayer';
import MobileNav from './components/MobileNav';
import MobileConnectModal from './components/MobileConnectModal';

// Types
type ContentItem = {
  id: number;
  type: 'movie' | 'show';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  year?: number;
  firstAirDate?: string | null;
  rating: number | null;
  filePath?: string;
  genres?: string | null;
  watchProgress?: {
    progress: number;
    duration: number;
    completed: number;
  };
};

type Season = {
  season: number;
  episodes: Episode[];
};

type Episode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  filePath: string;
  overview?: string | null;
  watchProgress?: {
    progress: number;
    duration: number;
    completed: number;
  };
};

type ContinueItem = {
  id: number;
  contentType: 'movie' | 'show';
  contentId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  progress: number;
  duration: number;
  filePath?: string;
  episodeFilePath?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
};

export default function Home() {
  // Setup Wizard
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  // Authentication
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Library State
  const [library, setLibrary] = useState<ContentItem[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'movie' | 'show'>('all');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Continue Watching
  const [continueWatching, setContinueWatching] = useState<ContinueItem[]>([]);

  // Show Details Modal
  const [selectedShow, setSelectedShow] = useState<ContentItem | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Folder Manager
  const [showFolderManager, setShowFolderManager] = useState(false);

  // Context Menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: ContentItem } | null>(null);

  // Keyboard Navigation
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Video Player (for mobile streaming)
  const [videoPlayer, setVideoPlayer] = useState<{ src: string; title: string; initialTime?: number } | null>(null);

  // Mobile Connect QR Modal
  const [showMobileConnect, setShowMobileConnect] = useState(false);

  // Detect mobile device
  const isMobile = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }, []);

  // Check if setup is complete on first load
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await fetch('/api/setup', { credentials: 'include' });
        const data = await res.json();
        setSetupComplete(data.setupComplete);
      } catch {
        // If API fails, assume setup is needed
        setSetupComplete(false);
      }
    };
    checkSetup();
  }, []);
  const gridRef = useRef<HTMLDivElement>(null);

  // Toast Notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Refs for stable access in event handlers
  const libraryRef = useRef(library);
  const activeTabRef = useRef(activeTab);
  const selectedGenreRef = useRef(selectedGenre);
  const focusedIndexRef = useRef(focusedIndex);

  // Keep refs updated
  useEffect(() => {
    libraryRef.current = library;
    activeTabRef.current = activeTab;
    selectedGenreRef.current = selectedGenre;
    focusedIndexRef.current = focusedIndex;
  }, [library, activeTab, selectedGenre, focusedIndex]);

  // Fetch library
  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/content', { credentials: 'include' });
      const data = await res.json();
      if (data.content) {
        setLibrary(data.content);
        setGenres(data.genres || []);
      } else if (Array.isArray(data)) {
        setLibrary(data);
      }
    } catch (e) {
      showToast('Failed to load library', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch continue watching
  const fetchContinueWatching = useCallback(async () => {
    try {
      const res = await fetch('/api/history', { credentials: 'include' });
      const data = await res.json();
      setContinueWatching(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load continue watching', e);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
    fetchContinueWatching();
  }, [fetchLibrary, fetchContinueWatching]);

  // Connect to folder watcher for real-time updates
  useEffect(() => {
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
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        // Reconnect after 5 seconds
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [fetchLibrary, fetchContinueWatching]);

  // Keyboard navigation - with SSR safety
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const cols = getGridColumns();
      // Compute filtered library fresh to avoid stale closure
      const currentLibrary = libraryRef.current;
      const currentTab = activeTabRef.current;
      const currentGenre = selectedGenreRef.current;
      const filtered = currentLibrary.filter(item => {
        const matchesTab = currentTab === 'all' || item.type === currentTab;
        const matchesGenre = !currentGenre || (item.genres && item.genres.includes(currentGenre));
        return matchesTab && matchesGenre;
      });

      switch (e.key) {
        case '/':
          e.preventDefault();
          // Search bar will handle this via its own listener
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          setShowFolderManager(true);
          break;
        case 'Escape':
          setSelectedShow(null);
          setShowFolderManager(false);
          setContextMenu(null);
          setFocusedIndex(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, filtered.length - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + cols, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - cols, 0));
          break;
        case 'Enter':
          const currentFocusedIndex = focusedIndexRef.current;
          if (currentFocusedIndex >= 0 && filtered[currentFocusedIndex]) {
            const item = filtered[currentFocusedIndex];
            if (item.type === 'movie') {
              playFile('movie', item.id);
            } else if (item.type === 'show') {
              openShow(item);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps - uses refs for fresh values

  const getGridColumns = useCallback(() => {
    if (typeof window === 'undefined') return 8;
    const width = window.innerWidth;
    if (width >= 1536) return 8;
    if (width >= 1280) return 6;
    if (width >= 1024) return 6;
    if (width >= 768) return 4;
    return 2;
  }, []);

  // Show toast
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Play file - uses secure ID-based lookup instead of filePath
  const playFile = async (contentType: 'movie' | 'show', contentId: number, episodeId?: number, startTime?: number) => {
    try {
      // Mobile: Stream video directly
      if (isMobile()) {
        const params = new URLSearchParams({
          contentType,
          contentId: contentId.toString(),
          ...(episodeId && { episodeId: episodeId.toString() })
        });
        const streamUrl = `/api/stream?${params.toString()}`;
        
        // Get title for video player
        let title = 'Unknown';
        if (contentType === 'movie') {
          const movie = library.find(m => m.id === contentId);
          title = movie?.title || 'Movie';
        } else {
          const show = library.find(s => s.id === contentId);
          title = show?.title || 'TV Show';
        }
        
        setVideoPlayer({ src: streamUrl, title, initialTime: startTime });
        return;
      }

      // Desktop: Launch VLC
      const res = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ contentType, contentId, episodeId, startTime })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to play file', 'error');
      }
    } catch (e) {
      showToast('Failed to play file', 'error');
    }
  };

  // Open show details
  const openShow = async (show: ContentItem) => {
    setSelectedShow(show);
    setLoadingEpisodes(true);
    try {
      const res = await fetch(`/api/episodes?showId=${show.id}`, { credentials: 'same-origin' });
      const data = await res.json();
      setSeasons(data.seasons || []);
    } catch (e) {
      showToast('Failed to load episodes', 'error');
    } finally {
      setLoadingEpisodes(false);
    }
  };

  // Scan folder
  const handleScan = async (folderPath: string) => {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ folderPath })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Scan failed');
    }

    showToast(`Added ${data.added} items to library`, 'success');
    await fetchLibrary();
  };

  // Delete item
  const handleDelete = async (item: ContentItem) => {
    const confirmed = confirm(`Are you sure you want to remove "${item.title}" from your library?`);
    if (!confirmed) return;

    try {
      await fetch(`/api/delete?type=${item.type}&id=${item.id}`, { 
        method: 'DELETE',
        credentials: 'same-origin'
      });
      showToast('Removed from library', 'success');
      setContextMenu(null);
      await fetchLibrary();
    } catch (e) {
      showToast('Failed to remove item', 'error');
    }
  };

  // Delete episode
  const handleDeleteEpisode = async (episodeId: number) => {
    try {
      await fetch(`/api/delete?type=episode&id=${episodeId}`, { 
        method: 'DELETE',
        credentials: 'same-origin'
      });
      showToast('Episode removed', 'success');
      if (selectedShow) {
        openShow(selectedShow); // Refresh episodes
      }
    } catch (e) {
      showToast('Failed to remove episode', 'error');
    }
  };

  // Filter library
  const filteredLibrary = library.filter(item => {
    const matchesTab = activeTab === 'all' || item.type === activeTab;
    const matchesGenre = !selectedGenre || (item.genres && item.genres.includes(selectedGenre));
    return matchesTab && matchesGenre;
  });

  // Featured item (first with backdrop)
  const featured = filteredLibrary.find(item => item.backdropPath) || filteredLibrary[0];

  // Show setup wizard if first run
  if (setupComplete === false) {
    return <SetupWizard onComplete={() => setSetupComplete(true)} />;
  }

  // Show loading while checking setup
  if (setupComplete === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse">
          <h1 className="text-4xl font-bold text-red-600 tracking-tighter">LOCALFLIX</h1>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-red-900 pb-20 md:pb-0">

      {/* Navbar - Desktop (hidden on mobile) */}
      <nav className="fixed top-0 w-full z-40 bg-gradient-to-b from-black/90 to-transparent px-8 py-6 items-center justify-between backdrop-blur-sm hidden md:flex">
        <div className="flex items-center gap-8">
          <h1 className="text-3xl font-bold text-red-600 tracking-tighter">LOCALFLIX</h1>
          <div className="flex gap-4 text-sm font-medium">
            <button
              onClick={() => { setActiveTab('all'); setSelectedGenre(null); }}
              className={clsx("transition hover:text-white", activeTab === 'all' ? "text-white" : "text-neutral-400")}
            >
              Home
            </button>
            <button
              onClick={() => setActiveTab('show')}
              className={clsx("transition hover:text-white", activeTab === 'show' ? "text-white" : "text-neutral-400")}
            >
              TV Shows
            </button>
            <button
              onClick={() => setActiveTab('movie')}
              className={clsx("transition hover:text-white", activeTab === 'movie' ? "text-white" : "text-neutral-400")}
            >
              Movies
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SearchBar
            onPlay={playFile}
            onOpenShow={(result) => {
              const show = library.find(l => l.type === 'show' && l.id === result.id);
              if (show) openShow(show);
            }}
          />
          <button
            onClick={() => setShowMobileConnect(true)}
            className="p-2 hover:bg-white/10 rounded-full transition hidden md:flex"
            title="Connect Mobile"
          >
            <Smartphone className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowFolderManager(true)}
            className="p-2 hover:bg-white/10 rounded-full transition"
            title="Manage Folders (F)"
          >
            <Plus className="w-6 h-6" />
          </button>
          <Link
            href="/settings"
            className="p-2 hover:bg-white/10 rounded-full transition"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </Link>
          <button
            onClick={async () => {
              // Call logout endpoint to clear cookie properly
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
              setIsAuthenticated(false);
            }}
            className="p-2 hover:bg-white/10 rounded-full transition text-neutral-400 hover:text-white text-xs"
            title="Logout"
          >
            Exit
          </button>
        </div>
      </nav>

      {/* Loading State */}
      {loading ? (
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
          {featured && (
            <div className="relative h-[80vh] w-full">
              <div className="absolute inset-0">
                {(featured.backdropPath || featured.posterPath) ? (
                  <img
                    src={`https://image.tmdb.org/t/p/original${featured.backdropPath || featured.posterPath}`}
                    alt="Hero"
                    className="w-full h-full object-cover opacity-60"
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-900" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />
              </div>

              <div className="absolute bottom-0 left-0 p-12 pb-24 space-y-6 max-w-2xl z-10">
                <h2 className="text-6xl font-extrabold drop-shadow-2xl leading-tight">{featured.title}</h2>
                <div className="flex items-center gap-3 text-sm font-semibold">
                  <span className="px-2 py-0.5 bg-neutral-800 rounded border border-neutral-600 uppercase tracking-wide text-neutral-300">
                    {featured.type}
                  </span>
                  {featured.rating && <span className="text-green-400">Match {Math.round(featured.rating * 10)}%</span>}
                  <span className="text-neutral-300">{featured.year || (featured.firstAirDate ? featured.firstAirDate.substring(0, 4) : '')}</span>
                  {featured.genres && (
                    <span className="text-neutral-400">{featured.genres.split(',').slice(0, 2).join(' • ')}</span>
                  )}
                </div>
                {featured.overview && (
                  <p className="text-lg text-neutral-200 line-clamp-3 drop-shadow-md leading-relaxed">{featured.overview}</p>
                )}
                <div className="flex gap-4 pt-2">
                  {featured.type === 'movie' ? (
                    <button
                      onClick={() => playFile('movie', featured.id)}
                      className="px-8 py-3 bg-white text-black font-bold rounded flex items-center gap-2 hover:bg-neutral-200 transition"
                    >
                      <Play className="w-6 h-6 fill-black" /> Play
                    </button>
                  ) : (
                    <button
                      onClick={() => openShow(featured)}
                      className="px-8 py-3 bg-white text-black font-bold rounded flex items-center gap-2 hover:bg-neutral-200 transition"
                    >
                      <Play className="w-6 h-6 fill-black" /> View Episodes
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Continue Watching */}
          <div className="-mt-20 relative z-20">
            <ContinueWatching
              items={continueWatching}
              onPlay={(item) => playFile(item.contentType, item.contentId, item.episodeId)}
              onOpenShow={(showId) => {
                const show = library.find(l => l.type === 'show' && l.id === showId);
                if (show) openShow(show);
              }}
            />
          </div>

          {/* Genre Filter */}
          {genres.length > 0 && (
            <GenreFilter
              genres={genres}
              selectedGenre={selectedGenre}
              onSelect={setSelectedGenre}
            />
          )}

          {/* Content Grid */}
          <div className="px-12 pb-20 relative z-20">
            <h3 className="text-xl font-semibold mb-6 text-neutral-200 flex items-center gap-3">
              {activeTab === 'all' ? 'My Library' : activeTab === 'movie' ? 'Movies' : 'TV Shows'}
              {selectedGenre && (
                <span className="text-sm font-normal px-3 py-1 bg-neutral-800 rounded-full text-neutral-400">
                  {selectedGenre}
                  <button
                    onClick={() => setSelectedGenre(null)}
                    className="ml-2 text-neutral-500 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              )}
              <span className="text-sm font-normal text-neutral-500">
                ({filteredLibrary.length} items)
              </span>
            </h3>

            {filteredLibrary.length === 0 ? (
              <EmptyState type="no-results" searchQuery={selectedGenre || ''} />
            ) : (
              <div
                ref={gridRef}
                className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4"
              >
                {filteredLibrary.map((item, index) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className={clsx(
                      "transition-all duration-200",
                      focusedIndex === index && "ring-2 ring-white ring-offset-2 ring-offset-black rounded-lg"
                    )}
                  >
                    <ContentCard
                      item={item}
                      onClick={() => {
                        if (item.type === 'movie') {
                          playFile('movie', item.id);
                        } else {
                          openShow(item);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, item });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Episode Modal */}
      {selectedShow && (
        <EpisodeModal
          show={selectedShow}
          seasons={seasons}
          loading={loadingEpisodes}
          onClose={() => setSelectedShow(null)}
          onPlayEpisode={(episodeId, startTime) => playFile('show', selectedShow.id, episodeId, startTime)}
          onDeleteEpisode={handleDeleteEpisode}
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
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden min-w-48"
            style={{
              left: Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 200),
              top: Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 1080) - 120)
            }}
          >
            <div className="px-4 py-2 border-b border-neutral-700">
              <p className="text-sm font-medium truncate max-w-48">{contextMenu.item.title}</p>
            </div>
            <button
              onClick={() => handleDelete(contextMenu.item)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-red-600 transition w-full text-left"
            >
              <Trash2 className="w-4 h-4" />
              Remove from Library
            </button>
          </div>
        </>
      )}

      {/* Toast Notifications */}
      {toast && (
        <div
          className={clsx(
            "fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-300",
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          )}
        >
          {toast.type === 'success' ? '✓' : '✕'}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Video Player (Mobile) */}
      {videoPlayer && (
        <VideoPlayer
          src={videoPlayer.src}
          title={videoPlayer.title}
          initialTime={videoPlayer.initialTime}
          onClose={() => setVideoPlayer(null)}
        />
      )}

      {/* Mobile Connect QR Modal */}
      {showMobileConnect && (
        <MobileConnectModal onClose={() => setShowMobileConnect(false)} />
      )}

      {/* Mobile Navigation */}
      <MobileNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onShowQR={() => setShowMobileConnect(true)}
        onShowSettings={() => window.location.href = '/settings'}
      />

    </main>
  );
}
