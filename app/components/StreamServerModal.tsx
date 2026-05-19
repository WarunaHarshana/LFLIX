'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Globe, Loader2, AlertTriangle, RefreshCw, ExternalLink, SkipForward, ShieldCheck } from 'lucide-react';

type StreamServer = {
  id: string;
  name: string;
  url: string;
  color: string;
  order: number;
  isReachable: boolean;
  availabilityState: 'reachable' | 'blocked' | 'unreachable';
  probeError: string | null;
  probeCheckedAt: string;
  qualityHint: '2160p' | '1080p' | '720p' | 'unknown';
  confidence: number;
  probeState: 'cached' | 'fast' | 'deep-pending';
  lastCheckedAt: string | null;
  latencyMs: number;
};

const AUTO_FAILOVER_TIMEOUT_MS = 15000;
const VPN_AUTO_FAILOVER_TIMEOUT_MS = 35000;
const IFRAME_BOOTSTRAP_MS = 2500;
const PLAYBACK_GRACE_MS = 18000;
const VPN_PLAYBACK_GRACE_MS = 55000;
const QUALITY_RANK: Record<StreamServer['qualityHint'], number> = {
  unknown: 0,
  '720p': 1,
  '1080p': 2,
  '2160p': 3,
};

function rankServersByQuality(servers: StreamServer[]): StreamServer[] {
  return [...servers].sort((a, b) => {
    const rankDiff = QUALITY_RANK[b.qualityHint] - QUALITY_RANK[a.qualityHint];
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const reachableDiff = Number(b.isReachable) - Number(a.isReachable);
    if (reachableDiff !== 0) {
      return reachableDiff;
    }

    const latencyA = Number.isFinite(a.latencyMs) ? a.latencyMs : Number.MAX_SAFE_INTEGER;
    const latencyB = Number.isFinite(b.latencyMs) ? b.latencyMs : Number.MAX_SAFE_INTEGER;
    if (latencyA !== latencyB) {
      return latencyA - latencyB;
    }

    if (Math.abs(b.confidence - a.confidence) > 0.01) {
      return b.confidence - a.confidence;
    }

    return a.order - b.order;
  });
}

function getServerLabel(index: number): string {
  return `Server ${index + 1}`;
}

function getAvailabilityBadge(server: StreamServer): {
  text: string;
  className: string;
} {
  if (server.availabilityState === 'reachable') {
    return { text: 'Reachable', className: 'text-emerald-300 bg-emerald-500/15' };
  }
  if (server.availabilityState === 'blocked') {
    return { text: 'Probe Blocked', className: 'text-amber-300 bg-amber-500/15' };
  }
  return { text: 'Unreachable', className: 'text-rose-300 bg-rose-500/15' };
}

function formatProbeStatus(server: StreamServer | undefined, autoSwitching: boolean, vpnMode: boolean): string {
  if (!server) {
    return 'Searching for best stream...';
  }

  if (vpnMode && !autoSwitching) {
    return 'VPN mode: giving this server extra time...';
  }

  if (vpnMode && autoSwitching) {
    return 'VPN route is slow, trying another source...';
  }

  if (!autoSwitching) {
    if (server.qualityHint === '2160p') {
      return 'Connecting to 4K stream...';
    }
    return 'Searching for best stream...';
  }

  if (server.qualityHint === '1080p') {
    return '4K unavailable, switching to 1080p...';
  }
  if (server.qualityHint === '720p') {
    return 'Higher quality not found, trying 720p...';
  }

  return 'Trying remaining servers...';
}

