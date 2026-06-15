'use client';

import { useState, useEffect, useRef } from 'react';
import { Trophy, Play, X, Activity, Clock, Globe, AlertCircle, ChevronLeft, ChevronDown, Check, Tv } from 'lucide-react';

type Sport = {
  id: string;
  name: string;
  icon: string;
};

type Team = {
  name: string;
  badge?: string;
};

type StreamSource = {
  source: string;
  id: string;
};

type Match = {
  id: string;
  title: string;
  category: string;
  date: number;
  poster: string | null;
  popular: boolean;
  teams?: {
    home?: Team;
    away?: Team;
  };
  sources: StreamSource[];
  isLive: boolean;
  is4k?: boolean;
};

type Stream = {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
};

type Props = {
  onClose: () => void;
};

export default function LiveSports({ onClose }: Props) {
  const [sports, setSports] = useState<Sport[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'today'>('live');
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [qualities, setQualities] = useState<{ index: number; label: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const hlsRef = useRef<any>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQualityChange = (index: number) => {
    setCurrentQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  };

  // Setup HLS.js for direct video streams (.m3u8) on browsers that don't support it natively
  useEffect(() => {
    setQualities([]);
    setCurrentQuality(-1);
    hlsRef.current = null; 
    if (!selectedStream) return;
    const video = videoRef.current;
    if (!video) return;

    const isIframe = selectedStream.embedUrl.includes('embed') || 
                     selectedStream.embedUrl.includes('pages.dev') || 
                     selectedStream.embedUrl.includes('html');

    if (isIframe) return;

    let hls: any;
    import('hls.js').then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(selectedStream.embedUrl);
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
        video.src = selectedStream.embedUrl;
        video.play().catch(() => {});
      } else {
        video.src = selectedStream.embedUrl;
        video.play().catch(() => {});
      }
    });

    return () => {
      if (hls) {
        hls.destroy();
      }
      hlsRef.current = null;
    };
  }, [selectedStream]);

  // Fetch sports categories
  useEffect(() => {
    fetch('/api/sports/categories')
      .then(res => res.json())
      .then(data => {
        if (data.sports) {
          setSports([
            { id: 'all', name: 'All Sports', icon: '🏆' },
            { id: '4k', name: '4K Ultra HD', icon: '📺' },
            ...data.sports
          ]);
        }
      })
      .catch(() => {
        setSports([
          { id: 'all', name: 'All Sports', icon: '🏆' },
          { id: '4k', name: '4K Ultra HD', icon: '📺' },
          { id: 'football', name: 'Football', icon: '⚽' },
          { id: 'basketball', name: 'Basketball', icon: '🏀' },
          { id: 'cricket', name: 'Cricket', icon: '🏏' },
        ]);
      });
  }, []);

  // Fetch matches
  useEffect(() => {
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    params.set('type', activeTab);
    if (selectedSport !== 'all') params.set('sport', selectedSport);

    fetch(`/api/sports/matches?${params}`)
      .then(res => res.json())
      .then(data => {
        if (data.matches) {
          setMatches(data.matches);
        } else {
          setError('No matches found');
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load matches');
        setLoading(false);
      });
  }, [selectedSport, activeTab]);

  const loadStreams = async (match: Match) => {
    setLoadingStreams(true);
    setSelectedMatch(match);
    setSelectedStream(null);
    setStreams([]);

    try {
      const fetchPromises = match.sources.map(async (source) => {
        try {
          const res = await fetch(`/api/sports/streams?source=${source.source}&id=${source.id}`);
          if (!res.ok) return [];
          const data = await res.json();
          return data.streams || [];
        } catch (err) {
          console.error(`Error loading stream source ${source.source}:`, err);
          return [];
        }
      });

      const results = await Promise.all(fetchPromises);
      const allStreams = results.flat();

      if (allStreams.length > 0) {
        setStreams(allStreams);
        // Auto-select the first stream
        setSelectedStream(allStreams[0]);
      } else {
        setStreams([]);
      }
    } catch (err) {
      console.error('Failed to load streams:', err);
      setStreams([]);
    } finally {
      setLoadingStreams(false);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 0 && diffMins > -120) {
      return `Started ${Math.abs(diffMins)}m ago`;
    } else if (diffMins < 0) {
      return 'In Progress';
    } else if (diffMins < 60) {
      return `In ${diffMins}m`;
    } else if (diffHours < 24) {
      return `In ${diffHours}h ${diffMins % 60}m`;
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const getStreamTitle = (stream: Stream) => {
    let title = stream.language || `Feed ${stream.streamNo}`;
    
    // Check if the title already contains quality indicators
    const hasQuality = title.toLowerCase().includes('720p') ||
                       title.toLowerCase().includes('1080p') ||
                       title.toLowerCase().includes('fhd') ||
                       title.toLowerCase().includes('4k') ||
                       title.toLowerCase().includes('uhd') ||
                       title.toLowerCase().includes('hevc');
                       
    if (stream.hd && !hasQuality) {
      title += ' (HD)';
    }
    return title;
  };

  const getStreamSubtitle = (stream: Stream) => {
    const providerName = stream.source ? stream.source.toUpperCase() : 'UNKNOWN';
    return `${providerName} • Stream ${stream.streamNo}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black z-50 overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Full Screen Layout like Live TV */}
      <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-black to-neutral-950">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/95 via-black/80 to-transparent backdrop-blur-sm pt-[env(safe-area-inset-top)]">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('LiveSports: Closing via back button');
                    onClose();
                  }}
                  className="p-2 hover:bg-neutral-800 rounded-full transition"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="p-2 sm:p-3 bg-gradient-to-br from-red-600 to-red-700 rounded-xl sm:rounded-2xl shadow-lg shadow-red-900/30">
                    <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-3xl font-bold text-white">Live Sports</h1>
                    <p className="text-neutral-400 text-sm hidden sm:block">Free sports streaming</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
                className="p-2 hover:bg-neutral-800 rounded-full transition"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </div>

        <div className="pt-24 pb-10">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12">
            {/* Active Stream Player */}
            {selectedMatch && selectedStream && (
              <div className="mb-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Video Player - Takes 2/3 */}
                  <div className="lg:col-span-2">
                    <div className="relative bg-black rounded-2xl overflow-hidden border border-neutral-800/50 shadow-2xl shadow-black/50 aspect-video flex items-center justify-center">
                      {selectedStream.embedUrl.includes('embed') || 
                       selectedStream.embedUrl.includes('pages.dev') || 
                       selectedStream.embedUrl.includes('html') ? (
                        <iframe
                          key={selectedStream.id}
                          src={selectedStream.embedUrl}
                          className="w-full h-full border-0"
                          allowFullScreen
                          allow="autoplay; fullscreen; picture-in-picture"
                        />
                      ) : (
                        <video
                          ref={videoRef}
                          controls
                          autoPlay
                          className="w-full h-full object-contain bg-black"
                          playsInline
                        >
                          Your browser does not support the video tag.
                        </video>
                      )}
                      {/* Live indicator */}
                      {selectedMatch.isLive && (
                        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-600/90 backdrop-blur-sm rounded-full pointer-events-none">
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                          <span className="text-white text-sm font-medium">LIVE</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Now Playing Info Panel */}
                  <div className="lg:col-span-1">
                    <div className="bg-gradient-to-br from-neutral-900/90 to-neutral-950/90 backdrop-blur-xl rounded-2xl border border-neutral-800/50 p-6 h-full">
                      <p className="text-sm text-neutral-500 uppercase tracking-wider mb-4">Now Watching</p>

                      {/* Match Info */}
                      <div className="mb-6">
                        {selectedMatch.teams?.home && selectedMatch.teams?.away ? (
                          <div className="flex items-center justify-between mb-5 bg-neutral-950/40 border border-neutral-900/60 rounded-xl p-4">
                            <div className="flex flex-col items-center flex-1 min-w-0">
                              {selectedMatch.teams.home.badge ? (
                                <img
                                  src={`https://streamed.pk/api/images/${selectedMatch.teams.home.badge}`}
                                  alt={selectedMatch.teams.home.name}
                                  className="w-12 h-12 object-contain mb-2.5 transition hover:scale-105"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-2.5 text-neutral-400 text-lg font-bold">
                                  {selectedMatch.teams.home.name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <span className="text-xs text-neutral-300 text-center font-semibold truncate w-full">
                                {selectedMatch.teams.home.name}
                              </span>
                            </div>
                            <span className="text-sm font-bold text-neutral-600 px-3 shrink-0">VS</span>
                            <div className="flex flex-col items-center flex-1 min-w-0">
                              {selectedMatch.teams.away.badge ? (
                                <img
                                  src={`https://streamed.pk/api/images/${selectedMatch.teams.away.badge}`}
                                  alt={selectedMatch.teams.away.name}
                                  className="w-12 h-12 object-contain mb-2.5 transition hover:scale-105"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-2.5 text-neutral-400 text-lg font-bold">
                                  {selectedMatch.teams.away.name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <span className="text-xs text-neutral-300 text-center font-semibold truncate w-full">
                                {selectedMatch.teams.away.name}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <h2 className="text-lg font-bold text-white mb-4 leading-snug">{selectedMatch.title}</h2>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-neutral-400 text-xs font-semibold">
                            <Globe className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="capitalize">{selectedMatch.category}</span>
                          </div>
                          {selectedMatch.is4k && (
                            <span className="text-[10px] bg-purple-600/10 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20 font-semibold uppercase tracking-wider">
                              4K UHD
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stream Selection Dropdown */}
                      <div className="space-y-2 relative" ref={dropdownRef}>
                        <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Available Streams</p>
                        
                        {/* Custom Dropdown Trigger */}
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="w-full flex items-center justify-between p-3.5 bg-neutral-900/80 hover:bg-neutral-800/80 border border-neutral-800 rounded-xl text-neutral-200 transition-all focus:outline-none focus:ring-2 focus:ring-red-600/50 cursor-pointer shadow-inner"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Tv className="w-4 h-4 text-red-500 shrink-0" />
                            <div className="flex flex-col items-start min-w-0 text-left">
                              <span className="text-sm font-semibold truncate text-white leading-tight">
                                {selectedStream ? getStreamTitle(selectedStream) : 'Select a stream'}
                              </span>
                              {selectedStream && (
                                <span className="text-xs text-neutral-400 mt-0.5">
                                  {getStreamSubtitle(selectedStream)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Dropdown Menu */}
                        {isDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1.5 max-h-[280px] overflow-y-auto bg-neutral-900/98 backdrop-blur-xl border border-neutral-800 rounded-xl shadow-2xl z-50 py-1.5 custom-scrollbar divide-y divide-neutral-800/40">
                            {streams.map((stream, idx) => {
                              const isSelected = selectedStream?.id === stream.id;
                              return (
                                <button
                                  key={`${stream.id}-${idx}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedStream(stream);
                                    setIsDropdownOpen(false);
                                  }}
                                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all cursor-pointer ${
                                    isSelected 
                                      ? 'bg-red-950/20 text-red-400' 
                                      : 'hover:bg-neutral-800/70 text-neutral-300'
                                  }`}
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-semibold truncate">
                                      {getStreamTitle(stream)}
                                    </span>
                                    <span className="text-xs text-neutral-500 mt-0.5">
                                      {getStreamSubtitle(stream)}
                                    </span>
                                  </div>
                                  {isSelected && <Check className="w-4 h-4 text-red-500 shrink-0 ml-2" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Quality Selection */}
                      {qualities.length > 0 && (
                        <div className="space-y-2 mt-4">
                          <p className="text-xs text-neutral-500 uppercase tracking-wider">Stream Quality</p>
                          <div className="flex flex-wrap gap-2">
                            {qualities.map((q) => (
                              <button
                                key={q.index}
                                onClick={() => handleQualityChange(q.index)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                  currentQuality === q.index
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                }`}
                              >
                                {q.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Close Player */}
                      <button
                        onClick={() => {
                          setSelectedMatch(null);
                          setSelectedStream(null);
                          setStreams([]);
                          setQualities([]);
                          setCurrentQuality(-1);
                          setIsDropdownOpen(false);
                        }}
                        className="w-full mt-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer text-center"
                      >
                        Close Player
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs & Sport Filter */}
            <div className="mb-6 space-y-4">
              {/* Live/Today Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('live')}
                  className={`px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all ${activeTab === 'live'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                >
                  <Activity className="w-4 h-4" />
                  Live Now
                </button>
                <button
                  onClick={() => setActiveTab('today')}
                  className={`px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all ${activeTab === 'today'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                >
                  <Clock className="w-4 h-4" />
                  Today&apos;s Schedule
                </button>
              </div>

              {/* Sport Filter Pills */}
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                {sports.map(sport => (
                  <button
                    key={sport.id}
                    onClick={() => setSelectedSport(sport.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedSport === sport.id
                      ? 'bg-white text-black shadow-lg'
                      : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                      }`}
                  >
                    <span className="mr-1.5">{sport.icon}</span>
                    {sport.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Matches Grid */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
                <AlertCircle className="w-12 h-12 mb-4" />
                <p>{error}</p>
                <p className="text-sm mt-2">Try again later or check your connection</p>
              </div>
            ) : matches.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
                <Trophy className="w-12 h-12 mb-4" />
                <p>No {activeTab === 'live' ? 'live' : 'scheduled'} matches found</p>
                <p className="text-sm mt-2">Try selecting a different sport</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {matches.map(match => (
                  <div
                    key={match.id}
                    className={`bg-gradient-to-br from-neutral-900 to-neutral-950 backdrop-blur rounded-2xl overflow-hidden border transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-red-900/10 ${selectedMatch?.id === match.id
                      ? 'border-red-500 shadow-lg shadow-red-900/20 ring-1 ring-red-500/50'
                      : 'border-neutral-800/50 hover:border-red-500/30'
                      }`}
                  >
                    <div className="p-4">
                      {/* Status Badge */}
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${match.isLive
                          ? 'bg-red-600 text-white'
                          : 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                          }`}>
                          {match.isLive ? '🔴 LIVE' : formatTime(match.date)}
                        </span>
                        <div className="flex gap-1">
                          {match.is4k && (
                            <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-1 rounded-full border border-purple-600/30 font-semibold">
                              📺 4K
                            </span>
                          )}
                          {match.popular && (
                            <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded-full border border-yellow-600/30">
                              ⭐ Popular
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Teams */}
                      {match.teams?.home && match.teams?.away ? (
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex flex-col items-center flex-1">
                            {match.teams.home.badge && (
                              <img
                                src={`https://streamed.pk/api/images/${match.teams.home.badge}`}
                                alt={match.teams.home.name}
                                className="w-10 h-10 object-contain mb-1"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <span className="text-xs text-white text-center font-medium line-clamp-2">
                              {match.teams.home.name}
                            </span>
                          </div>
                          <span className="text-lg font-bold text-neutral-600 px-3">VS</span>
                          <div className="flex flex-col items-center flex-1">
                            {match.teams.away.badge && (
                              <img
                                src={`https://streamed.pk/api/images/${match.teams.away.badge}`}
                                alt={match.teams.away.name}
                                className="w-10 h-10 object-contain mb-1"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <span className="text-xs text-white text-center font-medium line-clamp-2">
                              {match.teams.away.name}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <h3 className="text-white font-semibold text-center mb-4 line-clamp-2">
                          {match.title}
                        </h3>
                      )}

                      {/* Category */}
                      <div className="flex items-center justify-center gap-1 text-xs text-neutral-500 mb-3 capitalize">
                        <Globe className="w-3 h-3" />
                        {match.category}
                      </div>

                      {/* Available Sources Badges */}
                      <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
                        {match.sources.map((source, idx) => {
                          const displaySource = source.source.toUpperCase();
                          return (
                            <span
                              key={idx}
                              className="text-[10px] font-semibold bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded border border-neutral-700/50"
                            >
                              {displaySource}
                            </span>
                          );
                        })}
                      </div>

                      {/* Watch Button */}
                      <button
                        onClick={() => loadStreams(match)}
                        disabled={loadingStreams && selectedMatch?.id === match.id}
                        className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 disabled:from-neutral-700 disabled:to-neutral-700 text-white text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-red-900/20"
                      >
                        {loadingStreams && selectedMatch?.id === match.id ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        Watch Match
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div >
  );
}
