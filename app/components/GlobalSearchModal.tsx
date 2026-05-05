'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, Film, Tv, Play, Globe, Loader2, Star, History, Magnet, Download, Folder, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '../hooks/useToast';

type LocalResult = {
  id: number;
  type: 'movie' | 'show';
  title: string;
  posterPath: string | null;
  year?: number;
  firstAirDate?: string;
  rating: number | null;
  imdbRating?: number | null;
  filePath?: string;
};

type OnlineResult = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  year: string | null;
  rating: number | null;
  popularity: number;
};

type TorrentResult = {
  title: string;
  magnet: string;
  size: string;
  sizeBytes: number;
  seeds: number;
  leeches: number;
  quality: string;
  source: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onPlay: (filePath: string) => void;
  onOpenShow: (show: any) => void;
  onOpenOnline: (item: any) => void;
  onSwitchToTorrents?: (query: string) => void;
};

export default function GlobalSearchModal({ isOpen, onClose, onPlay, onOpenShow, onOpenOnline, onSwitchToTorrents }: Props) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'local' | 'online' | 'torrents'>('local');
  
  const [localResults, setLocalResults] = useState<LocalResult[]>([]);
  const [onlineResults, setOnlineResults] = useState<OnlineResult[]>([]);
  const [torrentResults, setTorrentResults] = useState<TorrentResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [loadingTorrents, setLoadingTorrents] = useState(false);
  
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { showToast } = useToast();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const torrentAbortRef = useRef<AbortController | null>(null);

  // Load recent searches
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('lflix_recent_searches');
        if (saved) setRecentSearches(JSON.parse(saved));
      } catch (e) { /* ignore */ }
    }
  }, []);

  const saveRecentSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem('lflix_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const removeRecentSearch = (e: React.MouseEvent, q: string) => {
    e.stopPropagation();
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== q);
      localStorage.setItem('lflix_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const searchLocalAndOnline = useCallback(async (searchQuery: string, signal: AbortSignal) => {
    if (searchQuery.length < 2) {
      setLocalResults([]);
      setOnlineResults([]);
      return;
    }

    // Local
    setLoadingLocal(true);
    fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, { signal })
      .then(res => res.json())
      .then(data => setLocalResults(Array.isArray(data) ? data : []))
      .catch(e => { if (e.name !== 'AbortError') setLocalResults([]); })
      .finally(() => setLoadingLocal(false));

    // Online
    setLoadingOnline(true);
    fetch(`/api/tmdb-search?q=${encodeURIComponent(searchQuery)}&type=multi`, { signal })
      .then(res => res.json())
      .then(data => setOnlineResults((data.results || []).slice(0, 8)))
      .catch(e => { if (e.name !== 'AbortError') setOnlineResults([]); })
      .finally(() => setLoadingOnline(false));
  }, []);

  const searchTorrents = useCallback(async (searchQuery: string, signal: AbortSignal) => {
    if (searchQuery.length < 2) {
      setTorrentResults([]);
      return;
    }
    
    setLoadingTorrents(true);
    try {
      const res = await fetch(`/api/torrent-search?q=${encodeURIComponent(searchQuery)}`, { signal });
      const data = await res.json();
      setTorrentResults(data.results || []);
    } catch (e: any) {
      if (e.name !== 'AbortError') setTorrentResults([]);
    } finally {
      setLoadingTorrents(false);
    }
  }, []);

  // Debounce main query input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    if (query.trim().length >= 2) {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      
      debounceRef.current = setTimeout(() => {
        searchLocalAndOnline(query, controller.signal);
        
        // If torrents tab is active, auto-search it immediately
        if (activeTab === 'torrents') {
          if (torrentAbortRef.current) torrentAbortRef.current.abort();
          const torrentController = new AbortController();
          torrentAbortRef.current = torrentController;
          searchTorrents(query, torrentController.signal);
        }
      }, 400);
    } else {
      setLocalResults([]);
      setOnlineResults([]);
      setTorrentResults([]);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (searchAbortRef.current) searchAbortRef.current.abort();
    };
  }, [query, activeTab, searchLocalAndOnline, searchTorrents]);

  // Handle Tab Switch -> Trigger torrent search lazily
  useEffect(() => {
    if (activeTab === 'torrents' && query.trim().length >= 2 && torrentResults.length === 0 && !loadingTorrents) {
      if (torrentAbortRef.current) torrentAbortRef.current.abort();
      const controller = new AbortController();
      torrentAbortRef.current = controller;
      searchTorrents(query, controller.signal);
    }
  }, [activeTab]);

  // Handle Keydown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    const currentList = activeTab === 'local' ? localResults : activeTab === 'online' ? onlineResults : torrentResults;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, currentList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      
      if (query.trim().length > 0) {
        saveRecentSearch(query);
      }

      if (currentList[selectedIndex]) {
        if (activeTab === 'local') handleSelectLocal(currentList[selectedIndex] as LocalResult);
        else if (activeTab === 'online') handleSelectOnline(currentList[selectedIndex] as OnlineResult);
        else if (activeTab === 'torrents' && onSwitchToTorrents) {
          // Pass the query over to the Torrent search page
          onSwitchToTorrents(query);
          onClose();
        }
      } else if (query.trim().length >= 2 && activeTab === 'torrents' && onSwitchToTorrents) {
        // Just search the text
        onSwitchToTorrents(query);
        onClose();
      }
    }
  };

  // Reset selection on tab or query change
  useEffect(() => { setSelectedIndex(0); }, [activeTab, query]);

  const handleSelectLocal = (item: LocalResult) => {
    saveRecentSearch(query);
    if (item.type === 'movie' && item.filePath) onPlay(item.filePath);
    else onOpenShow(item);
    onClose();
  };

  const handleSelectOnline = (item: OnlineResult) => {
    saveRecentSearch(query);
    onOpenOnline(item);
    onClose();
  };

  const currentList = activeTab === 'local' ? localResults : activeTab === 'online' ? onlineResults : torrentResults;
  const isLoading = activeTab === 'local' ? loadingLocal : activeTab === 'online' ? loadingOnline : loadingTorrents;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-start pt-[10vh] bg-black/60 backdrop-blur-md">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-[#111111] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search header area */}
        <div className="flex items-center p-4 border-b border-neutral-800 bg-[#151515]">
          <Search className="w-6 h-6 text-neutral-500 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search movies, TV shows, or actors..."
            className="flex-1 bg-transparent border-none outline-none text-xl text-white placeholder-neutral-600"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="p-1 hover:bg-white/10 rounded-full transition text-neutral-400 mr-2"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 rounded-lg transition font-medium">
            ESC
          </button>
        </div>

        {/* Tabs */}
        {query.trim().length >= 2 && (
          <div className="flex px-4 py-2 bg-[#1a1a1a] border-b border-neutral-800/50 gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('local')}
              className={clsx(
                "px-4 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-2 whitespace-nowrap",
                activeTab === 'local' ? "bg-white text-black" : "text-neutral-400 hover:bg-white/10"
              )}
            >
              <Film className="w-4 h-4" /> My Library {localResults.length > 0 && <span className="opacity-60 text-xs">({localResults.length})</span>}
            </button>
            <button
              onClick={() => setActiveTab('online')}
              className={clsx(
                "px-4 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-2 whitespace-nowrap",
                activeTab === 'online' ? "bg-white text-black" : "text-neutral-400 hover:bg-white/10"
              )}
            >
              <Globe className="w-4 h-4" /> TMDB {onlineResults.length > 0 && <span className="opacity-60 text-xs">({onlineResults.length})</span>}
            </button>
            <button
              onClick={() => setActiveTab('torrents')}
              className={clsx(
                "px-4 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-2 whitespace-nowrap",
                activeTab === 'torrents' ? "bg-white text-black" : "text-neutral-400 hover:bg-white/10"
              )}
            >
              <Magnet className="w-4 h-4" /> Torrents {torrentResults.length > 0 && <span className="opacity-60 text-xs">({torrentResults.length})</span>}
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-2 min-h-[300px]">
          {/* Initial State (Recent Searches) */}
          {query.trim().length < 2 && (
            <div className="p-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-3 px-2">Recent Searches</h3>
              {recentSearches.length > 0 ? (
                <div className="space-y-1">
                  {recentSearches.map((s, i) => (
                    <div
                      key={i}
                      onClick={() => { setQuery(s); inputRef.current?.focus(); }}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 cursor-pointer text-neutral-300 group transition"
                    >
                      <div className="flex items-center gap-3">
                        <History className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition" />
                        <span>{s}</span>
                      </div>
                      <button 
                        onClick={(e) => removeRecentSearch(e, s)}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition text-neutral-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-600 px-2 py-4">No recent searches</p>
              )}
            </div>
          )}

          {/* Loading State */}
          {query.trim().length >= 2 && isLoading && (
            <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
              <Loader2 className="w-6 h-6 animate-spin mb-3" />
              <p className="text-sm">Searching {activeTab}...</p>
            </div>
          )}

          {/* Results State */}
          {query.trim().length >= 2 && !isLoading && currentList.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
              <Search className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm">No results found in {activeTab}</p>
            </div>
          )}

          {/* Results List */}
          {query.trim().length >= 2 && !isLoading && currentList.length > 0 && (
            <div className="space-y-1 p-1">
              {activeTab === 'local' && localResults.map((item, index) => (
                <div
                  key={`local-${item.type}-${item.id}`}
                  onClick={() => handleSelectLocal(item)}
                  className={clsx(
                    "flex items-center gap-4 p-2.5 rounded-xl cursor-pointer transition",
                    index === selectedIndex ? "bg-white/10" : "hover:bg-white/5"
                  )}
                >
                  {item.posterPath ? (
                    <img src={`https://image.tmdb.org/t/p/w92${item.posterPath}`} alt={item.title} className="w-12 h-16 object-cover rounded-md flex-shrink-0 bg-neutral-900" />
                  ) : (
                    <div className="w-12 h-16 bg-neutral-800 rounded-md flex items-center justify-center flex-shrink-0">
                      {item.type === 'movie' ? <Film className="w-5 h-5 text-neutral-600" /> : <Tv className="w-5 h-5 text-neutral-600" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-white text-base truncate">{item.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1">
                      <span className="px-1.5 py-0.5 bg-neutral-800 rounded uppercase font-medium text-[10px]">{item.type}</span>
                      <span>{item.year || (item.firstAirDate?.substring(0, 4) || 'N/A')}</span>
                    </div>
                  </div>
                  <Play className="w-5 h-5 text-neutral-500 mr-2" />
                </div>
              ))}

              {activeTab === 'online' && onlineResults.map((item, index) => (
                <div
                  key={`online-${item.mediaType}-${item.tmdbId}`}
                  onClick={() => handleSelectOnline(item)}
                  className={clsx(
                    "flex items-center gap-4 p-2.5 rounded-xl cursor-pointer transition",
                    index === selectedIndex ? "bg-white/10" : "hover:bg-white/5"
                  )}
                >
                  {item.posterPath ? (
                    <img src={`https://image.tmdb.org/t/p/w92${item.posterPath}`} alt={item.title} className="w-12 h-16 object-cover rounded-md flex-shrink-0 bg-neutral-900" />
                  ) : (
                    <div className="w-12 h-16 bg-neutral-800 rounded-md flex items-center justify-center flex-shrink-0">
                      <Globe className="w-5 h-5 text-neutral-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-white text-base truncate">{item.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1">
                      <span className="px-1.5 py-0.5 bg-neutral-800 rounded uppercase font-medium text-[10px]">{item.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
                      <span>{item.year || 'N/A'}</span>
                      {item.rating != null && item.rating > 0 && (
                        <span className="flex items-center gap-0.5 text-yellow-500/90 font-medium">
                          <Star className="w-3 h-3 fill-yellow-500/90" /> {item.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Globe className="w-5 h-5 text-neutral-500 mr-2" />
                </div>
              ))}

              {activeTab === 'torrents' && (
                <>
                  {onSwitchToTorrents && (
                    <button 
                      onClick={() => {
                        saveRecentSearch(query);
                        onSwitchToTorrents(query);
                        onClose();
                      }}
                      className="w-full mb-3 flex items-center justify-center gap-2 py-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-xl transition font-medium text-sm border border-blue-500/30"
                    >
                      Search "{query}" in Torrents Explorer <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                  
                  {torrentResults.slice(0, 8).map((item, index) => (
                    <div
                      key={`torrent-${index}`}
                      className={clsx(
                        "flex items-center gap-3 p-3 rounded-xl cursor-default transition border border-transparent",
                        index === selectedIndex ? "bg-white/10 border-white/10" : "hover:bg-white/5"
                      )}
                    >
                      <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Magnet className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-neutral-200 text-sm truncate" title={item.title}>{item.title}</h4>
                        <div className="flex items-center flex-wrap gap-2 text-[10px] text-neutral-400 mt-1.5">
                          <span className="font-medium text-neutral-300 bg-neutral-800 px-1.5 rounded">{item.size}</span>
                          <span className="text-green-400">↑ {item.seeds}</span>
                          <span className="text-red-400">↓ {item.leeches}</span>
                          {item.quality && <span className="bg-purple-500/20 text-purple-300 px-1.5 rounded border border-purple-500/30">{item.quality}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {torrentResults.length > 8 && onSwitchToTorrents && (
                    <div className="text-center pt-2 pb-4">
                      <button 
                        onClick={() => {
                          saveRecentSearch(query);
                          onSwitchToTorrents(query);
                          onClose();
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                      >
                        View {torrentResults.length - 8} more results...
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="bg-[#111] p-3 border-t border-neutral-800 text-[10px] text-neutral-500 flex justify-between items-center">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><kbd className="bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700 font-mono text-[9px]">↑</kbd> <kbd className="bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700 font-mono text-[9px]">↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700 font-mono text-[9px]">Enter</kbd> Select</span>
            <span className="flex items-center gap-1"><kbd className="bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700 font-mono text-[9px]">Esc</kbd> Close</span>
          </div>
          <div>LFLIX Search Engine</div>
        </div>
      </div>
    </div>
  );
}