function getNetworkHint(server: StreamServer | undefined): string | null {
  if (!server || !Number.isFinite(server.latencyMs)) {
    return null;
  }

  if (server.latencyMs >= 2500) {
    return `Slow network/VPN route detected (${server.latencyMs}ms)`;
  }

  if (server.latencyMs >= 1600) {
    return `High latency route (${server.latencyMs}ms)`;
  }

  return null;
}

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
  const [attemptedServers, setAttemptedServers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [autoSwitching, setAutoSwitching] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [iframeBootstrapped, setIframeBootstrapped] = useState(false);
  const [playbackReady, setPlaybackReady] = useState(false);
  const [vpnMode, setVpnMode] = useState(false);
  const attemptedServersRef = useRef<number[]>([0]);

  useEffect(() => {
    attemptedServersRef.current = attemptedServers;
  }, [attemptedServers]);

  const fetchServers = useCallback(async (options: { refresh?: boolean; showLoading?: boolean } = {}) => {
    if (options.showLoading !== false) {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams({
        tmdbId: tmdbId.toString(),
        type,
        ...(season && { season: season.toString() }),
        ...(episode && { episode: episode.toString() }),
        ...(vpnMode && { vpn: '1' }),
        ...((options.refresh || vpnMode) && { refresh: '1' }),
      });
      const res = await fetch(`/api/stream-servers?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.servers) {
        const rankedServers = rankServersByQuality(data.servers as StreamServer[]);
        const bestServerIndex = typeof data.bestServerIndex === 'number' ? data.bestServerIndex : 0;
        const firstIndex = rankedServers.length > 0 ? Math.max(0, Math.min(bestServerIndex, rankedServers.length - 1)) : -1;

        setServers(rankedServers);
        setActiveServer(Math.max(firstIndex, 0));
        const initialAttempted = firstIndex >= 0 ? [firstIndex] : [];
        setAttemptedServers(initialAttempted);
        attemptedServersRef.current = initialAttempted;
        setIframeError(false);
        setIframeLoading(rankedServers.length > 0);
        setAutoSwitching(false);
        setShowSources(vpnMode);
        setIframeBootstrapped(false);
        setPlaybackReady(false);
      }
    } catch (e) {
      console.error('Failed to fetch servers:', e);
    } finally {
      setLoading(false);
    }
  }, [tmdbId, type, season, episode, vpnMode]);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  const handleServerChange = (index: number) => {
    setActiveServer(index);
    setIframeLoading(true);
    setIframeError(false);
    setIframeBootstrapped(false);
    setPlaybackReady(false);
    setShowSources(true);
    setAttemptedServers([index]);
    attemptedServersRef.current = [index];
    setAutoSwitching(false);
  };

  const findNextServerIndex = (currentIndex: number) => {
    if (servers.length <= 1) {
      return -1;
    }

    const attempted = attemptedServersRef.current;
    for (let step = 1; step < servers.length; step += 1) {
      const candidate = (currentIndex + step) % servers.length;
      if (!attempted.includes(candidate) && servers[candidate]?.isReachable) {
        return candidate;
      }
    }

    for (let step = 1; step < servers.length; step += 1) {
      const candidate = (currentIndex + step) % servers.length;
      if (!attempted.includes(candidate)) {
        return candidate;
      }
    }

    return -1;
  };

  const tryNextServer = (fromIndex: number, mode: 'auto' | 'manual' = 'auto') => {
    const nextServerIndex = findNextServerIndex(fromIndex);
    if (nextServerIndex === -1) {
      return false;
    }

    setAttemptedServers((prev) =>
      prev.includes(nextServerIndex) ? prev : [...prev, nextServerIndex]
    );
    attemptedServersRef.current = attemptedServersRef.current.includes(nextServerIndex)
      ? attemptedServersRef.current
      : [...attemptedServersRef.current, nextServerIndex];
    setActiveServer(nextServerIndex);
    setIframeLoading(true);
    setIframeError(false);
    setIframeBootstrapped(false);
    setPlaybackReady(false);
    setShowSources((prev) => prev || mode === 'auto');
    setAutoSwitching(mode === 'auto');
    return true;
  };

  const handleIframeLoad = () => {
    setIframeBootstrapped(true);
  };

  const currentServer = servers[activeServer];
  const hasAlternateServer = servers.length > 1;

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (loading || servers.length === 0 || playbackReady || iframeError) {
      return;
    }

    const attemptIndex = Math.max(0, attemptedServersRef.current.length - 1);
    const backoffMultiplier = Math.min(1.8, 1 + attemptIndex * 0.2);
    const connectTimeout = Math.round((vpnMode ? VPN_AUTO_FAILOVER_TIMEOUT_MS : AUTO_FAILOVER_TIMEOUT_MS) * backoffMultiplier);
    const playbackGraceTimeout = Math.round((vpnMode ? VPN_PLAYBACK_GRACE_MS : PLAYBACK_GRACE_MS) * backoffMultiplier);

    if (!iframeBootstrapped) {
      setIframeLoading(true);
      const connectWatchdog = window.setTimeout(() => {
        const switched = tryNextServer(activeServer, 'auto');
        if (!switched) {
          setIframeLoading(false);
          setIframeError(true);
        }
      }, connectTimeout);

      return () => window.clearTimeout(connectWatchdog);
    }

    setIframeLoading(true);
    const bootstrapTimer = window.setTimeout(() => {
      setAutoSwitching(false);
    }, IFRAME_BOOTSTRAP_MS);

    const playbackWatchdog = window.setTimeout(() => {
      const switched = tryNextServer(activeServer, 'auto');
      if (!switched) {
        setIframeLoading(false);
        setPlaybackReady(true);
        setIframeError(true);
      }
    }, playbackGraceTimeout);

    const overlayReleaseMs = vpnMode ? IFRAME_BOOTSTRAP_MS + 9000 : IFRAME_BOOTSTRAP_MS + 4500;
    const releaseOverlayTimer = window.setTimeout(() => {
      setIframeLoading(false);
      setPlaybackReady(true);
      setAutoSwitching(false);
    }, Math.min(playbackGraceTimeout - 1000, overlayReleaseMs));

    return () => {
      window.clearTimeout(bootstrapTimer);
      window.clearTimeout(playbackWatchdog);
      window.clearTimeout(releaseOverlayTimer);
    };
  }, [activeServer, iframeBootstrapped, iframeError, loading, playbackReady, servers.length, vpnMode]);

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
          <button
            onClick={() => setShowSources((prev) => !prev)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            title="Show or hide source list"
          >
            {showSources ? 'Hide Sources' : 'Show Sources'}
          </button>
          <button
            onClick={() => {
              setVpnMode((prev) => !prev);
              setIframeLoading(true);
              setIframeError(false);
              setIframeBootstrapped(false);
              setPlaybackReady(false);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
              vpnMode
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
            }`}
            title="VPN mode refreshes probes and gives slow VPN routes more time"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> VPN
          </button>
          <button
            onClick={() => void fetchServers({ refresh: true })}
            className="p-2 hover:bg-neutral-800 rounded-full transition text-neutral-400 hover:text-white"
            title="Refresh server checks"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const switched = tryNextServer(activeServer, 'manual');
              if (!switched) {
                setIframeLoading(false);
                setIframeError(true);
                setShowSources(true);
              }
            }}
            disabled={!hasAlternateServer}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
              hasAlternateServer
                ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                : 'bg-neutral-900 text-neutral-600 cursor-not-allowed'
            }`}
            title={hasAlternateServer ? 'Try next server' : 'No alternate server available'}
          >
            <SkipForward className="w-3.5 h-3.5" /> Next
          </button>
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
      {!loading && servers.length > 0 && showSources && (
        <div className="px-4 py-2.5 bg-neutral-900/80 backdrop-blur border-b border-neutral-800 shrink-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-700 pb-1">
            {servers.map((server, i) => (
              <button
                key={i}
                onClick={() => handleServerChange(i)}
                className={`server-chip-enter px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  activeServer === i
                    ? 'text-white shadow-lg scale-105 server-chip-active-ring'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                }`}
                style={{
                  ...(activeServer === i
                    ? {
                        backgroundColor: server.color,
                        boxShadow: `0 0 20px ${server.color}40`,
                      }
                    : {}),
                  animationDelay: `${Math.min(i * 55, 450)}ms`,
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <span>{getServerLabel(i)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/35">
                    {server.qualityHint.toUpperCase()}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${getAvailabilityBadge(server).className}`}>
                    {getAvailabilityBadge(server).text}
                  </span>
                </span>
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
              <p className="text-lg font-semibold mb-2">No working servers right now</p>
              <p className="text-neutral-400 text-sm">All providers are currently unavailable. Please try again shortly.</p>
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
                  <p className="text-neutral-300 font-medium">{getServerLabel(activeServer)}</p>
                  <p className="text-neutral-500 text-sm mt-1">
                    {formatProbeStatus(currentServer, autoSwitching, vpnMode)}
                  </p>
                  {currentServer && !currentServer.isReachable && (
                    <p className="text-xs text-neutral-400 mt-2">
                      Probe says {currentServer.availabilityState}, but browser playback may still work with VPN mode.
                    </p>
                  )}
                  {vpnMode && (
                    <p className="text-blue-300 text-xs mt-2">
                      VPN mode bypasses stale checks and waits longer before switching sources.
                    </p>
                  )}
                  {getNetworkHint(currentServer) && (
                    <p className="text-amber-400 text-xs mt-2">{getNetworkHint(currentServer)}</p>
                  )}
                  {autoSwitching && (
                    <div className="server-switch-progress mt-3 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                      <div className="h-full bg-blue-500" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error State */}
            {iframeError && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/90">
                <div className="text-center p-6">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-lg font-semibold mb-2">Server unavailable</p>
                  <p className="text-neutral-400 text-sm mb-4">
                    This server might be down or blocked on this network. Try VPN mode, refresh checks, or open it in a new tab.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        setIframeError(false);
                        setIframeLoading(true);
                        setIframeBootstrapped(false);
                        setPlaybackReady(false);
                      }}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm flex items-center gap-2 transition"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                    {!vpnMode && (
                      <button
                        onClick={() => {
                          setVpnMode(true);
                          setIframeError(false);
                          setIframeLoading(true);
                          setIframeBootstrapped(false);
                          setPlaybackReady(false);
                        }}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-lg text-sm flex items-center gap-2 transition"
                      >
                        <ShieldCheck className="w-4 h-4" /> VPN Mode
                      </button>
                    )}
                    {currentServer && (
                      <a
                        href={currentServer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm flex items-center gap-2 transition"
                      >
                        <ExternalLink className="w-4 h-4" /> New Tab
                      </a>
                    )}
                  </div>
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
              referrerPolicy="no-referrer"
              onLoad={handleIframeLoad}
              onError={() => {
                const switched = tryNextServer(activeServer, 'auto');
                if (switched) {
                  return;
                }

                setIframeLoading(false);
                setPlaybackReady(true);
                setIframeError(true);
              }}
            />
          </>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-neutral-900 border-t border-neutral-800 text-center text-xs text-neutral-500 shrink-0">
        Best quality source starts automatically · VPN mode refreshes checks and waits longer on slow routes
      </div>
    </div>
  );
}
