'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Plus,
  Tv,
  Trash2,
  Search,
  X,
  Loader2,
  Globe,
  Star,
  RotateCw,
  ExternalLink,
  Maximize,
  Minimize,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Film,
  Newspaper,
  Trophy,
  Clapperboard,
  Sparkles,
  Music,
  Heart,
  Radio,
  SlidersHorizontal,
  Flame
} from 'lucide-react';
import clsx from 'clsx';
import type { IPTVChannel } from '@/app/types';

type LiveTVSectionProps = {
  iptvChannels: IPTVChannel[];
  iptvCategories: string[];
  iptvCountries: string[];
  selectedIPTVCategory: string;
  setSelectedIPTVCategory: (cat: string) => void;
  selectedIPTVCountry: string;
  setSelectedIPTVCountry: (country: string) => void;
  iptvSearchQuery: string;
  setIptvSearchQuery: (query: string) => void;
  selectedIPTVChannel: IPTVChannel | null;
  setSelectedIPTVChannel: (channel: IPTVChannel | null) => void;
  loadingIPTV: boolean;
  onManageChannels: () => void;
  onDeleteChannel: (channelId: number) => void;
};

/* =========================================================================
   IFRAME & STREAM RESOLUTION HELPERS
   ========================================================================= */

function isIframeStream(url?: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();

  // If it's a direct m3u8 or mp4 stream and not an embed portal
  if ((lower.includes('.m3u8') || lower.includes('.mp4') || lower.includes('ext=.m3u8')) &&
      !lower.includes('ehgembxe.cfd') &&
      !lower.includes('/embed') &&
      !lower.includes('/play/') &&
      !lower.includes('html')) {
    return false;
  }

  // Embed portals and web-based iframe players
  if (
    lower.includes('embed') ||
    lower.includes('/play/') ||
    lower.includes('pages.dev') ||
    lower.includes('ehgembxe') ||
    lower.includes('taifood') ||
    lower.includes('embdlol') ||
    lower.includes('strmfree') ||
    lower.includes('html') ||
    lower.includes('iframe') ||
    lower.includes('player')
  ) {
    return true;
  }

  return false;
}

function getChannelInitials(name: string): string {
  const clean = name.replace(/^[-–\s]+/, '').trim();
  const parts = clean.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 3).toUpperCase() || 'TV';
}

function matchesCategory(channelCat: string, filterCat: string): boolean {
  if (!filterCat || filterCat === 'all') return true;
  const c = (channelCat || '').toLowerCase().trim();
  const f = filterCat.toLowerCase().trim();
  if (c === f) return true;

  if (f === 'sports' && (c.includes('sport') || c.includes('espn') || c.includes('bein') || c.includes('sky'))) return true;
  if (f === 'news' && (c.includes('news') || c.includes('cnn') || c.includes('bbc') || c.includes('fox'))) return true;
  if (f === 'movies' && (c.includes('movie') || c.includes('cinema') || c.includes('film') || c.includes('hbo') || c.includes('starz'))) return true;
  if (f === 'entertainment' && (c.includes('entertain') || c.includes('series') || c.includes('show') || c.includes('usa') || c.includes('tbs'))) return true;
  if (f === 'documentary' && (c.includes('doc') || c.includes('geo') || c.includes('discovery') || c.includes('history'))) return true;
  if (f === 'kids' && (c.includes('kid') || c.includes('cartoon') || c.includes('animation') || c.includes('disney') || c.includes('nick'))) return true;
  if (f === 'music' && (c.includes('music') || c.includes('mtv') || c.includes('vh1'))) return true;

  return c.includes(f);
}

/* =========================================================================
   CATEGORY ICON PICKER
   ========================================================================= */

function CategoryIcon({ category, className = "w-4 h-4" }: { category: string; className?: string }) {
  const c = category.toLowerCase().trim();
  if (c === 'favorites') return <Star className={clsx(className, "text-amber-400 fill-amber-400")} />;
  if (c.includes('sport')) return <Trophy className={clsx(className, "text-red-400")} />;
  if (c.includes('news')) return <Newspaper className={clsx(className, "text-blue-400")} />;
  if (c.includes('movie') || c.includes('cinema')) return <Film className={clsx(className, "text-purple-400")} />;
  if (c.includes('entertain') || c.includes('series')) return <Clapperboard className={clsx(className, "text-amber-400")} />;
  if (c.includes('doc')) return <Sparkles className={clsx(className, "text-emerald-400")} />;
  if (c.includes('kid')) return <Heart className={clsx(className, "text-pink-400")} />;
  if (c.includes('music')) return <Music className={clsx(className, "text-cyan-400")} />;
  if (c.includes('tim')) return <Radio className={clsx(className, "text-emerald-400")} />;
  return <Tv className={clsx(className, "text-neutral-400")} />;
}

