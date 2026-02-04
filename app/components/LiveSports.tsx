'use client';

import { useState, useEffect } from 'react';
import { Trophy, Play, X, Activity, Clock, Globe, AlertCircle, ChevronLeft } from 'lucide-react';

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

  // Fetch sports categories
  useEffect(() => {
    fetch('/api/sports/categories')
      .then(res => res.json())
      .then(data => {
        if (data.sports) {
          setSports([{ id: 'all', name: 'All Sports', icon: '🏆' }, ...data.sports]);
        }
      })
      .catch(() => {
        setSports([
          { id: 'all', name: 'All Sports', icon: '🏆' },
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

  const loadStreams = async (match: Match, source: StreamSource) => {
    setLoadingStreams(true);
    setSelectedMatch(match);
    setSelectedStream(null);

    try {
      const res = await fetch(`/api/sports/streams?source=${source.source}&id=${source.id}`);
      const data = await res.json();

      if (data.streams && data.streams.length > 0) {
        setStreams(data.streams);
        // Auto-select first stream
        setSelectedStream(data.streams[0]);
      } else {
        setStreams([]);
      }
    } catch {
      setStreams([]);
    }
    setLoadingStreams(false);
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
                    <div className="relative bg-black rounded-2xl overflow-hidden border border-neutral-800/50 shadow-2xl shadow-black/50 aspect-video">
                      <iframe
                        key={selectedStream.id}
                        src={selectedStream.embedUrl}
                        className="w-full h-full"
                        allowFullScreen
                        allow="autoplay; fullscreen; picture-in-picture"
                        sandbox="allow-scripts allow-same-origin allow-presentation"
                        referrerPolicy="no-referrer"
                      />
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
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex flex-col items-center flex-1">
                              {selectedMatch.teams.home.badge && (
                                <img
                                  src={`https://streamed.pk/api/images/${selectedMatch.teams.home.badge}`}
                                  alt={selectedMatch.teams.home.name}
                                  className="w-14 h-14 object-contain mb-2"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              )}
                              <span className="text-sm text-white text-center font-medium">
                                {selectedMatch.teams.home.name}
                              </span>
                            </div>
                            <span className="text-2xl font-bold text-neutral-500 px-4">VS</span>
                            <div className="flex flex-col items-center flex-1">
                              {selectedMatch.teams.away.badge && (
                                <img
                                  src={`https://streamed.pk/api/images/${selectedMatch.teams.away.badge}`}
                                  alt={selectedMatch.teams.away.name}
                                  className="w-14 h-14 object-contain mb-2"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              )}
                              <span className="text-sm text-white text-center font-medium">
                                {selectedMatch.teams.away.name}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <h2 className="text-xl font-bold text-white mb-4">{selectedMatch.title}</h2>
                        )}
                        <div className="flex items-center gap-2 text-neutral-400 text-sm mb-2">
                          <Globe className="w-4 h-4" />
                          <span className="capitalize">{selectedMatch.category}</span>
                        </div>
                      </div>

                      {/* Stream Selection */}
                      <div className="space-y-2">
                        <p className="text-xs text-neutral-500 uppercase tracking-wider">Available Streams</p>
                        <div className="grid grid-cols-2 gap-2">
                          {streams.map((stream, idx) => (
                            <button
                              key={`${stream.id}-${idx}`}
                              onClick={() => setSelectedStream(stream)}
                              className={`p-3 rounded-xl text-sm font-medium transition-all ${selectedStream?.id === stream.id
                                ? 'bg-red-600 text-white'
                                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                <Play className="w-4 h-4" />
                                Stream {stream.streamNo}
                              </div>
                              <div className="text-xs mt-1 opacity-75">
                                {stream.language} {stream.hd && '• HD'}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Close Player */}
                      <button
                        onClick={() => {
                          setSelectedMatch(null);
                          setSelectedStream(null);
                          setStreams([]);
                        }}
                        className="w-full mt-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-sm font-medium transition"
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
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${match.isLive
                          ? 'bg-red-600 text-white'
                          : 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                          }`}>
                          {match.isLive ? '🔴 LIVE' : formatTime(match.date)}
                        </span>
                        {match.popular && (
                          <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-1 rounded-full border border-yellow-600/30">
                            ⭐ Popular
                          </span>
                        )}
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

                      {/* Watch Buttons */}
                      <div className="flex flex-wrap gap-2">
                        {match.sources.slice(0, 2).map((source, idx) => (
                          <button
                            key={idx}
                            onClick={() => loadStreams(match, source)}
                            disabled={loadingStreams && selectedMatch?.id === match.id}
                            className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 disabled:from-neutral-700 disabled:to-neutral-700 text-white text-xs font-semibold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-red-900/20"
                          >
                            {loadingStreams && selectedMatch?.id === match.id ? (
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            {source.source.toUpperCase()}
                          </button>
                        ))}
                      </div>
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
