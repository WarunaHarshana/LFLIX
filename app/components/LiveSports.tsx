'use client';

import { useState, useEffect } from 'react';
import { Trophy, Play, X, Activity, Clock, Globe, MonitorPlay, AlertCircle } from 'lucide-react';

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
        // Use defaults if API fails
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
      .catch(err => {
        setError('Failed to load matches');
        setLoading(false);
      });
  }, [selectedSport, activeTab]);

  const loadStreams = async (match: Match, source: StreamSource) => {
    setLoadingStreams(true);
    setSelectedMatch(match);

    try {
      const res = await fetch(`/api/sports/streams?source=${source.source}&id=${source.id}`);
      const data = await res.json();
      
      if (data.streams) {
        setStreams(data.streams);
      } else {
        setStreams([]);
      }
    } catch (err) {
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
      return `LIVE • Started ${Math.abs(diffMins)}m ago`;
    } else if (diffMins < 0) {
      return 'LIVE';
    } else if (diffMins < 60) {
      return `Starts in ${diffMins}m`;
    } else if (diffHours < 24) {
      return `Starts in ${diffHours}h ${diffMins % 60}m`;
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 p-4 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <div>
              <h2 className="text-xl font-bold text-white">Live Sports</h2>
              <p className="text-sm text-gray-400">Free sports streaming • powered by Streamed.pk</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs & Sport Filter */}
        <div className="bg-gray-800/50 p-4 border-b border-gray-700 space-y-3">
          {/* Live/Today Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('live')}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'live'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <Activity className="w-4 h-4" />
              Live Now
            </button>
            <button
              onClick={() => setActiveTab('today')}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'today'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <Clock className="w-4 h-4" />
              Today&apos;s Schedule
            </button>
          </div>

          {/* Sport Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {sports.map(sport => (
              <button
                key={sport.id}
                onClick={() => setSelectedSport(sport.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedSport === sport.id
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <span className="mr-1">{sport.icon}</span>
                {sport.name}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <AlertCircle className="w-12 h-12 mb-4" />
              <p>{error}</p>
              <p className="text-sm mt-2">Try again later or check your connection</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Trophy className="w-12 h-12 mb-4" />
              <p>No {activeTab === 'live' ? 'live' : 'scheduled'} matches found</p>
              <p className="text-sm mt-2">Try selecting a different sport</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {matches.map(match => (
                <div
                  key={match.id}
                  className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors group"
                >
                  {/* Match Header */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        match.isLive 
                          ? 'bg-red-600 text-white animate-pulse' 
                          : 'bg-blue-600 text-white'
                      }`}>
                        {match.isLive ? '🔴 LIVE' : '⏳ UPCOMING'}
                      </span>
                      {match.popular && (
                        <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded">
                          ⭐ POPULAR
                        </span>
                      )}
                    </div>

                    {/* Teams */}
                    {match.teams?.home && match.teams?.away ? (
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex flex-col items-center flex-1">
                          {match.teams.home.badge && (
                            <img 
                              src={`https://streamed.pk/api/images/${match.teams.home.badge}`}
                              alt={match.teams.home.name}
                              className="w-12 h-12 object-contain mb-2"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                          <span className="text-sm text-white text-center font-medium">
                            {match.teams.home.name}
                          </span>
                        </div>
                        <div className="px-4">
                          <span className="text-2xl font-bold text-gray-500">VS</span>
                        </div>
                        <div className="flex flex-col items-center flex-1">
                          {match.teams.away.badge && (
                            <img 
                              src={`https://streamed.pk/api/images/${match.teams.away.badge}`}
                              alt={match.teams.away.name}
                              className="w-12 h-12 object-contain mb-2"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                          <span className="text-sm text-white text-center font-medium">
                            {match.teams.away.name}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <h3 className="text-white font-semibold text-center mb-3">
                        {match.title}
                      </h3>
                    )}

                    {/* Time & Category */}
                    <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatTime(match.date)}
                      </span>
                      <span className="flex items-center gap-1 capitalize">
                        <Globe className="w-4 h-4" />
                        {match.category}
                      </span>
                    </div>

                    {/* Stream Sources */}
                    <div className="flex flex-wrap gap-2">
                      {match.sources.map((source, idx) => (
                        <button
                          key={idx}
                          onClick={() => loadStreams(match, source)}
                          className="flex-1 min-w-[80px] bg-green-600 hover:bg-green-500 text-white text-xs font-medium py-2 px-3 rounded flex items-center justify-center gap-1 transition-colors"
                        >
                          <Play className="w-3 h-3" />
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

        {/* Stream Player Modal */}
        {selectedMatch && (
          <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl w-full max-w-4xl overflow-hidden">
              {/* Player Header */}
              <div className="bg-gray-800 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MonitorPlay className="w-5 h-5 text-green-500" />
                  <div>
                    <h3 className="text-white font-semibold">{selectedMatch.title}</h3>
                    <p className="text-sm text-gray-400">Select a stream to watch</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedMatch(null);
                    setStreams([]);
                  }}
                  className="p-2 hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Stream Selection */}
              <div className="p-4">
                {loadingStreams ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
                  </div>
                ) : streams.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                    <p>No streams available for this match</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {streams.map(stream => (
                      <a
                        key={stream.id}
                        href={stream.embedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-gray-800 hover:bg-gray-700 p-4 rounded-lg text-center transition-colors group"
                      >
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Play className="w-5 h-5 text-green-500 group-hover:text-green-400" />
                          <span className="text-white font-medium">Stream {stream.streamNo}</span>
                        </div>
                        <div className="text-sm text-gray-400">
                          <span className="text-gray-300">{stream.language}</span>
                          {stream.hd && (
                            <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded">
                              HD
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 capitalize">
                          Source: {stream.source}
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {/* Disclaimer */}
                <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 text-sm text-yellow-200">
                  <p className="font-medium mb-1">⚠️ External Streams</p>
                  <p className="text-yellow-300/80">
                    These streams are provided by third-party sources. Quality and availability may vary. 
                    Clicking a stream will open it in a new tab.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
