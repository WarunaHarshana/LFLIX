'use client';

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
              onClick={onManageChannels}
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
                  onClick={onManageChannels}
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
                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteChannel(channel.id);
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
  );
}
