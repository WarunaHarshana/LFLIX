'use client';

import { useRef, useEffect, useState } from 'react';
import { X, AlertCircle, Maximize, Minimize, Settings2, Subtitles, AudioLines, Check, Gauge } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorVideoPlayer } from 'capacitor-video-player';
import { getServerUrl } from '@/lib/mobileConfig';

// HLS sources are played via hls.js (or natively on Safari). The on-the-fly
// transcode endpoint also returns an HLS playlist, so it matches here too.
/**
 * Whether a source is served by this machine (the on-demand transcoder or the
 * raw file endpoint) rather than fetched across the internet from a third-party
 * streaming server. The two need opposite tuning, so everything below keys off
 * this.
 */
function isLocalSource(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('/')) return true;
  try {
    const { hostname } = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

/**
 * hls.js settings differ sharply by where the media comes from.
 *
 * Local: the bottleneck is ffmpeg, not the network. Buffer far ahead to give it
 * a runway and wait patiently on a slow segment, because a slow segment means
 * the encoder is still working rather than that anything is broken.
 *
 * Remote: the bottleneck is bandwidth, and a stalled third-party server should
 * fail fast so the caller can switch to another one. Quality also has to be
 * chased deliberately — with stock settings hls.js starts at the lowest
 * rendition and edges up, so the opening of every episode looks soft.
 */
function buildHlsConfig(src: string): Record<string, unknown> {
  const local = isLocalSource(src);

  if (local) {
    return {
      enableWorker: true,
      maxBufferLength: 120,
      maxMaxBufferLength: 240,
      maxBufferSize: 120 * 1000 * 1000,
      backBufferLength: 60,
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 30_000,
          maxLoadTimeMs: 120_000,
          timeoutRetry: { maxNumRetry: 4, retryDelayMs: 500, maxRetryDelayMs: 4000 },
          errorRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 4000 },
        },
      },
    };
  }

  return {
    enableWorker: true,
    // A minute of runway absorbs jitter on a public route without hoarding
    // memory on a TV or phone.
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    maxBufferSize: 60 * 1000 * 1000,
    backBufferLength: 30,

    // Start high instead of climbing. Seeding the bandwidth estimate well above
    // hls.js's cautious default means the first segments are already at a good
    // rendition; ABR still drops if the link cannot sustain it.
    startLevel: -1,
    abrEwmaDefaultEstimate: 8_000_000,
    // Never cap the rendition to the size of the video element — a windowed
    // player should still be free to pull 1080p/4K.
    capLevelToPlayerSize: false,
    // Use more of the measured bandwidth, and be quicker to move up.
    abrBandWidthFactor: 0.95,
    abrBandWidthUpFactor: 0.8,

    // Fail fast: a wedged third-party host should surface quickly so the modal
    // can move to the next server rather than sitting on a spinner.
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10_000,
        maxLoadTimeMs: 30_000,
        timeoutRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
        errorRetry: { maxNumRetry: 3, retryDelayMs: 500, maxRetryDelayMs: 2000 },
      },
    },
    manifestLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 8_000,
        maxLoadTimeMs: 15_000,
        timeoutRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
        errorRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
      },
    },
  };
}

function isHlsSource(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || /\/api\/transcode(\?|$)/i.test(url);
}

type Props = {
  src: string;
  title: string;
  onClose: () => void;
  initialTime?: number;
  isHDR?: boolean;
  // Explicitly supplied subtitle tracks (e.g. from a streaming server). When
  // provided these take priority; otherwise tracks are auto-discovered from
  // /api/subtitles for local-library files.
  subtitles?: { label: string; url: string; language?: string }[];
  // Source codecs (when known) so the player can pre-emptively transcode
  // browser-incompatible media instead of playing it silently / not at all.
  videoCodec?: string | null;
  audioCodec?: string | null;
  fileName?: string | null;
  /**
   * Called when playback fails and cannot be recovered in place. Lets a caller
   * that has other sources (the stream-server modal) move to the next one
   * instead of leaving the viewer on an error screen with no way forward.
   */
  onFatalError?: (reason: string) => void;
};

// Extended HTMLVideoElement with non-standard audioTracks API
interface ExtendedHTMLVideoElement extends HTMLVideoElement {
  audioTracks?: AudioTrackList;
}

interface AudioTrackList {
  length: number;
  [index: number]: AudioTrack;
}

interface AudioTrack {
  enabled: boolean;
  id: string;
  kind: string;
  label: string;
  language: string;
}