/* =========================================================================
   MAIN LIVETVSECTION COMPONENT
   ========================================================================= */

export default function LiveTVSection({
  iptvChannels,
  iptvCategories,
  iptvCountries,
  selectedIPTVCategory,
  setSelectedIPTVCategory,
  selectedIPTVCountry,
  setSelectedIPTVCountry,
  iptvSearchQuery,
  setIptvSearchQuery,
  selectedIPTVChannel,
  setSelectedIPTVChannel,
  loadingIPTV,
  onManageChannels,
  onDeleteChannel,
}: LiveTVSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [qualities, setQualities] = useState<{ index: number; label: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const hlsRef = useRef<any>(null);

  const [theaterMode, setTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamReloadKey, setStreamReloadKey] = useState(0);
  const [imgErrors, setImgErrors] = useState<Record<string | number, boolean>>({});

  // Favorites System backed by localStorage
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('lflix_iptv_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = (channelId: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFavoriteIds((prev) => {
      const next = prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId];
      try {
        localStorage.setItem('lflix_iptv_favorites', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Fullscreen tracking
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  const handleQualityChange = (index: number) => {
    setCurrentQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  };

  // Direct HLS video setup
  useEffect(() => {
    setQualities([]);
    setCurrentQuality(-1);
    hlsRef.current = null;
    if (!selectedIPTVChannel || !selectedIPTVChannel.url) return;

    if (isIframeStream(selectedIPTVChannel.url)) return;

    const video = videoRef.current;
    if (!video) return;

    let hls: any;
    import('hls.js').then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(selectedIPTVChannel.url);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const levels = hls.levels.map((level: any, idx: number) => {
            const label = level.name || (level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}k`);
            return { index: idx, label };
          });
          setQualities([{ index: -1, label: 'Auto' }, ...levels]);
          videoRef.current?.play().catch(() => {});
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = selectedIPTVChannel.url;
        video.play().catch(() => {});
      } else {
        video.src = selectedIPTVChannel.url;
        video.play().catch(() => {});
      }
    });

    return () => {
      if (hls) hls.destroy();
      hlsRef.current = null;
    };
  }, [selectedIPTVChannel, streamReloadKey]);

  // Curated sidebar / tabs list
  const primaryCategories = [
    { id: 'favorites', label: 'Favorites', icon: 'favorites' },
    { id: 'all', label: 'All Channels', icon: 'all' },
    { id: 'Sports', label: 'Sports', icon: 'Sports' },
    { id: 'News', label: 'News', icon: 'News' },
    { id: 'Movies', label: 'Movies & Cinema', icon: 'Movies' },
    { id: 'Entertainment', label: 'Entertainment', icon: 'Entertainment' },
    { id: 'Documentary', label: 'Documentaries', icon: 'Documentary' },
    { id: 'Kids', label: 'Kids & Family', icon: 'Kids' },
    { id: 'Music', label: 'Music', icon: 'Music' },
  ];

  // Dynamic additional categories from playlist
  const additionalCategories = useMemo(() => {
    const known = new Set(primaryCategories.map(c => c.id.toLowerCase()));
    return iptvCategories.filter(cat => !known.has(cat.toLowerCase()));
  }, [iptvCategories]);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      favorites: iptvChannels.filter(c => favoriteIds.includes(c.id)).length,
      all: iptvChannels.length
    };
    for (const cat of primaryCategories) {
      if (cat.id !== 'favorites' && cat.id !== 'all') {
        counts[cat.id] = iptvChannels.filter(c => matchesCategory(c.category, cat.id)).length;
      }
    }
    for (const cat of additionalCategories) {
      counts[cat] = iptvChannels.filter(c => c.category === cat).length;
    }
    return counts;
  }, [iptvChannels, favoriteIds, additionalCategories]);

  // Filtered channel list
  const filteredChannels = useMemo(() => {
    return iptvChannels.filter((ch) => {
      // Favorites filter
      if (selectedIPTVCategory === 'favorites') {
        if (!favoriteIds.includes(ch.id)) return false;
      } else if (selectedIPTVCategory !== 'all') {
        if (!matchesCategory(ch.category, selectedIPTVCategory)) return false;
      }

      // Country filter
      if (selectedIPTVCountry !== 'all' && ch.country !== selectedIPTVCountry) {
        return false;
      }

      // Search query filter
      if (iptvSearchQuery.trim()) {
        const q = iptvSearchQuery.toLowerCase().trim();
        const matchesName = ch.name?.toLowerCase().includes(q);
        const matchesCat = ch.category?.toLowerCase().includes(q);
        const matchesCountry = ch.country?.toLowerCase().includes(q);
        if (!matchesName && !matchesCat && !matchesCountry) return false;
      }

      return true;
    });
  }, [iptvChannels, selectedIPTVCategory, selectedIPTVCountry, iptvSearchQuery, favoriteIds]);

  // Channel surfing (Next / Prev)
  const currentChannelIndex = useMemo(() => {
    if (!selectedIPTVChannel) return -1;
    return filteredChannels.findIndex((c) => c.id === selectedIPTVChannel.id);
  }, [filteredChannels, selectedIPTVChannel]);

  const handleNextChannel = () => {
    if (filteredChannels.length === 0) return;
    const nextIdx = (currentChannelIndex + 1) % filteredChannels.length;
    setSelectedIPTVChannel(filteredChannels[nextIdx]);
  };

  const handlePrevChannel = () => {
    if (filteredChannels.length === 0) return;
    const prevIdx = (currentChannelIndex - 1 + filteredChannels.length) % filteredChannels.length;
    setSelectedIPTVChannel(filteredChannels[prevIdx]);
  };

  const isFavorite = selectedIPTVChannel ? favoriteIds.includes(selectedIPTVChannel.id) : false;

  const resetFilters = () => {
    setSelectedIPTVCategory('all');
    setSelectedIPTVCountry('all');
    setIptvSearchQuery('');
  };

  const isFilterActive = selectedIPTVCategory !== 'all' || selectedIPTVCountry !== 'all' || iptvSearchQuery.trim() !== '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-black to-neutral-950">
      {/* Hero Section with Video Player */}
      <div className="relative pt-20">
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 via-transparent to-transparent pointer-events-none" />

        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8 pt-4 sm:pt-6">
            <div>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white flex items-center gap-3 sm:gap-4">
                <div className="p-2.5 sm:p-3.5 bg-gradient-to-br from-red-600/30 to-red-600/10 border border-red-500/30 rounded-2xl text-red-500 shadow-lg shadow-red-600/20">
                  <Tv className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <span>Live TV</span>
              </h1>
              <p className="text-neutral-400 text-sm sm:text-base mt-2 ml-1">
                {iptvChannels.length.toLocaleString()} broadcast channels available
              </p>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={onManageChannels}
                className="w-full sm:w-auto px-5 py-2.5 liquid-btn-primary text-black font-bold rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-105 text-sm sm:text-base cursor-pointer"
              >
                <Plus className="w-5 h-5 text-black" />
                <span>Manage Channels</span>
              </button>
            </div>
          </div>

          {/* Main Player Section */}
          {selectedIPTVChannel && (
            <div className="mb-8 animate-fade-in">
              <div className={`grid gap-6 ${theaterMode ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
                {/* Video Player (2/3 width or 100% theater mode) */}
                <div className={theaterMode ? 'w-full' : 'lg:col-span-2'}>
                  <div
                    ref={containerRef}
                    onDoubleClick={toggleFullscreen}
                    style={isFullscreen ? {
                      width: '100vw',
                      height: '100vh',
                      maxWidth: '100vw',
                      maxHeight: '100vh',
                      aspectRatio: 'auto',
                      borderRadius: '0px',
                      border: 'none',
                      zIndex: 9999,
                      position: 'fixed',
                      top: 0,
                      left: 0
                    } : undefined}
                    className="relative bg-black rounded-3xl overflow-hidden border border-white/15 shadow-2xl shadow-black/90 aspect-video flex items-center justify-center transition-all duration-300"
                  >
                    {isIframeStream(selectedIPTVChannel.url) ? (
                      <iframe
                        key={`${selectedIPTVChannel.id}-${streamReloadKey}`}
                        src={selectedIPTVChannel.url}
                        className="w-full h-full border-0 bg-black"
                        allowFullScreen
                        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <video
                        key={`${selectedIPTVChannel.id}-${streamReloadKey}`}
                        ref={videoRef}
                        controls
                        controlsList="nofullscreen"
                        autoPlay
                        className="w-full h-full object-contain bg-black"
                        playsInline
                      >
                        Your browser does not support the video tag.
                      </video>
                    )}

                    {/* Overlaid Top Left: Live indicator */}
                    <div className="absolute top-3.5 left-3.5 sm:top-4 sm:left-4 z-20 flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-red-600/90 border border-red-400/40 backdrop-blur-md rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        <span className="text-white text-xs font-bold tracking-wider">LIVE</span>
                      </div>
                      <span className="px-2.5 py-1 bg-black/75 border border-white/20 backdrop-blur-md rounded-full text-white text-xs font-semibold shadow-md truncate max-w-[200px] hidden sm:inline-block">
                        {selectedIPTVChannel.name}
                      </span>
                    </div>

                    {/* Overlaid Top Right Controls Group */}
                    <div className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 z-20 flex items-center gap-2">
                      {/* Reload Stream Button */}
                      <button
                        type="button"
                        aria-label="Reload Stream"
                        onClick={() => setStreamReloadKey(k => k + 1)}
                        className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                        title="Reload Channel Stream"
                      >
                        <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>

                      {/* Open in External Tab */}
                      <button
                        type="button"
                        aria-label="Open Stream in External Tab"
                        onClick={() => window.open(selectedIPTVChannel.url, '_blank', 'noopener,noreferrer')}
                        className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                        title="Open Stream in External Tab"
                      >
                        <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>

                      {/* Theater Mode Toggle */}
                      <button
                        type="button"
                        aria-label={theaterMode ? "Exit Theater Mode" : "Enter Theater Mode"}
                        onClick={() => setTheaterMode(!theaterMode)}
                        className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105 hidden lg:flex"
                        title={theaterMode ? "Exit Theater Mode" : "Enter Theater Mode"}
                      >
                        <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>

                      {/* Fullscreen Button */}
                      <button
                        type="button"
                        aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        onClick={toggleFullscreen}
                        className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                      >
                        {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </button>

                      {/* Close Player */}
                      <button
                        type="button"
                        aria-label="Close Player"
                        onClick={() => {
                          setSelectedIPTVChannel(null);
                          setTheaterMode(false);
                        }}
                        className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                        title="Close Player"
                      >
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>

                    {/* Bottom Channel Surfing Bar (Quick Next/Previous) */}
                    <div className="absolute bottom-3 inset-x-4 z-20 flex items-center justify-between pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-200">
                      <button
                        type="button"
                        onClick={handlePrevChannel}
                        className="pointer-events-auto px-3 py-1.5 rounded-full liquid-glass-pill bg-black/80 hover:bg-black/95 border border-white/20 text-white text-xs font-semibold backdrop-blur-xl flex items-center gap-1 shadow-lg hover:scale-105"
                        title="Previous Channel"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev Channel</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleNextChannel}
                        className="pointer-events-auto px-3 py-1.5 rounded-full liquid-glass-pill bg-black/80 hover:bg-black/95 border border-white/20 text-white text-xs font-semibold backdrop-blur-xl flex items-center gap-1 shadow-lg hover:scale-105"
                        title="Next Channel"
                      >
                        <span>Next Channel</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Now Playing Info Card (1/3 width or underneath in theater mode) */}
                <div className={theaterMode ? 'w-full' : 'lg:col-span-1'}>
                  <div className="liquid-glass-base border border-white/15 rounded-3xl p-5 sm:p-6 h-full shadow-2xl relative flex flex-col justify-between">
                    <div className="relative z-10 flex flex-col flex-1 justify-between">
                      <div>
                        {/* Header with Favorite Button */}
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs sm:text-sm text-neutral-400 uppercase font-bold tracking-wider">
                            Now Playing
                          </p>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                              onClick={(e) => toggleFavorite(selectedIPTVChannel.id, e)}
                              className={`p-2 rounded-full border transition-all cursor-pointer ${
                                isFavorite
                                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                                  : 'liquid-glass-pill border-white/10 text-neutral-400 hover:text-white'
                              }`}
                              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                            >
                              <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                            </button>

                            <button
                              type="button"
                              aria-label="Close Player"
                              onClick={() => {
                                setSelectedIPTVChannel(null);
                                setTheaterMode(false);
                              }}
                              className="p-1.5 liquid-glass-pill border border-white/10 hover:border-white/25 rounded-full transition-all cursor-pointer text-neutral-400 hover:text-white"
                              title="Close Player"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Channel Brand Identity */}
                        <div className="flex items-start gap-4 mb-5">
                          {selectedIPTVChannel.logo && !imgErrors[selectedIPTVChannel.id] ? (
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/[0.04] border border-white/10 rounded-2xl flex items-center justify-center p-2 shrink-0 shadow-inner">
                              <img
                                src={selectedIPTVChannel.logo}
                                alt={selectedIPTVChannel.name}
                                className="max-w-full max-h-full object-contain drop-shadow-md"
                                onError={() => setImgErrors(prev => ({ ...prev, [selectedIPTVChannel.id]: true }))}
                              />
                            </div>
                          ) : (
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/[0.04] border border-white/10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner font-black text-sm text-neutral-300 font-mono">
                              {getChannelInitials(selectedIPTVChannel.name)}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <h2 className="text-lg sm:text-2xl font-bold text-white truncate leading-tight">
                              {selectedIPTVChannel.name}
                            </h2>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 liquid-glass-pill border border-white/10 text-neutral-300 text-xs rounded-full font-medium">
                                <CategoryIcon category={selectedIPTVChannel.category} className="w-3 h-3" />
                                <span>{selectedIPTVChannel.category}</span>
                              </span>
                              {selectedIPTVChannel.country && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-neutral-400 text-xs">
                                  <Globe className="w-3 h-3 text-neutral-400" />
                                  <span>{selectedIPTVChannel.country}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Channel Details & Quality */}
                        <div className="space-y-3 pt-3 border-t border-white/10">
                          <div className="flex items-center justify-between text-xs text-neutral-300">
                            <span className="text-neutral-400 font-medium">Stream Type:</span>
                            <span className="font-semibold px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-neutral-200">
                              {isIframeStream(selectedIPTVChannel.url) ? 'Secure Embed Player' : 'Direct HLS Stream'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs text-neutral-300">
                            <span className="text-neutral-400 font-medium">Status:</span>
                            <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                              <span>Broadcasting Live</span>
                            </div>
                          </div>

                          {/* Direct HLS Quality Selector */}
                          {qualities.length > 1 && (
                            <div className="space-y-2 pt-2">
                              <label className="text-[11px] text-neutral-400 font-semibold block uppercase tracking-wider">
                                Stream Resolution
                              </label>
                              <div className="flex flex-wrap gap-1.5">
                                {qualities.map((q) => (
                                  <button
                                    type="button"
                                    key={q.index}
                                    onClick={() => handleQualityChange(q.index)}
                                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                      currentQuality === q.index
                                        ? 'bg-white/[0.15] text-white border border-white/30 shadow-md font-bold'
                                        : 'bg-white/[0.04] border border-white/10 text-neutral-400 hover:text-white'
                                    }`}
                                  >
                                    {q.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Stream Troubleshooting Tip */}
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-neutral-400 text-[11px] leading-relaxed flex items-start gap-2">
                          <RotateCw className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                          <span>If the stream buffers or fails to connect, click the reload icon on the video player or try an alternate channel.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty Hero State when no channel is selected */}
          {!selectedIPTVChannel && iptvChannels.length > 0 && (
            <div className="mb-6 sm:mb-8">
              <div className="liquid-glass-base border border-white/10 rounded-3xl p-6 sm:p-10 text-center shadow-xl relative overflow-hidden">
                <div className="w-16 h-16 sm:w-20 sm:h-20 liquid-glass-pill border border-white/15 rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-5 shadow-lg">
                  <Tv className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">Select a Live TV Channel</h2>
                <p className="text-sm sm:text-base text-neutral-400 max-w-md mx-auto">
                  Browse sports, news, movies, and international television networks below to begin streaming
                </p>
              </div>
            </div>
          )}

          {/* Search, Country Filter & Category Navigation */}
          <div className="mb-6 sm:mb-8 space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 sm:max-w-md">
                <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search channels by name, category, or country..."
                  value={iptvSearchQuery}
                  onChange={(e) => setIptvSearchQuery(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/15 focus:border-red-400/50 focus:bg-white/[0.08] rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 pl-11 sm:pl-12 text-sm sm:text-base text-white placeholder-neutral-500 outline-none transition-all shadow-inner"
                />
                {iptvSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setIptvSearchQuery('')}
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Reset Filters Button */}
              {isFilterActive && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-neutral-300 hover:text-white liquid-glass-pill rounded-xl transition-all cursor-pointer shrink-0"
                >
                  <FilterX className="w-4 h-4" />
                  <span>Clear Filters</span>
                </button>
              )}
            </div>

            {/* Category Navigation Pills (with Favorites Tab & Dynamic Counts) */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
              {primaryCategories.map((cat) => {
                const count = categoryCounts[cat.id] || 0;
                const isSelected = selectedIPTVCategory === cat.id;

                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => setSelectedIPTVCategory(cat.id)}
                    className={clsx(
                      "px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 shrink-0 select-none min-h-[42px]",
                      isSelected
                        ? "liquid-glass-pill-active font-bold shadow-md text-white border-white/40"
                        : "liquid-glass-pill text-neutral-300 hover:text-white"
                    )}
                  >
                    <CategoryIcon category={cat.icon} className="w-4 h-4" />
                    <span>{cat.label}</span>
                    <span className={clsx(
                      "text-xs font-mono tabular-nums px-2 py-0.5 rounded-full",
                      isSelected ? "bg-white/25 text-white font-bold" : "bg-white/10 text-neutral-400"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}

              {/* Dynamic Categories */}
              {additionalCategories.map((cat) => {
                const count = categoryCounts[cat] || 0;
                const isSelected = selectedIPTVCategory === cat;

                return (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setSelectedIPTVCategory(cat)}
                    className={clsx(
                      "px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 shrink-0 select-none min-h-[42px]",
                      isSelected
                        ? "liquid-glass-pill-active font-bold shadow-md text-white border-white/40"
                        : "liquid-glass-pill text-neutral-300 hover:text-white"
                    )}
                  >
                    <CategoryIcon category={cat} className="w-4 h-4" />
                    <span>{cat}</span>
                    <span className={clsx(
                      "text-xs font-mono tabular-nums px-2 py-0.5 rounded-full",
                      isSelected ? "bg-white/25 text-white font-bold" : "bg-white/10 text-neutral-400"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Country Quick Filter */}
            {iptvCountries.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
                <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
                  <Globe className="w-3.5 h-3.5 text-neutral-400" />
                  Country:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIPTVCountry('all')}
                  className={clsx(
                    "px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shrink-0",
                    selectedIPTVCountry === 'all'
                      ? "bg-white/20 text-white border-white/30 shadow-sm font-bold"
                      : "bg-white/[0.03] border-white/10 text-neutral-400 hover:text-white"
                  )}
                >
                  All Countries ({iptvChannels.length})
                </button>
                {iptvCountries.slice(0, 15).map((country) => {
                  const count = iptvChannels.filter(c => c.country === country).length;
                  const isSelected = selectedIPTVCountry === country;
                  return (
                    <button
                      type="button"
                      key={country}
                      onClick={() => setSelectedIPTVCountry(isSelected ? 'all' : country)}
                      className={clsx(
                        "px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shrink-0",
                        isSelected
                          ? "bg-white/20 text-white border-white/30 shadow-sm font-bold"
                          : "bg-white/[0.03] border-white/10 text-neutral-400 hover:text-white"
                      )}
                    >
                      <span>{country}</span>
                      <span className="text-[10px] opacity-75 font-mono ml-1">({count})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Channels Grid / Loading / Empty States */}
          <div className="pb-20">
            {loadingIPTV ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 animate-spin text-red-500 mb-4" />
                <p className="text-neutral-300 font-medium">Loading live TV channels...</p>
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="text-center py-12 sm:py-20 liquid-glass-base border border-white/10 rounded-3xl p-8 sm:p-12 shadow-xl max-w-lg mx-auto">
                <div className="w-16 h-16 sm:w-20 sm:h-20 liquid-glass-pill border border-white/15 rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg">
                  {selectedIPTVCategory === 'favorites' ? (
                    <Star className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 fill-amber-400" />
                  ) : (
                    <Tv className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-400" />
                  )}
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">
                  {selectedIPTVCategory === 'favorites'
                    ? "No Favorite Channels Yet"
                    : "No Channels Found"}
                </h3>
                <p className="text-sm sm:text-base text-neutral-400 mb-6 max-w-md mx-auto">
                  {selectedIPTVCategory === 'favorites'
                    ? "Click the star icon on any channel card to add it to your favorites for instant access."
                    : iptvSearchQuery
                    ? `No channels found matching "${iptvSearchQuery}". Try a different search term or category.`
                    : "Try adjusting your category or country filters to discover available channels."}
                </p>
                <div className="flex items-center justify-center gap-3">
                  {isFilterActive && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="px-6 py-2.5 rounded-xl liquid-btn-primary text-black font-bold transition-all hover:scale-105 cursor-pointer shadow-md text-sm"
                    >
                      Clear All Filters
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onManageChannels}
                    className="px-6 py-2.5 rounded-xl liquid-glass-pill border border-white/20 text-white font-semibold transition-all hover:scale-105 cursor-pointer text-sm"
                  >
                    Manage Channels
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Result stats */}
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs sm:text-sm text-neutral-400 font-medium">
                    Showing <span className="text-white font-bold">{filteredChannels.length}</span> channels
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4">
                  {filteredChannels.map((channel) => {
                    const isSelected = selectedIPTVChannel?.id === channel.id;
                    const isFav = favoriteIds.includes(channel.id);

                    return (
                      <div
                        key={channel.id}
                        onClick={() => setSelectedIPTVChannel(channel)}
                        className={clsx(
                          "group cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.04] hover:z-20 active:scale-95 liquid-card border relative flex flex-col justify-between",
                          isSelected
                            ? "border-red-500/80 shadow-[0_0_24px_rgba(239,68,68,0.4)] ring-1 ring-red-500/50"
                            : "border-white/10 hover:border-white/30 hover:shadow-[0_16px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.1)]"
                        )}
                      >
                        {/* Channel Logo Container */}
                        <div className="aspect-video bg-white/[0.02] border-b border-white/5 flex items-center justify-center p-3 sm:p-4 relative overflow-hidden">
                          {/* Top-Right Favorite Star Button */}
                          <button
                            type="button"
                            aria-label={isFav ? "Remove from Favorites" : "Add to Favorites"}
                            onClick={(e) => toggleFavorite(channel.id, e)}
                            className={clsx(
                              "absolute top-2 right-2 z-20 p-1.5 rounded-full transition-all cursor-pointer backdrop-blur-md",
                              isFav
                                ? "bg-black/80 text-amber-400 shadow-md"
                                : "bg-black/60 text-white/40 hover:text-white opacity-0 group-hover:opacity-100"
                            )}
                            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                          >
                            <Star className={clsx("w-3.5 h-3.5", isFav && "fill-amber-400 text-amber-400")} />
                          </button>

                          {/* Playing LIVE Indicator */}
                          {isSelected && (
                            <div className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 bg-red-600/95 border border-red-400/40 backdrop-blur-md rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                              <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
                              <span className="text-[9px] font-bold text-white tracking-wider">LIVE</span>
                            </div>
                          )}

                          {channel.logo && !imgErrors[channel.id] ? (
                            <img
                              src={channel.logo}
                              alt={channel.name}
                              className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-110 drop-shadow-md"
                              onError={() => setImgErrors(prev => ({ ...prev, [channel.id]: true }))}
                            />
                          ) : (
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center font-black text-xs text-neutral-300 font-mono shadow-inner">
                              {getChannelInitials(channel.name)}
                            </div>
                          )}

                          {/* Play overlay on hover */}
                          <div className="absolute inset-0 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                            <div className="p-2.5 bg-white text-black rounded-full transform scale-0 group-hover:scale-100 transition-transform shadow-xl">
                              <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                            </div>
                          </div>
                        </div>

                        {/* Channel Information Footer */}
                        <div className="p-2.5 sm:p-3 flex items-start justify-between gap-1 sm:gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-white text-xs sm:text-sm truncate group-hover:text-red-400 transition-colors leading-tight">
                              {channel.name}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-neutral-400 font-medium truncate">
                              <span className="truncate">{channel.category}</span>
                              {channel.country && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{channel.country}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Delete button for user custom channels */}
                          {channel.id >= 0 && (
                            <button
                              type="button"
                              aria-label="Delete channel"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteChannel(channel.id);
                              }}
                              className="p-1 sm:p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-950/40 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0"
                              title="Delete channel"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
