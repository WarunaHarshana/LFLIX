'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Plus, RefreshCw, Film, Tv, Settings, Trash2, Folder, Smartphone, Cast, RotateCw, Monitor, Loader2, X, Search, Globe, Trophy } from 'lucide-react';
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
import FloatingQRButton from './components/FloatingQRButton';
import DlnaModal from './components/DlnaModal';
import MobileSearchModal from './components/MobileSearchModal';
import PlayChoiceModal from './components/PlayChoiceModal';
import IPTVManager from './components/IPTVManager';
import LiveSports from './components/LiveSports';

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

type IPTVChannel = {
  id: number;
  name: string;
  url: string;
  logo?: string;
  category: string;
  country?: string;
  language?: string;
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
  const [activeTab, setActiveTab] = useState<'all' | 'movie' | 'show' | 'live'>('all');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // IPTV State
  const [iptvChannels, setIptvChannels] = useState<IPTVChannel[]>([]);
  const [iptvCategories, setIptvCategories] = useState<string[]>([]);
  const [iptvCountries, setIptvCountries] = useState<string[]>([]);
  const [selectedIPTVCategory, setSelectedIPTVCategory] = useState<string>('all');
  const [selectedIPTVCountry, setSelectedIPTVCountry] = useState<string>('all');
  const [iptvSearchQuery, setIptvSearchQuery] = useState('');
  const [selectedIPTVChannel, setSelectedIPTVChannel] = useState<IPTVChannel | null>(null);
  const [showIPTVManager, setShowIPTVManager] = useState(false);
  const [loadingIPTV, setLoadingIPTV] = useState(false);

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

  // DLNA Server Modal
  const [showDlna, setShowDlna] = useState(false);

  // Mobile Search Modal
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showLiveSports, setShowLiveSports] = useState(false);

  // Force browser player (for TVs without VLC)
  const [forceBrowserPlayer, setForceBrowserPlayer] = useState(false);

  // Play Choice Modal (for mobile)
  const [playChoice, setPlayChoice] = useState<{
    title: string;
    streamUrl: string;
    contentType: 'movie' | 'show';
    contentId: number;
    episodeId?: number;
    onPlayBrowser: () => void
  } | null>(null);

  // Detect mobile device (but not TVs!)
  const isMobile = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    console.log('User Agent:', ua);
    // Check for mobile devices but exclude TVs
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTV = /SmartTV|AppleTV|HbbTV|NetCast|WebOS.+TV|Tizen.+TV|GoogleTV|PlayStation|Xbox|Nintendo/i.test(ua);
    console.log('isMobileDevice:', isMobileDevice, 'isTV:', isTV);
    return isMobileDevice && !isTV;
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

  // Fetch IPTV channels
  const fetchIPTVChannels = useCallback(async () => {
    setLoadingIPTV(true);
    try {
      const res = await fetch('/api/iptv/channels');
      const data = await res.json();
      if (data.channels) {
        setIptvChannels(data.channels);
        // Extract unique categories
        const cats = [...new Set(data.channels.map((c: IPTVChannel) => c.category).filter(Boolean))] as string[];
        setIptvCategories(cats);
        // Extract unique countries
        const countries = [...new Set(data.channels.map((c: IPTVChannel) => c.country).filter(Boolean))] as string[];
        setIptvCountries(countries.sort());
      }
    } catch (e) {
      console.error('Failed to load IPTV channels', e);
    } finally {
      setLoadingIPTV(false);
    }
  }, []);

  // Delete individual IPTV channel
  const deleteIPTVChannel = async (channelId: number) => {
    try {
      const res = await fetch(`/api/iptv/channels?id=${channelId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        // Remove from local state
        setIptvChannels(prev => prev.filter(c => c.id !== channelId));
        // Clear selected if this was the selected channel
        if (selectedIPTVChannel?.id === channelId) {
          setSelectedIPTVChannel(null);
        }
      }
    } catch (e) {
      console.error('Failed to delete channel', e);
    }
  };

  useEffect(() => {
    fetchLibrary();
    fetchContinueWatching();
    fetchIPTVChannels();
  }, [fetchLibrary, fetchContinueWatching, fetchIPTVChannels]);

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

  // Handle native back button (Android)
  useEffect(() => {
    // Dynamic import to avoid SSR issues
    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', () => {
        // Priority 1: Close Video Player
        if (!!document.querySelector('.fixed.inset-0.z-\\[100\\]')) {
          setVideoPlayer(null);
          return;
        }

        // Priority 2: Close Modals
        if (selectedShow) {
          setSelectedShow(null);
          return;
        }
        if (showFolderManager) {
          setShowFolderManager(false);
          return;
        }
        if (showMobileConnect) {
          setShowMobileConnect(false);
          return;
        }
        if (showDlna) {
          setShowDlna(false);
          return;
        }
        if (showMobileSearch) {
          setShowMobileSearch(false);
          return;
        }
        if (showLiveSports) {
          setShowLiveSports(false);
          return;
        }
        if (showIPTVManager) {
          setShowIPTVManager(false);
          return;
        }

        // Priority 3: Navigate Tabs
        if (activeTabRef.current !== 'all') {
          setActiveTab('all');
          return;
        }

        // Priority 4: Exit App
        App.exitApp();
      });
    }).catch(() => {
      // Capacitor not available (running in browser)
    });

    return () => {
      import('@capacitor/app').then(({ App }) => {
        App.removeAllListeners();
      }).catch(() => { });
    };
  }, [selectedShow, showFolderManager, showMobileConnect, showDlna, showMobileSearch, showLiveSports, showIPTVManager]); // Dependencies crucial for closure scope

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
    console.log('playFile called:', { contentType, contentId, episodeId, startTime });
    try {
      const mobile = isMobile();
      console.log('isMobile result:', mobile);
      // Mobile or TV (force browser): Show browser player
      if (mobile || forceBrowserPlayer) {
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

        // Show choice modal
        setPlayChoice({
          title,
          streamUrl: window.location.origin + streamUrl,
          contentType,
          contentId,
          episodeId,
          onPlayBrowser: () => setVideoPlayer({ src: streamUrl, title, initialTime: startTime })
        });
        return;
      }

      // Desktop: Launch VLC (or TV uses browser)
      console.log('Desktop/VLC path - calling /api/play');
      const res = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ contentType, contentId, episodeId, startTime })
      });
      console.log('Play response:', res.status);
      const data = await res.json();
      console.log('Play data:', data);
      if (!res.ok) {
        showToast(data.error || 'Failed to play file', 'error');
      } else {
        console.log('Play successful');
      }
    } catch (e: any) {
      console.error('Play error:', e);
      showToast('Failed to play file: ' + e.message, 'error');
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

  // Manual rescan all folders
  const handleRescanAll = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rescan', {
        method: 'POST',
        credentials: 'include'
      });
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
          <h1 className="text-3xl font-bold text-red-600 tracking-tighter">LFLIX</h1>
          <div className="flex gap-2 text-base font-medium">
            <button
              onClick={() => { setActiveTab('all'); setSelectedGenre(null); }}
              className={clsx("px-4 py-2 rounded-lg transition hover:text-white hover:bg-white/10 cursor-pointer min-w-[80px]", activeTab === 'all' ? "text-white bg-white/10" : "text-neutral-400")}
            >
              Home
            </button>
            <button
              onClick={() => setActiveTab('show')}
              className={clsx("px-4 py-2 rounded-lg transition hover:text-white hover:bg-white/10 cursor-pointer min-w-[80px]", activeTab === 'show' ? "text-white bg-white/10" : "text-neutral-400")}
            >
              TV Shows
            </button>
            <button
              onClick={() => setActiveTab('movie')}
              className={clsx("px-4 py-2 rounded-lg transition hover:text-white hover:bg-white/10 cursor-pointer min-w-[80px]", activeTab === 'movie' ? "text-white bg-white/10" : "text-neutral-400")}
            >
              Movies
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={clsx("px-4 py-2 rounded-lg transition hover:text-white hover:bg-white/10 cursor-pointer min-w-[80px] flex items-center gap-2", activeTab === 'live' ? "text-white bg-white/10" : "text-neutral-400")}
            >
              <Tv className="w-4 h-4" />
              Live TV
            </button>
            <button
              onClick={() => setShowLiveSports(true)}
              className={clsx("px-4 py-2 rounded-lg transition hover:text-white hover:bg-white/10 cursor-pointer min-w-[80px] flex items-center gap-2", showLiveSports ? "text-white bg-white/10" : "text-neutral-400")}
            >
              <Trophy className="w-4 h-4" />
              Live Sports
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SearchBar
            onPlay={(filePath) => {
              // Search returns filePath, but we need to find the movie and call playFile with its ID
              const movie = library.find(m => m.type === 'movie' && m.filePath === filePath);
              if (movie) {
                playFile('movie', movie.id);
              }
            }}
            onOpenShow={(result) => {
              const show = library.find(l => l.type === 'show' && l.id === result.id);
              if (show) openShow(show);
            }}
          />
          <button
            onClick={() => setShowMobileConnect(true)}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center"
            title="Connect Mobile"
          >
            <Smartphone className="w-6 h-6" />
          </button>
          <button
            onClick={() => setShowDlna(true)}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center"
            title="DLNA Server (VLC)"
          >
            <Cast className="w-6 h-6" />
          </button>
          <button
            onClick={() => setForceBrowserPlayer(!forceBrowserPlayer)}
            className={clsx(
              "p-3 hover:bg-white/10 rounded-full transition cursor-pointer hidden md:flex min-w-[44px] min-h-[44px] items-center justify-center",
              forceBrowserPlayer && "text-blue-400"
            )}
            title={forceBrowserPlayer ? "Browser Player ON (click to use VLC)" : "Use Browser Player (for TV)"}
          >
            <Monitor className="w-6 h-6" />
          </button>
          <button
            onClick={handleRescanAll}
            disabled={loading}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Refresh Library (Scan for new files)"
          >
            <RotateCw className={clsx("w-6 h-6", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowFolderManager(true)}
            className="p-3 hover:bg-white/10 rounded-full transition cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Manage Folders (F)"
          >
            <Plus className="w-7 h-7" />
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

      {/* Loading State - only show for movie/show tabs */}
      {activeTab !== 'live' && (loading ? (
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
              onPlay={(filePath, startTime) => {
                // ContinueWatching provides filePath, but playFile needs contentType and contentId
                // Find the movie by filePath and call playFile with its ID
                const movie = library.find(m => m.type === 'movie' && m.filePath === filePath);
                if (movie) {
                  playFile('movie', movie.id, undefined, startTime);
                }
              }}
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
      ))}

      {/* Live TV Section */}
      {activeTab === 'live' && (
        <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-black to-neutral-950">
          {/* Hero Section with Video Player */}
          <div className="relative pt-20">
            {/* Background gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 via-transparent to-transparent pointer-events-none" />

            <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8 pt-4 sm:pt-6">
                <div>
                  <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-white flex items-center gap-3 sm:gap-4">
                    <div className="p-2 sm:p-3 bg-gradient-to-br from-red-600 to-red-700 rounded-xl sm:rounded-2xl shadow-lg shadow-red-900/30">
                      <Tv className="w-5 h-5 sm:w-8 sm:h-8" />
                    </div>
                    Live TV
                  </h1>
                  <p className="text-neutral-400 text-lg mt-2 ml-1">
                    {iptvChannels.length.toLocaleString()} channels available
                  </p>
                </div>
                <button
                  onClick={() => setShowIPTVManager(true)}
                  className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 hover:scale-105 text-sm sm:text-base"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  Manage Channels
                </button>
              </div>

              {/* Main Layout - Player + Now Playing Info */}
              {selectedIPTVChannel && (
                <div className="mb-6 sm:mb-10">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Video Player - Takes 2/3 of the space */}
                    <div className="lg:col-span-2">
                      <div className="relative bg-black rounded-xl sm:rounded-2xl overflow-hidden border border-neutral-800/50 shadow-2xl shadow-black/50 aspect-video">
                        <video
                          key={selectedIPTVChannel.id}
                          src={selectedIPTVChannel.url}
                          controls
                          autoPlay
                          className="w-full h-full object-contain bg-black"
                          playsInline
                        />
                        {/* Live indicator */}
                        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-red-600/90 backdrop-blur-sm rounded-full">
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse" />
                          <span className="text-white text-xs sm:text-sm font-medium">LIVE</span>
                        </div>
                      </div>
                    </div>

                    {/* Now Playing Info Panel */}
                    <div className="lg:col-span-1">
                      <div className="bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-neutral-800/50 p-4 sm:p-6 h-full">
                        <p className="text-xs sm:text-sm text-neutral-500 uppercase tracking-wider mb-3 sm:mb-4">Now Playing</p>
                        <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                          {selectedIPTVChannel.logo ? (
                            <div className="w-14 h-14 sm:w-20 sm:h-20 bg-neutral-800 rounded-lg sm:rounded-xl flex items-center justify-center p-1.5 sm:p-2 shrink-0">
                              <img
                                src={selectedIPTVChannel.logo}
                                alt={selectedIPTVChannel.name}
                                className="max-w-full max-h-full object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-14 h-14 sm:w-20 sm:h-20 bg-neutral-800 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
                              <Tv className="w-7 h-7 sm:w-10 sm:h-10 text-neutral-600" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h2 className="text-lg sm:text-2xl font-bold text-white truncate">{selectedIPTVChannel.name}</h2>
                            <span className="inline-block mt-1.5 sm:mt-2 px-2 sm:px-3 py-0.5 sm:py-1 bg-neutral-800 text-neutral-300 text-xs sm:text-sm rounded-full">
                              {selectedIPTVChannel.category}
                            </span>
                          </div>
                        </div>

                        {/* Channel Actions */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-neutral-400 text-sm">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            Stream Status: Active
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State when no channel selected */}
              {!selectedIPTVChannel && iptvChannels.length > 0 && (
                <div className="mb-6 sm:mb-10">
                  <div className="bg-gradient-to-br from-neutral-900/50 to-neutral-950/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-neutral-800/30 p-6 sm:p-12 text-center">
                    <div className="w-16 h-16 sm:w-24 sm:h-24 bg-neutral-800/50 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6 border border-neutral-700/50">
                      <Tv className="w-8 h-8 sm:w-12 sm:h-12 text-neutral-500" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">Select a Channel</h2>
                    <p className="text-sm sm:text-base text-neutral-400 max-w-md mx-auto">Choose a channel from the list below to start watching live content</p>
                  </div>
                </div>
              )}

              {/* Search & Category Filter */}
              <div className="mb-6 sm:mb-8 space-y-3 sm:space-y-4">
                {/* Search Bar */}
                <div className="relative w-full sm:max-w-md">
                  <input
                    type="text"
                    placeholder="Search channels..."
                    value={iptvSearchQuery}
                    onChange={(e) => setIptvSearchQuery(e.target.value)}
                    className="w-full bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-lg sm:rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 pl-10 sm:pl-12 text-sm sm:text-base text-white placeholder-neutral-500 focus:ring-2 focus:ring-red-600/50 focus:border-red-600/50 outline-none transition-all"
                  />
                  <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-neutral-500" />
                  {iptvSearchQuery && (
                    <button
                      onClick={() => setIptvSearchQuery('')}
                      className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-full transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                {iptvCategories.length > 0 && (
                  <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 sm:pb-3 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'thin' }}>
                    <button
                      onClick={() => setSelectedIPTVCategory('all')}
                      className={clsx(
                        "px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all",
                        selectedIPTVCategory === 'all'
                          ? "bg-white text-black shadow-lg"
                          : "bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700 hover:text-white active:bg-neutral-600"
                      )}
                    >
                      All
                    </button>
                    {iptvCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedIPTVCategory(cat)}
                        className={clsx(
                          "px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all",
                          selectedIPTVCategory === cat
                            ? "bg-white text-black shadow-lg"
                            : "bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700 hover:text-white active:bg-neutral-600"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Country Filter */}
                {iptvCountries.length > 0 && (
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="text-xs sm:text-sm text-neutral-500 font-medium flex items-center gap-1.5 sm:gap-2">
                      <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Filter by Country
                    </label>
                    <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 sm:pb-3 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'thin' }}>
                      <button
                        onClick={() => setSelectedIPTVCountry('all')}
                        className={clsx(
                          "px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all border",
                          selectedIPTVCountry === 'all'
                            ? "bg-red-600 text-white border-red-600"
                            : "bg-neutral-900/80 text-neutral-300 border-neutral-700 hover:bg-neutral-800 hover:text-white active:bg-neutral-700"
                        )}
                      >
                        🌍 All ({iptvChannels.length})
                      </button>
                      {iptvCountries.slice(0, 20).map((country) => (
                        <button
                          key={country}
                          onClick={() => setSelectedIPTVCountry(country)}
                          className={clsx(
                            "px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all border",
                            selectedIPTVCountry === country
                              ? "bg-red-600 text-white border-red-600"
                              : "bg-neutral-900/80 text-neutral-300 border-neutral-700 hover:bg-neutral-800 hover:text-white active:bg-neutral-700"
                          )}
                        >
                          {country} ({iptvChannels.filter(c => c.country === country).length})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Channels Grid */}
              <div className="pb-20">
                {loadingIPTV ? (
                  <div className="flex justify-center py-20">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 animate-spin text-red-600 mx-auto mb-4" />
                      <p className="text-neutral-400">Loading channels...</p>
                    </div>
                  </div>
                ) : iptvChannels.length === 0 ? (
                  <div className="text-center py-12 sm:py-20">
                    <div className="w-16 h-16 sm:w-24 sm:h-24 bg-neutral-900 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6 border border-neutral-800">
                      <Tv className="w-8 h-8 sm:w-12 sm:h-12 text-neutral-600" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">No channels yet</h3>
                    <p className="text-sm sm:text-base text-neutral-400 mb-6 sm:mb-8 max-w-md mx-auto px-4">
                      Add IPTV channels manually or import from an M3U playlist to start watching live TV
                    </p>
                    <button
                      onClick={() => setShowIPTVManager(true)}
                      className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-900/30 hover:scale-105 text-sm sm:text-base"
                    >
                      <Plus className="w-4 h-4 sm:w-5 sm:h-5 inline mr-2" />
                      Add Channels
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Filtered results count */}
                    {(iptvSearchQuery || selectedIPTVCountry !== 'all' || selectedIPTVCategory !== 'all') && (
                      <p className="text-sm text-neutral-500 mb-3 sm:mb-4">
                        {iptvChannels.filter(ch => {
                          const matchesCategory = selectedIPTVCategory === 'all' || ch.category === selectedIPTVCategory;
                          const matchesCountry = selectedIPTVCountry === 'all' || ch.country === selectedIPTVCountry;
                          const matchesSearch = !iptvSearchQuery || ch.name.toLowerCase().includes(iptvSearchQuery.toLowerCase()) ||
                            ch.category.toLowerCase().includes(iptvSearchQuery.toLowerCase()) ||
                            (ch.country && ch.country.toLowerCase().includes(iptvSearchQuery.toLowerCase()));
                          return matchesCategory && matchesCountry && matchesSearch;
                        }).length} channels found
                      </p>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2 sm:gap-4">
                      {iptvChannels
                        .filter((ch) => {
                          const matchesCategory = selectedIPTVCategory === 'all' || ch.category === selectedIPTVCategory;
                          const matchesCountry = selectedIPTVCountry === 'all' || ch.country === selectedIPTVCountry;
                          const matchesSearch = !iptvSearchQuery ||
                            ch.name.toLowerCase().includes(iptvSearchQuery.toLowerCase()) ||
                            ch.category.toLowerCase().includes(iptvSearchQuery.toLowerCase()) ||
                            (ch.country && ch.country.toLowerCase().includes(iptvSearchQuery.toLowerCase()));
                          return matchesCategory && matchesCountry && matchesSearch;
                        })
                        .map((channel) => (
                          <div
                            key={channel.id}
                            onClick={() => setSelectedIPTVChannel(channel)}
                            className={clsx(
                              "group cursor-pointer rounded-lg sm:rounded-xl overflow-hidden transition-all duration-300 sm:hover:scale-105 hover:z-10 active:scale-95",
                              selectedIPTVChannel?.id === channel.id
                                ? "ring-2 ring-red-500 ring-offset-1 sm:ring-offset-2 ring-offset-black bg-gradient-to-br from-neutral-800 to-neutral-900"
                                : "bg-neutral-900/80 hover:bg-neutral-800/90 border border-neutral-800/50 hover:border-neutral-700"
                            )}
                          >
                            {/* Channel Logo */}
                            <div className="aspect-video bg-neutral-800/50 flex items-center justify-center p-2 sm:p-4 relative overflow-hidden">
                              {/* Subtle gradient overlay */}
                              <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                              {channel.logo ? (
                                <img
                                  src={channel.logo}
                                  alt={channel.name}
                                  className="max-w-full max-h-full object-contain transition-transform group-hover:scale-110"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Tv className="w-6 h-6 sm:w-10 sm:h-10 text-neutral-600 group-hover:text-neutral-500 transition-colors" />
                              )}

                              {/* Playing indicator */}
                              {selectedIPTVChannel?.id === channel.id && (
                                <div className="absolute top-1 right-1 sm:top-2 sm:right-2 flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-red-600 rounded-full">
                                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-white rounded-full animate-pulse" />
                                  <span className="text-[10px] sm:text-xs font-medium text-white">LIVE</span>
                                </div>
                              )}

                              {/* Play overlay on hover - hidden on mobile */}
                              <div className="absolute inset-0 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="p-2 sm:p-3 bg-red-600/90 rounded-full transform scale-0 group-hover:scale-100 transition-transform">
                                  <Play className="w-4 h-4 sm:w-6 sm:h-6 text-white fill-white" />
                                </div>
                              </div>
                            </div>

                            {/* Channel Info */}
                            <div className="p-2 sm:p-3 flex items-start justify-between gap-1 sm:gap-2">
                              <div className="min-w-0 flex-1">
                                <h4 className="font-medium text-white text-xs sm:text-sm truncate group-hover:text-red-400 transition-colors">
                                  {channel.name}
                                </h4>
                                <span className="text-[10px] sm:text-xs text-neutral-500 truncate block">
                                  {channel.category}{channel.country ? ` • ${channel.country}` : ''}
                                </span>
                              </div>
                              {/* Delete button - visible on mobile tap, hover on desktop */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteIPTVChannel(channel.id);
                                }}
                                className="p-1 sm:p-1.5 text-neutral-600 hover:text-red-500 hover:bg-red-900/30 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0"
                                title="Delete channel"
                              >
                                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )
      }

      {/* Episode Modal */}
      {
        selectedShow && (
          <EpisodeModal
            show={selectedShow}
            seasons={seasons}
            loading={loadingEpisodes}
            onClose={() => setSelectedShow(null)}
            onPlayEpisode={(episodeId, startTime) => playFile('show', selectedShow.id, episodeId, startTime)}
            onDeleteEpisode={handleDeleteEpisode}
          />
        )
      }

      {/* Folder Manager */}
      <FolderManager
        isOpen={showFolderManager}
        onClose={() => setShowFolderManager(false)}
        onScan={handleScan}
        onRefresh={fetchLibrary}
      />

      {/* Context Menu */}
      {
        contextMenu && (
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
        )
      }

      {/* Toast Notifications */}
      {
        toast && (
          <div
            className={clsx(
              "fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-300",
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            )}
          >
            {toast.type === 'success' ? '✓' : '✕'}
            <span>{toast.message}</span>
          </div>
        )
      }

      {/* Video Player (Mobile) */}
      {
        videoPlayer && (
          <VideoPlayer
            src={videoPlayer.src}
            title={videoPlayer.title}
            initialTime={videoPlayer.initialTime}
            onClose={() => setVideoPlayer(null)}
          />
        )
      }

      {/* Play Choice Modal (Mobile) */}
      {
        playChoice && (
          <PlayChoiceModal
            title={playChoice.title}
            streamUrl={playChoice.streamUrl}
            contentType={playChoice.contentType}
            contentId={playChoice.contentId}
            episodeId={playChoice.episodeId}
            onPlayBrowser={playChoice.onPlayBrowser}
            onClose={() => setPlayChoice(null)}
          />
        )
      }

      {/* Mobile Connect QR Modal */}
      {
        showMobileConnect && (
          <MobileConnectModal onClose={() => setShowMobileConnect(false)} />
        )
      }

      {/* DLNA Server Modal */}
      {
        showDlna && (
          <DlnaModal onClose={() => setShowDlna(false)} />
        )
      }

      {/* Mobile Search Modal */}
      {
        showMobileSearch && (
          <MobileSearchModal
            isOpen={showMobileSearch}
            onClose={() => setShowMobileSearch(false)}
            library={library}
            onPlay={(contentType, contentId, episodeId) => {
              playFile(contentType, contentId, episodeId);
            }}
            onOpenShow={openShow}
          />
        )
      }

      {/* Mobile Navigation */}
      <MobileNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onShowQR={() => setShowMobileConnect(true)}
        onShowSettings={() => window.location.href = '/settings'}
        onShowSearch={() => setShowMobileSearch(true)}
        onShowLiveSports={() => setShowLiveSports(true)}
      />

      {/* Floating QR Button (Mobile) */}
      <FloatingQRButton />

      {/* Live Sports Modal */}
      {showLiveSports && (
        <LiveSports onClose={() => setShowLiveSports(false)} />
      )}

      {/* IPTV Manager */}
      {
        showIPTVManager && (
          <IPTVManager
            onClose={() => setShowIPTVManager(false)}
            onChannelsUpdated={fetchIPTVChannels}
          />
        )
      }

    </main >
  );
}
