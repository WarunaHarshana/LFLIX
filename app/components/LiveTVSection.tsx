'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Plus, Tv, Trash2, Search, X, Loader2, Globe } from 'lucide-react';
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
  const [qualities, setQualities] = useState<{ index: number; label: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const hlsRef = useRef<any>(null);

  const handleQualityChange = (index: number) => {
    setCurrentQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  };

  useEffect(() => {
    setQualities([]);
    setCurrentQuality(-1);
    hlsRef.current = null;
    if (!selectedIPTVChannel) return;
    const video = videoRef.current;
    if (!video) return;

    const isIframe = selectedIPTVChannel.url.includes('embed') || 
                     selectedIPTVChannel.url.includes('pages.dev') || 
                     selectedIPTVChannel.url.includes('html');

    if (isIframe) return;

    // Use HLS.js for stream if supported (allows quality selection)
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
      if (hls) {
        hls.destroy();
      }
      hlsRef.current = null;
    };
  }, [selectedIPTVChannel]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-black to-neutral-950">
      {/* Hero Section with Video Player */}
      <div className="relative pt-20">
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 via-transparent to-transparent pointer-events-none" />

        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8 pt-4 sm:pt-6">
            <div>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white flex items-center gap-3 sm:gap-4">
                <div className="p-2.5 sm:p-3.5 bg-gradient-to-br from-red-600/30 to-red-600/10 border border-red-500/30 rounded-2xl text-red-500 shadow-lg shadow-red-600/20">
                  <Tv className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <span>Live TV</span>
              </h1>
              <p className="text-neutral-400 text-sm sm:text-base mt-2 ml-1">
                {iptvChannels.length.toLocaleString()} channels available
              </p>
            </div>
            <button
              onClick={onManageChannels}
              className="w-full sm:w-auto px-6 py-3 liquid-btn-primary text-black font-bold rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-105 text-sm sm:text-base cursor-pointer"
            >
              <Plus className="w-5 h-5 text-black" />
              <span>Manage Channels</span>
            </button>
          </div>

          {/* Main Layout - Player + Now Playing Info */}
          {selectedIPTVChannel && (
            <div className="mb-6 sm:mb-10">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Video Player - Takes 2/3 of the space */}
                <div className="lg:col-span-2">
                  <div className="relative bg-black rounded-3xl overflow-hidden border border-white/15 shadow-2xl shadow-black/80 aspect-video">
                    {selectedIPTVChannel.url.includes('embed') || selectedIPTVChannel.url.includes('pages.dev') || selectedIPTVChannel.url.includes('html') ? (
                      <iframe
                        key={selectedIPTVChannel.id}
                        src={selectedIPTVChannel.url}
                        className="w-full h-full border-0"
                        allowFullScreen
                        allow="autoplay; fullscreen *; picture-in-picture"
                        sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-downloads allow-modals allow-pointer-lock"
                      />
                    ) : (
                      <video
                        ref={videoRef}
                        controls
                        autoPlay
                        className="w-full h-full object-contain bg-black"
                        playsInline
                      />
                    )}
                    {/* Live indicator */}
                    <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-1.5 sm:gap-2 px-3 py-1 sm:py-1.5 bg-red-600/90 border border-red-400/40 backdrop-blur-md rounded-full shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse" />
                      <span className="text-white text-xs sm:text-sm font-bold tracking-wider">LIVE</span>
                    </div>
                    {/* Close button overlay */}
                    <button aria-label="Close Player"
                      onClick={() => setSelectedIPTVChannel(null)}
                      className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 p-2.5 liquid-glass-pill bg-black/70 hover:bg-black/90 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                      title="Close Player"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
 
                {/* Now Playing Info Panel */}
                <div className="lg:col-span-1">
                  <div className="liquid-glass-base border border-white/15 rounded-3xl p-5 sm:p-6 h-full shadow-2xl relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute -right-16 -top-16 w-56 h-56 bg-white/[0.02] rounded-full blur-2xl pointer-events-none" />
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <p className="text-xs sm:text-sm text-neutral-400 uppercase font-bold tracking-wider">Now Playing</p>
                        <button aria-label="Close Player"
                          onClick={() => setSelectedIPTVChannel(null)}
                          className="p-1.5 liquid-glass-pill border border-white/10 hover:border-white/25 rounded-full transition-all cursor-pointer text-neutral-400 hover:text-white"
                          title="Close Player"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                        {selectedIPTVChannel.logo ? (
                          <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white/[0.04] border border-white/10 rounded-2xl flex items-center justify-center p-2 shrink-0 shadow-inner">
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
                          <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white/[0.04] border border-white/10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                            <Tv className="w-7 h-7 sm:w-10 sm:h-10 text-neutral-500" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h2 className="text-lg sm:text-2xl font-bold text-white truncate">{selectedIPTVChannel.name}</h2>
                          <span className="inline-block mt-1.5 sm:mt-2 px-3 py-0.5 sm:py-1 liquid-glass-pill border border-white/10 text-neutral-300 text-xs sm:text-sm rounded-full">
                            {selectedIPTVChannel.category}
                          </span>
                        </div>
                      </div>

                      {/* Channel Actions */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-neutral-300 text-sm font-medium">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                          Stream Status: Active
                        </div>

                        {/* Quality Selector */}
                        {qualities.length > 0 && (
                          <div className="space-y-2 pt-3 border-t border-white/10">
                            <label className="text-xs text-neutral-400 font-semibold block uppercase tracking-wider">
                              Stream Quality
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {qualities.map((q) => (
                                <button
                                  key={q.index}
                                  onClick={() => handleQualityChange(q.index)}
                                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                                    currentQuality === q.index
                                      ? 'liquid-glass-pill-active shadow-md text-white'
                                      : 'liquid-glass-pill border border-white/10 text-neutral-300 hover:text-white'
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
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty State when no channel selected */}
          {!selectedIPTVChannel && iptvChannels.length > 0 && (
            <div className="mb-6 sm:mb-10">
              <div className="liquid-glass-base border border-white/10 rounded-3xl p-6 sm:p-12 text-center shadow-xl relative overflow-hidden">
                <div className="w-16 h-16 sm:w-20 sm:h-20 liquid-glass-pill border border-white/15 rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-5 shadow-lg">
                  <Tv className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">Select a Channel</h2>
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
                className="w-full bg-white/[0.04] border border-white/15 focus:border-red-400/50 focus:bg-white/[0.08] rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 pl-11 sm:pl-12 text-sm sm:text-base text-white placeholder-neutral-500 outline-none transition-all shadow-inner"
              />
              <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-neutral-400" />
              {iptvSearchQuery && (
                <button
                  onClick={() => setIptvSearchQuery('')}
                  className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            {iptvCategories.length > 0 && (
              <div className="flex gap-2.5 overflow-x-auto pb-2 sm:pb-3 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
                <button
                  onClick={() => setSelectedIPTVCategory('all')}
                  className={clsx(
                    "px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold whitespace-nowrap transition-all cursor-pointer min-h-[42px] sm:min-h-[44px]",
                    selectedIPTVCategory === 'all'
                      ? "liquid-glass-pill-active font-bold shadow-md text-white border-white/40"
                      : "liquid-glass-pill text-neutral-300 hover:text-white"
                  )}
                >
                  All
                </button>
                {iptvCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedIPTVCategory(cat)}
                    className={clsx(
                      "px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold whitespace-nowrap transition-all cursor-pointer min-h-[42px] sm:min-h-[44px]",
                      selectedIPTVCategory === cat
                        ? "liquid-glass-pill-active font-bold shadow-md text-white border-white/40"
                        : "liquid-glass-pill text-neutral-300 hover:text-white"
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
                <label className="text-xs sm:text-sm text-neutral-400 font-semibold flex items-center gap-1.5 sm:gap-2 uppercase tracking-wider">
                  <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400" />
                  Filter by Country
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-3 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
                  <button
                    onClick={() => setSelectedIPTVCountry('all')}
                    className={clsx(
                      "px-4 sm:px-4.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]",
                      selectedIPTVCountry === 'all'
                        ? "liquid-glass-pill-active font-bold shadow-md text-white border-white/40"
                        : "liquid-glass-pill text-neutral-300 hover:text-white"
                    )}
                  >
                    <Globe className="w-3.5 h-3.5 text-neutral-400" />
                    <span>All ({iptvChannels.length})</span>
                  </button>
                  {iptvCountries.slice(0, 20).map((country) => (
                    <button
                      key={country}
                      onClick={() => setSelectedIPTVCountry(country)}
                      className={clsx(
                        "px-4 sm:px-4.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all cursor-pointer min-h-[40px]",
                        selectedIPTVCountry === country
                          ? "liquid-glass-pill-active font-bold shadow-md text-white border-white/40"
                          : "liquid-glass-pill text-neutral-300 hover:text-white"
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
                  <Loader2 className="w-12 h-12 animate-spin text-red-500 mx-auto mb-4" />
                  <p className="text-neutral-300 font-medium">Loading channels...</p>
                </div>
              </div>
            ) : iptvChannels.length === 0 ? (
              <div className="text-center py-12 sm:py-20 liquid-glass-base border border-white/10 rounded-3xl p-8 sm:p-12 shadow-xl">
                <div className="w-16 h-16 sm:w-20 sm:h-20 liquid-glass-pill border border-white/15 rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg">
                  <Tv className="w-8 h-8 sm:w-10 sm:h-10 text-neutral-400" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">No channels yet</h3>
                <p className="text-sm sm:text-base text-neutral-400 mb-6 sm:mb-8 max-w-md mx-auto px-4">
                  Add IPTV channels manually or import from an M3U playlist to start watching live TV
                </p>
                <button
                  onClick={onManageChannels}
                  className="px-6 sm:px-8 py-3.5 sm:py-4 liquid-btn-red text-white font-bold rounded-2xl transition-all shadow-[0_0_20px_rgba(239,68,68,0.35)] hover:scale-105 text-sm sm:text-base cursor-pointer"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5 inline mr-2" />
                  Add Channels
                </button>
              </div>
            ) : (
              <>
                {/* Filtered results count */}
                {(iptvSearchQuery || selectedIPTVCountry !== 'all' || selectedIPTVCategory !== 'all') && (
                  <p className="text-xs sm:text-sm text-neutral-400 font-medium mb-3 sm:mb-4">
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

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4">
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
                          "group cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.04] hover:z-20 active:scale-95 liquid-card liquid-sheen-effect border",
                          selectedIPTVChannel?.id === channel.id
                            ? "border-red-500/80 shadow-[0_0_24px_rgba(239,68,68,0.4)] ring-1 ring-red-500/50"
                            : "border-white/10 hover:border-white/30 hover:shadow-[0_16px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(255,255,255,0.1)]"
                        )}
                      >
                        {/* Channel Logo */}
                        <div className="aspect-video bg-white/[0.02] border-b border-white/5 flex items-center justify-center p-2 sm:p-4 relative overflow-hidden">
                          {/* Subtle gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                          {channel.logo ? (
                            <img
                              src={channel.logo}
                              alt={channel.name}
                              className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-110"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Tv className="w-6 h-6 sm:w-10 sm:h-10 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                          )}

                          {/* Playing indicator */}
                          {selectedIPTVChannel?.id === channel.id && (
                            <div className="absolute top-2 right-2 flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:py-1 bg-red-600/95 border border-red-400/40 backdrop-blur-md rounded-full shadow-[0_0_10px_rgba(239,68,68,0.4)]">
                              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-white rounded-full animate-pulse" />
                              <span className="text-[10px] sm:text-xs font-bold text-white">LIVE</span>
                            </div>
                          )}

                          {/* Play overlay on hover - hidden on mobile */}
                          <div className="absolute inset-0 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="p-2.5 sm:p-3 bg-red-600/90 rounded-full transform scale-0 group-hover:scale-100 transition-transform shadow-lg shadow-red-900/40">
                              <Play className="w-4 h-4 sm:w-6 sm:h-6 text-white fill-white" />
                            </div>
                          </div>
                        </div>

                        {/* Channel Info */}
                        <div className="p-2.5 sm:p-3 flex items-start justify-between gap-1 sm:gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-white text-xs sm:text-sm truncate group-hover:text-red-400 transition-colors">
                              {channel.name}
                            </h4>
                            <span className="text-[10px] sm:text-xs text-neutral-400 truncate block mt-0.5 font-medium">
                              {channel.category}{channel.country ? ` • ${channel.country}` : ''}
                            </span>
                          </div>
                          {/* Delete button */}
                          {channel.id >= 0 && (
                            <button aria-label="Delete channel"
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
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
