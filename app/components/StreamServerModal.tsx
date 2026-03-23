'use client';

import { useState, useEffect } from 'react';
import { X, Globe, Loader2, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';

type StreamServer = {
  name: string;
  url: string;
  color: string;
};

type Props = {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  season?: number;
  episode?: number;
  onClose: () => void;
};

export default function StreamServerModal({ tmdbId, type, title, season, episode, onClose }: Props) {
  const [servers, setServers] = useState<StreamServer[]>([]);
  const [activeServer, setActiveServer] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const params = new URLSearchParams({
          tmdbId: tmdbId.toString(),
          type,
          ...(season && { season: season.toString() }),
          ...(episode && { episode: episode.toString() }),
        });
        const res = await fetch(`/api/stream-servers?${params}`);
        const data = await res.json();
        if (data.servers) {
          setServers(data.servers);
        }
      } catch (e) {
        console.error('Failed to fetch servers:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchServers();
  }, [tmdbId, type, season, episode]);

  const handleServerChange = (index: number) => {
    setActiveServer(index);
    setIframeLoading(true);
    setIframeError(false);
  };

  const handleIframeLoad = () => {
    setIframeLoading(false);
  };

  const currentServer = servers[activeServer];

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-neutral-900/95 backdrop-blur-xl border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Globe className="w-5 h-5 text-blue-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">{title}</h2>
            {type === 'tv' && season && episode && (
              <p className="text-xs text-neutral-400">
                Season {season} · Episode {episode}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentServer && (
            <a
              href={currentServer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-neutral-800 rounded-full transition text-neutral-400 hover:text-white"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-800 rounded-full transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Server Tabs */}
      {!loading && servers.length > 0 && (
        <div className="px-4 py-2.5 bg-neutral-900/80 backdrop-blur border-b border-neutral-800 shrink-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-700 pb-1">
            {servers.map((server, i) => (
              <button
                key={i}
                onClick={() => handleServerChange(i)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  activeServer === i
                    ? 'text-white shadow-lg scale-105'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                }`}
                style={activeServer === i ? {
                  backgroundColor: server.color,
                  boxShadow: `0 0 20px ${server.color}40`,
                } : {}}
              >
                {server.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Player Area */}
      <div className="flex-1 relative bg-black">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-400 mx-auto mb-3" />
              <p className="text-neutral-400 text-sm">Loading stream servers...</p>
            </div>
          </div>
        ) : servers.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-6">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-lg font-semibold mb-2">No servers available</p>
              <p className="text-neutral-400 text-sm">Could not load streaming servers. Try again later.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Loading Overlay */}
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-black">
                <div className="text-center">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 border-4 border-neutral-800 rounded-full" />
                    <div
                      className="absolute inset-0 border-4 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: `${currentServer?.color || '#3b82f6'} transparent transparent transparent` }}
                    />
                  </div>
                  <p className="text-neutral-300 font-medium">{currentServer?.name}</p>
                  <p className="text-neutral-500 text-sm mt-1">Connecting to server...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {iframeError && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/90">
                <div className="text-center p-6">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-lg font-semibold mb-2">Server unavailable</p>
                  <p className="text-neutral-400 text-sm mb-4">This server might be down. Try a different one.</p>
                  <button
                    onClick={() => {
                      setIframeError(false);
                      setIframeLoading(true);
                    }}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm flex items-center gap-2 mx-auto transition"
                  >
                    <RefreshCw className="w-4 h-4" /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* Iframe */}
            <iframe
              key={`${activeServer}-${currentServer?.url}`}
              src={currentServer?.url}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="origin"
              onLoad={handleIframeLoad}
              onError={() => {
                setIframeLoading(false);
                setIframeError(true);
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            />
          </>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-800 text-center text-xs text-neutral-500 shrink-0">
        Not working? Try switching servers above · Streams provided by third-party services
      </div>
    </div>
  );
}