export default function VideoPlayer({ src, title, onClose, initialTime = 0, isHDR = false, subtitles, videoCodec, audioCodec, fileName, onFatalError }: Props) {
  const videoRef = useRef<ExtendedHTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string; language: string }[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; label: string; language: string; url: string }[]>([]);
  const [activeSrc, setActiveSrc] = useState(src);
  const [didFallback, setDidFallback] = useState(false);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState<number>(-1);
  const [hdrSupported, setHdrSupported] = useState<boolean | null>(null);
  // Rendition ladder from the HLS manifest, plus the level currently playing.
  // -1 means ABR is choosing.
  const [qualityLevels, setQualityLevels] = useState<{ index: number; label: string; height: number; bitrate: number }[]>([]);
  const [activeLevel, setActiveLevel] = useState<number>(-1);
  const [preferredLevel, setPreferredLevel] = useState<number>(-1);
  const hlsRef = useRef<any>(null);
  const isNative = Capacitor.isNativePlatform();

  // Build an API URL that forwards the same auth params present on the stream src
  // (token OR contentType/contentId/episodeId), so subtitles & transcode resolve the
  // same underlying file.
  const buildApiUrl = (base: string, extra?: Record<string, string>): string => {
    try {
      const u = new URL(src, window.location.origin);
      const params = new URLSearchParams();
      for (const k of ['token', 'contentType', 'contentId', 'episodeId']) {
        const v = u.searchParams.get(k);
        if (v) params.set(k, v);
      }
      if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
      const qs = params.toString();
      return qs ? `${base}?${qs}` : base;
    } catch {
      return '';
    }
  };

  // Keep the active source in sync when the parent changes src. For media whose
  // audio/video codec browsers can't decode (e.g. AC3/E-AC3/DTS/TrueHD audio or
  // HEVC video, common in MKV/AVI files), start playback through the HLS
  // transcoder up front: the browser would otherwise play such files silently
  // (video only) without ever firing an error, so the error-based fallback below
  // would never run.
  useEffect(() => {
    setDidFallback(false);
    const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = norm(audioCodec);
    const v = norm(videoCodec);
    const badAudio = ['ac3', 'eac3', 'dts', 'dtshd', 'truehd', 'mlp', 'flac', 'pcm'];
    const badVideo = ['hevc', 'h265', 'vc1', 'mpeg2', 'wmv', 'vp6'];
    
    // Check if filename suggests an incompatible container format (MKV, AVI, etc.)
    const ext = fileName ? fileName.split('.').pop()?.toLowerCase() : '';
    const badContainers = ['mkv', 'avi', 'wmv', 'flv', 'ts', 'divx', 'xvid', 'mpg', 'mpeg'];
    const isBadContainer = badContainers.includes(ext || '');

    const incompatible =
      isBadContainer ||
      (a !== '' && badAudio.some((c) => a.includes(c))) ||
      (v !== '' && badVideo.some((c) => v.includes(c)));
      
    if (!isNative && incompatible) {
      const transcodeUrl = buildApiUrl('/api/transcode');
      setActiveSrc(transcodeUrl || src);
    } else {
      setActiveSrc(src);
    }
  }, [src, isNative, audioCodec, videoCodec, fileName]);

  // Redirect video requestFullscreen to containerRef to prevent washed-out HDR colors in browser fullscreen overlay
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const originalRequestFullscreen = video.requestFullscreen || (video as any).webkitRequestFullscreen;
    
    const customRequestFullscreen = function (options?: FullscreenOptions) {
      if (container.requestFullscreen) {
        return container.requestFullscreen(options);
      } else if ((container as any).webkitRequestFullscreen) {
        return (container as any).webkitRequestFullscreen(options);
      }
      return originalRequestFullscreen.call(video, options);
    };

    (video as any).requestFullscreen = customRequestFullscreen;
    (video as any).webkitRequestFullscreen = customRequestFullscreen;

    const handleDblClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen();
    };

    video.addEventListener('dblclick', handleDblClick);

    return () => {
      (video as any).requestFullscreen = originalRequestFullscreen;
      (video as any).webkitRequestFullscreen = originalRequestFullscreen;
      video.removeEventListener('dblclick', handleDblClick);
    };
  }, [activeSrc, isNative]);

  // Attach hls.js for HLS sources (e.g. the on-the-fly transcode endpoint).
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    if (!video) return;
    if (!isHlsSource(activeSrc)) return;
    setQualityLevels([]);
    setActiveLevel(-1);

    // Safari / iOS can play HLS natively.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeSrc;
      return;
    }

    let hls: any;
    let cancelled = false;
    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled || !videoRef.current) return;
        if (!Hls.isSupported()) {
          setError('This browser cannot play the converted stream.');
          return;
        }
        // Tuned for a LAN media server rather than a public CDN. Segments are
        // transcoded on demand, so the cost to avoid is ffmpeg starting late —
        // not bandwidth. Buffering further ahead than the defaults keeps the
        // encoder working steadily and absorbs a slow segment without a stall.
        hls = new Hls(buildHlsConfig(activeSrc));
        hlsRef.current = hls;

        // Expose the rendition ladder so the viewer can pin a quality instead
        // of leaving it to ABR.
        hls.on(Hls.Events.MANIFEST_PARSED, (_e: any, data: any) => {
          const levels = (data?.levels || []).map((lvl: any, index: number) => ({
            index,
            label: lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 0) / 1000)}k`,
            height: lvl.height || 0,
            bitrate: lvl.bitrate || 0,
          }));
          // Highest first, so the quality menu reads best-to-worst.
          levels.sort((a: any, b: any) => b.height - a.height || b.bitrate - a.bitrate);
          setQualityLevels(levels);
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e: any, data: any) => {
          setActiveLevel(typeof data?.level === 'number' ? data.level : -1);
        });

        hls.loadSource(activeSrc);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setError('Playback failed during streaming.');
            try { hls.destroy(); } catch { /* ignore */ }
            onFatalError?.('hls-fatal');
          }
        });
      })
      .catch(() => setError('Failed to load streaming engine.'));

    return () => {
      cancelled = true;
      if (hls) {
        try { hls.destroy(); } catch { /* ignore */ }
      }
    };
  }, [activeSrc, isNative]);

  // Subtitle tracks: use explicitly provided ones (e.g. from a streaming server),
  // otherwise auto-discover external sidecar files + embedded streams for local files.
  useEffect(() => {
    if (isNative) return;

    // Explicitly provided subtitles take priority over auto-discovery.
    if (subtitles && subtitles.length > 0) {
      setSubtitleTracks(
        subtitles.map((t, i) => ({
          id: i,
          label: t.label || `Subtitle ${i + 1}`,
          language: t.language || 'unknown',
          url: t.url,
        })),
      );
      return;
    }

    const listUrl = buildApiUrl('/api/subtitles', { list: '1' });
    if (!listUrl) return;
    let cancelled = false;
    fetch(listUrl)
      .then((r) => (r.ok ? r.json() : { tracks: [], audioTracks: [] }))
      .then((data) => {
        if (cancelled) return;
        const tracks = (data.tracks || []).map((t: any, i: number) => ({
          id: i,
          label: t.label || `Subtitle ${i + 1}`,
          language: t.language || 'unknown',
          url: t.url,
        }));
        setSubtitleTracks(tracks);

        if (data.audioTracks && data.audioTracks.length > 0) {
          setAudioTracks(
            data.audioTracks.map((t: any) => ({
              id: t.index,
              label: t.label,
              language: t.language || 'unknown',
            })),
          );
        }
      })
      .catch(() => { /* subtitles are optional */ });
    return () => { cancelled = true; };
  }, [src, isNative, subtitles]);

  // Detect HDR display capability
  useEffect(() => {
    if (!isHDR) return;
    if (typeof window === 'undefined') return;
    const dynamicRange = window.matchMedia('(dynamic-range: high)');
    const videoRange = window.matchMedia('(video-dynamic-range: high)');
    setHdrSupported(dynamicRange.matches || videoRange.matches);
  }, [isHDR]);

  // Handle Native Player
  useEffect(() => {
    if (!isNative) return;

    let playerHandle: any;

    const playNative = async () => {
      try {
        // Construct absolute URL using server URL for native app
        let absoluteUrl: string;
        if (src.startsWith('http')) {
          absoluteUrl = src;
        } else {
          // For native app, use the configured server URL
          const serverUrl = getServerUrl();
          if (serverUrl) {
            absoluteUrl = serverUrl + (src.startsWith('/') ? src : '/' + src);
          } else {
            absoluteUrl = window.location.origin + (src.startsWith('/') ? src : '/' + src);
          }
        }
        console.log('Starting native player:', absoluteUrl);

        // Listen for exit
        playerHandle = await (CapacitorVideoPlayer as any).addListener('jeepCapVideoPlayerExit', () => {
          console.log('Native player exited');
          onClose();
        });

        // Initialize Native Player
        await CapacitorVideoPlayer.initPlayer({
          mode: 'fullscreen',
          url: absoluteUrl,
          playerId: 'fullscreen-player',
          componentTag: 'div',
          headers: {
            // If we had the cookie, we'd pass it here. But we use Token now.
          }
        });

        // Use a small timeout to ensure player is ready before seeking (if needed)
        /* if (initialTime > 0) { ... } */

      } catch (e) {
        console.error('Native player error:', e);
        // Fallback to web player? or Show error
        setError('Native player failed to load: ' + JSON.stringify(e));
      }
    };

    playNative();

    return () => {
      if (playerHandle) playerHandle.remove();
      CapacitorVideoPlayer.stopAllPlayers();
    };
  }, [src, isNative]); // Effect dependencies

  // Track fullscreen state
  useEffect(() => {
    if (isNative) return;
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isNative]);

  // Set initial time and detect tracks when video loads
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    if (!video) return;

    if (initialTime > 0) {
      video.currentTime = initialTime;
    }

    // Detect audio tracks
    const detectTracks = () => {
      // Audio tracks
      if (video.audioTracks) {
        const tracks = [];
        for (let i = 0; i < video.audioTracks.length; i++) {
          const track = video.audioTracks[i];
          tracks.push({
            id: i,
            label: track.label || `Track ${i + 1}`,
            language: track.language || 'unknown'
          });
        }
        setAudioTracks(tracks);
      }

      // Subtitle tracks come from /api/subtitles (external files + embedded streams),
      // so they are loaded separately and not overwritten from the video element here.
    };

    video.addEventListener('loadedmetadata', detectTracks);
    return () => video.removeEventListener('loadedmetadata', detectTracks);
  }, [initialTime, isNative]);

  const handleError = () => {
    const video = videoRef.current;
    if (video) {
      const errorCode = video.error?.code;
      const errorMessage = video.error?.message || 'Unknown error';
      console.error('Video error:', errorCode, errorMessage);

      // Auto-fallback: if the browser can't decode the raw file (unsupported codec or
      // container such as MKV/AVI/HEVC), retry through the on-the-fly HLS transcoder.
      if (!didFallback && !isHlsSource(activeSrc) && (errorCode === 3 || errorCode === 4)) {
        const transcodeUrl = buildApiUrl('/api/transcode');
        if (transcodeUrl) {
          console.log('Falling back to transcode:', transcodeUrl);
          setDidFallback(true);
          setError(null);
          setLoading(true);
          setActiveSrc(transcodeUrl);
          return;
        }
      }

      let friendlyError = 'Failed to play video';
      switch (errorCode) {
        case 1:
          friendlyError = 'Video loading aborted';
          break;
        case 2:
          friendlyError = 'Network error - check connection';
          break;
        case 3:
          friendlyError = 'Video format not supported by browser';
          break;
        case 4:
          friendlyError = 'Video format not supported';
          break;
      }
      setError(friendlyError);
    }
    setLoading(false);
  };

  const handleCanPlay = () => {
    setLoading(false);
    setError(null);
  };

  // Handle fullscreen
  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
          console.error('Exit fullscreen error:', err);
        });
      } else {
        containerRef.current.requestFullscreen().catch(err => {
          console.error('Fullscreen error:', err);
        });
      }
    }
  };

  // Auto-enter fullscreen on play (for TV/better experience)
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      if (!document.fullscreenElement && containerRef.current && containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {
          // Ignore errors
        });
      }
    };

    video.addEventListener('play', handlePlay);
    return () => video.removeEventListener('play', handlePlay);
  }, [isNative]);

  // Change audio track
  const changeAudioTrack = (index: number) => {
    const video = videoRef.current as ExtendedHTMLVideoElement | null;
    if (!video) return;

    if (isHlsSource(activeSrc)) {
      const newUrl = buildApiUrl('/api/transcode', { audio: String(index) });
      if (newUrl) {
        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;

        setError(null);
        setLoading(true);
        setActiveSrc(newUrl);
        setCurrentAudioTrack(index);

        const handleSeek = () => {
          if (videoRef.current) {
            videoRef.current.currentTime = currentTime;
            if (wasPlaying) {
              videoRef.current.play().catch(() => {});
            }
            videoRef.current.removeEventListener('canplay', handleSeek);
          }
        };
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.addEventListener('canplay', handleSeek);
          }
        }, 100);
      }
    } else if (video.audioTracks) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        video.audioTracks[i].enabled = (i === index);
      }
      setCurrentAudioTrack(index);
    }
  };

  /**
   * Pin a rendition, or hand control back to ABR with -1.
   * `nextLevel` applies from the next fragment rather than flushing what is
   * already buffered, so switching does not stall playback.
   */
  const changeQuality = (levelIndex: number) => {
    setPreferredLevel(levelIndex);
    const hls = hlsRef.current;
    if (!hls) return;
    hls.nextLevel = levelIndex;
    if (levelIndex === -1) hls.currentLevel = -1;
  };

  // Change subtitle track
  const changeSubtitleTrack = (index: number) => {
    const video = videoRef.current;
    if (!video) return;

    const targetId = `lflix-sub-${index}`;

    // Disable all tracks first, then enable the one matching the target ID
    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (index >= 0 && track.id === targetId) {
        track.mode = 'showing';
      } else {
        track.mode = 'disabled';
      }
    }
    setCurrentSubtitleTrack(index);
  };

  const hasAudioTracks = audioTracks.length > 1;
  const hasSubtitleTracks = subtitleTracks.length > 0;
  const hasQualityLevels = qualityLevels.length > 1;
  const hasSettings = hasAudioTracks || hasSubtitleTracks || hasQualityLevels;

  // Debug log to see what's detected
  useEffect(() => {
    if (isNative) return;
    console.log('VideoPlayer - Audio tracks:', audioTracks.length, audioTracks);
    console.log('VideoPlayer - Subtitle tracks:', subtitleTracks.length, subtitleTracks);
  }, [audioTracks, subtitleTracks, isNative]);

  // If Native, show a placeholder (the system player covers the screen).
  // This bails out *after* every hook so the hook count stays stable.
  if (isNative) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-neutral-400">Opening system player...</p>
          <button
            onClick={onClose}
            className="mt-8 px-6 py-2 bg-neutral-800 rounded-lg text-white text-sm hover:bg-neutral-700"
          >
            Cancel / Close
          </button>
        </div>
        {error && <div className="absolute bottom-10 text-red-500">{error}</div>}
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Video player" ref={containerRef} className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-neutral-900">
        <h2 className="text-lg font-medium truncate flex-1">{title}</h2>
        <div className="flex items-center gap-2">
          {/* HDR Badge */}
          {isHDR && (
            <span className="px-2 py-0.5 bg-amber-500/90 text-black text-xs rounded font-bold tracking-wide">
              HDR
            </span>
          )}
          {/* Settings Button - Always show, displays info about tracks */}
          <div className="relative">
            <button aria-label="Audio & Subtitles"
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-neutral-800 rounded-full transition"
              title="Audio & Subtitles"
            >
              <Settings2 className="w-6 h-6" />
            </button>

            {/* Settings Menu */}
            {showSettings && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
                {/* Quality — only meaningful when the source offers a ladder */}
                {hasQualityLevels && (
                  <div className="border-b border-neutral-700">
                    <div className="px-4 py-2 bg-neutral-900/50 flex items-center gap-2">
                      <Gauge className="w-4 h-4" />
                      <span className="text-sm font-medium">Quality</span>
                    </div>
                    <button
                      onClick={() => changeQuality(-1)}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-neutral-700 transition ${preferredLevel === -1 ? 'text-red-400' : 'text-neutral-300'}`}
                    >
                      <span>
                        Auto
                        {preferredLevel === -1 && activeLevel >= 0 && (
                          <span className="text-neutral-500 ml-1.5">
                            ({qualityLevels.find((l) => l.index === activeLevel)?.label ?? '—'})
                          </span>
                        )}
                      </span>
                      {preferredLevel === -1 && <Check className="w-4 h-4" />}
                    </button>
                    {qualityLevels.map((level) => (
                      <button
                        key={level.index}
                        onClick={() => changeQuality(level.index)}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-neutral-700 transition ${preferredLevel === level.index ? 'text-red-400' : 'text-neutral-300'}`}
                      >
                        <span>
                          {level.label}
                          {level.bitrate > 0 && (
                            <span className="text-neutral-500 ml-1.5">
                              {(level.bitrate / 1_000_000).toFixed(1)} Mbps
                            </span>
                          )}
                        </span>
                        {preferredLevel === level.index && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* Audio Tracks */}
                <div className="border-b border-neutral-700">
                  <div className="px-4 py-2 bg-neutral-900/50 flex items-center gap-2">
                    <AudioLines className="w-4 h-4" />
                    <span className="text-sm font-medium">Audio Language</span>
                  </div>
                  {hasAudioTracks ? (
                    audioTracks.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => changeAudioTrack(track.id)}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-neutral-700 transition ${currentAudioTrack === track.id ? 'text-red-400' : 'text-neutral-300'
                          }`}
                      >
                        <span>{track.label} {track.language !== 'unknown' && `(${track.language})`}</span>
                        {currentAudioTrack === track.id && <Check className="w-4 h-4" />}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-neutral-500">
                      No audio tracks detected
                      <p className="text-xs mt-1 text-neutral-600">
                        MKV/AVI files may not show tracks in browser. Use VLC or DLNA for full track support.
                      </p>
                    </div>
                  )}
                </div>

                {/* Subtitle Tracks */}
                <div>
                  <div className="px-4 py-2 bg-neutral-900/50 flex items-center gap-2">
                    <Subtitles className="w-4 h-4" />
                    <span className="text-sm font-medium">Subtitles</span>
                  </div>
                  {hasSubtitleTracks ? (
                    <>
                      <button
                        onClick={() => changeSubtitleTrack(-1)}
                        className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-neutral-700 transition ${currentSubtitleTrack === -1 ? 'text-red-400' : 'text-neutral-300'
                          }`}
                      >
                        <span>Off</span>
                        {currentSubtitleTrack === -1 && <Check className="w-4 h-4" />}
                      </button>
                      {subtitleTracks.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => changeSubtitleTrack(track.id)}
                          className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-neutral-700 transition ${currentSubtitleTrack === track.id ? 'text-red-400' : 'text-neutral-300'
                            }`}
                        >
                          <span>{track.label} {track.language !== 'unknown' && `(${track.language})`}</span>
                          {currentSubtitleTrack === track.id && <Check className="w-4 h-4" />}
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="px-4 py-3 text-sm text-neutral-500">
                      No subtitle tracks detected
                      <p className="text-xs mt-1 text-neutral-600">
                        MKV/AVI embedded subs not supported in browser. Use VLC or DLNA for subtitles.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            onClick={toggleFullscreen}
            className="p-2 hover:bg-neutral-800 rounded-full transition"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
          </button>
          <button aria-label="Close"
            onClick={onClose}
            className="p-3 hover:bg-neutral-800 rounded-full transition bg-neutral-800/50"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Video */}
      <div className="flex-1 flex items-center justify-center bg-black relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-neutral-400">Loading video...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="bg-neutral-900 border border-red-800 rounded-xl p-6 max-w-md text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-red-400 mb-2">Playback Error</h3>
              <p className="text-neutral-300 mb-4">{error}</p>
              <p className="text-sm text-neutral-500 mb-4">
                This usually means your browser doesn't support the video format (MKV, AVI, etc.)
              </p>
              <div className="space-y-2 text-left text-sm text-neutral-400">
                <p><strong>Try:</strong></p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Use VLC app instead</li>
                  <li>Convert video to MP4 format</li>
                  <li>Use DLNA server on Smart TV</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={isHlsSource(activeSrc) ? undefined : activeSrc}
          controls
          controlsList="nofullscreen"
          autoPlay
          className="max-w-full max-h-full"
          playsInline
          onError={handleError}
          onCanPlay={handleCanPlay}
        >
          {subtitleTracks.map((track) => (
            <track
              key={track.id}
              id={`lflix-sub-${track.id}`}
              kind="subtitles"
              src={track.url}
              srcLang={(track.language || 'und').slice(0, 3)}
              label={track.label}
            />
          ))}
          Your browser does not support the video tag.
        </video>
      </div>

      {/* HDR Compatibility Warning */}
      {isHDR && hdrSupported === false && !error && (
        <div className="px-4 py-2 bg-amber-900/30 border-t border-amber-800/40 text-center text-xs text-amber-300/80">
          ⚠ Your display may not support HDR — colors may appear washed out
        </div>
      )}

      {/* Hint */}
      <div className="p-4 bg-neutral-900 text-center text-sm text-neutral-500">
        {error ? 'See error above' : hasSettings ? 'Tap ⚙️ for audio & subtitles • Tap video for controls' : 'Tap video for controls • Works best in fullscreen'}
      </div>
    </div>
  );
}
