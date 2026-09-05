'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  X,
  AlertCircle,
  Maximize,
  Minimize,
  Settings2,
  Subtitles,
  AudioLines,
  Check,
  Gauge,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  PictureInPicture2,
  RectangleHorizontal,
  RefreshCw,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorVideoPlayer } from 'capacitor-video-player';
import { getServerUrl } from '@/lib/mobileConfig';

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

function buildHlsConfig(src: string): Record<string, unknown> {
  const local = isLocalSource(src);

  if (local) {
    return {
      enableWorker: true,
      maxBufferLength: 120,
      maxMaxBufferLength: 240,
      maxBufferSize: 120 * 1000 * 1000,
      backBufferLength: 60,
      xhrSetup: (xhr: XMLHttpRequest) => {
        xhr.withCredentials = true;
      },
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
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    maxBufferSize: 60 * 1000 * 1000,
    backBufferLength: 30,
    startLevel: -1,
    abrEwmaDefaultEstimate: 8_000_000,
    capLevelToPlayerSize: false,
    abrBandWidthFactor: 0.95,
    abrBandWidthUpFactor: 0.8,
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

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) {
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${h}:${mm}:${ss}`;
  }
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${mm}:${ss}`;
}

type Props = {
  src: string;
  title: string;
  onClose: () => void;
  initialTime?: number;
  isHDR?: boolean;
  subtitles?: { label: string; url: string; language?: string }[];
  videoCodec?: string | null;
  audioCodec?: string | null;
  fileName?: string | null;
  onFatalError?: (reason: string) => void;
};

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

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayer({
  src,
  title,
  onClose,
  initialTime = 0,
  isHDR = false,
  subtitles,
  videoCodec,
  audioCodec,
  fileName,
  onFatalError,
}: Props) {
  const videoRef = useRef<ExtendedHTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover'>('contain');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; time: number } | null>(null);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<{
    type: 'forward' | 'backward';
    key: number;
  } | null>(null);

  // Tracks & settings
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'audio' | 'subtitles' | 'quality' | 'speed'>('audio');
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string; language: string }[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; label: string; language: string; url: string }[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState<number>(-1);
  const [qualityLevels, setQualityLevels] = useState<{ index: number; label: string; height: number; bitrate: number }[]>([]);
  const [activeLevel, setActiveLevel] = useState<number>(-1);
  const [preferredLevel, setPreferredLevel] = useState<number>(-1);
  const [pipSupported, setPipSupported] = useState(false);
  const [hdrSupported, setHdrSupported] = useState<boolean | null>(null);

  const [activeSrc, setActiveSrc] = useState(src);
  const [didFallback, setDidFallback] = useState(false);
  const hlsRef = useRef<any>(null);
  const isNative = Capacitor.isNativePlatform();

  // Helper to build parameterized API URLs forwarding stream tokens
  const buildApiUrl = useCallback(
    (base: string, extra?: Record<string, string>): string => {
      try {
        const u = new URL(src, window.location.origin);
        const params = new URLSearchParams();
        for (const k of ['token', 'contentType', 'contentId', 'episodeId']) {
          const v = u.searchParams.get(k);
          if (v) params.set(k, v);
        }
        if (extra) {
          for (const [k, v] of Object.entries(extra)) params.set(k, v);
        }
        const qs = params.toString();
        return qs ? `${base}?${qs}` : base;
      } catch {
        return '';
      }
    },
    [src]
  );

  // Auto-hide controls logic
  const scheduleHideControls = useCallback(() => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused && !showSettingsModal && !isScrubbing) {
        setShowControls(false);
      }
    }, 3500);
  }, [showSettingsModal, isScrubbing]);

  const wakeControls = useCallback(() => {
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  // Codec checks and initial transcode route resolution
  useEffect(() => {
    setDidFallback(false);
    const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = norm(audioCodec);
    const v = norm(videoCodec);
    const badAudio = ['ac3', 'eac3', 'dts', 'dtshd', 'truehd', 'mlp', 'flac', 'pcm'];
    const badVideo = ['hevc', 'h265', 'vc1', 'mpeg2', 'wmv', 'vp6'];

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
  }, [src, isNative, audioCodec, videoCodec, fileName, buildApiUrl]);

  // Attach HLS engine for HLS / transcode streams
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    if (!video) return;
    if (!isHlsSource(activeSrc)) return;

    setQualityLevels([]);
    setActiveLevel(-1);

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
          setError('This browser cannot play the stream.');
          return;
        }

        hls = new Hls(buildHlsConfig(activeSrc));
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, (_e: any, data: any) => {
          const levels = (data?.levels || []).map((lvl: any, index: number) => ({
            index,
            label: lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 0) / 1000)}k`,
            height: lvl.height || 0,
            bitrate: lvl.bitrate || 0,
          }));
          levels.sort((x: any, y: any) => y.height - x.height || y.bitrate - x.bitrate);
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
            setError('Playback encountered an error.');
            try {
              hls.destroy();
            } catch {
              /* ignore */
            }
            onFatalError?.('hls-fatal');
          }
        });
      })
      .catch(() => setError('Failed to load streaming engine.'));

    return () => {
      cancelled = true;
      if (hls) {
        try {
          hls.destroy();
        } catch {
          /* ignore */
        }
      }
    };
  }, [activeSrc, isNative, onFatalError]);

  // Subtitle auto-discovery / explicit track loading
  useEffect(() => {
    if (isNative) return;

    if (subtitles && subtitles.length > 0) {
      setSubtitleTracks(
        subtitles.map((t, i) => ({
          id: i,
          label: t.label || `Subtitle ${i + 1}`,
          language: t.language || 'unknown',
          url: t.url,
        }))
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
            }))
          );
        }
      })
      .catch(() => {
        /* subtitles optional */
      });

    return () => {
      cancelled = true;
    };
  }, [src, isNative, subtitles, buildApiUrl]);

  // Detect PiP and HDR capability
  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPipSupported(!!document.pictureInPictureEnabled);
    }
    if (isHDR && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        const dynamicRange = window.matchMedia('(dynamic-range: high)');
        setHdrSupported(!!dynamicRange.matches);
      } catch {
        /* ignore */
      }
    }
  }, [isHDR]);

  // Fullscreen state listener
  useEffect(() => {
    if (isNative) return;
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isNative]);

  // Initial time & metadata detection
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    if (!video) return;

    if (initialTime > 0) {
      video.currentTime = initialTime;
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      if (video.audioTracks && video.audioTracks.length > 0) {
        const tracks = [];
        for (let i = 0; i < video.audioTracks.length; i++) {
          const track = video.audioTracks[i];
          tracks.push({
            id: i,
            label: track.label || `Track ${i + 1}`,
            language: track.language || 'unknown',
          });
        }
        setAudioTracks(tracks);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [initialTime, isNative]);

  // Watch history sync every 10 seconds
  useEffect(() => {
    if (isNative) return;

    const reportProgress = () => {
      const video = videoRef.current;
      if (!video || !video.duration || video.duration <= 0) return;
      try {
        const u = new URL(src, window.location.origin);
        const contentType = u.searchParams.get('contentType');
        const contentId = u.searchParams.get('contentId');
        const episodeId = u.searchParams.get('episodeId');
        if (contentType && contentId) {
          fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              contentType,
              contentId: parseInt(contentId, 10),
              episodeId: episodeId ? parseInt(episodeId, 10) : undefined,
              progress: Math.floor(video.currentTime),
              duration: Math.floor(video.duration),
            }),
          }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    };

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        reportProgress();
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      reportProgress();
    };
  }, [src, isNative]);

  // Native player handler
  useEffect(() => {
    if (!isNative) return;

    let playerHandle: any;

    const playNative = async () => {
      try {
        let absoluteUrl: string;
        if (src.startsWith('http')) {
          absoluteUrl = src;
        } else {
          const serverUrl = getServerUrl();
          absoluteUrl = serverUrl
            ? serverUrl + (src.startsWith('/') ? src : '/' + src)
            : window.location.origin + (src.startsWith('/') ? src : '/' + src);
        }

        playerHandle = await (CapacitorVideoPlayer as any).addListener('jeepCapVideoPlayerExit', () => {
          onClose();
        });

        await CapacitorVideoPlayer.initPlayer({
          mode: 'fullscreen',
          url: absoluteUrl,
          playerId: 'fullscreen-player',
          componentTag: 'div',
        });
      } catch (e) {
        setError('Native player failed to load: ' + JSON.stringify(e));
      }
    };

    playNative();

    return () => {
      if (playerHandle) playerHandle.remove();
      CapacitorVideoPlayer.stopAllPlayers();
    };
  }, [src, isNative, onClose]);

  // Video element playback event bindings
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      scheduleHideControls();
    };
    const onPause = () => {
      setIsPlaying(false);
      setShowControls(true);
    };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      setIsBuffering(false);
      setLoading(false);
    };
    const onCanPlay = () => {
      setLoading(false);
      setIsBuffering(false);
      setError(null);
    };
    const onTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(video.currentTime);
      }
      if (video.buffered.length > 0) {
        try {
          const cur = video.currentTime;
          let buffEnd = 0;
          for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= cur && cur <= video.buffered.end(i)) {
              buffEnd = video.buffered.end(i);
              break;
            }
          }
          setBuffered(buffEnd || video.buffered.end(video.buffered.length - 1));
        } catch {
          /* ignore */
        }
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [isNative, isScrubbing, scheduleHideControls]);

  // Playback error handler
  const handleError = () => {
    const video = videoRef.current;
    if (video) {
      const errorCode = video.error?.code;

      if (!didFallback && !isHlsSource(activeSrc) && (errorCode === 3 || errorCode === 4)) {
        const transcodeUrl = buildApiUrl('/api/transcode');
        if (transcodeUrl) {
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
          friendlyError = 'Playback aborted';
          break;
        case 2:
          friendlyError = 'Network error while loading video';
          break;
        case 3:
          friendlyError = 'Format decode error';
          break;
        case 4:
          friendlyError = 'Video stream not supported';
          break;
      }
      setError(friendlyError);
    }
    setLoading(false);
    setIsBuffering(false);
  };

  // Playback control functions
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    wakeControls();
  };

  const seekBy = (deltaSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + deltaSeconds));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    wakeControls();
  };

  const setVolume = (val: number) => {
    const video = videoRef.current;
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (video) {
      video.volume = clamped;
      video.muted = clamped === 0;
      setIsMuted(clamped === 0);
    }
    wakeControls();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted || volume === 0) {
      const restored = volume === 0 ? 0.8 : volume;
      video.muted = false;
      video.volume = restored;
      setIsMuted(false);
      setVolumeState(restored);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
    wakeControls();
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    wakeControls();

    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        if (screen.orientation && 'unlock' in screen.orientation) {
          try {
            (screen.orientation as any).unlock();
          } catch {
            /* ignore */
          }
        }
      } else {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if ((container as any).webkitRequestFullscreen) {
          await (container as any).webkitRequestFullscreen();
        }
        if (screen.orientation && 'lock' in screen.orientation) {
          try {
            await (screen.orientation as any).lock('landscape');
          } catch {
            /* orientation lock is optional on desktop/unsupported browsers */
          }
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err);
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    wakeControls();
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.error('Picture-in-picture error:', err);
    }
  };

  const toggleAspectRatio = () => {
    setAspectRatio((prev) => (prev === 'contain' ? 'cover' : 'contain'));
    wakeControls();
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  const changeAudioTrack = (index: number) => {
    const video = videoRef.current as ExtendedHTMLVideoElement | null;
    if (!video) return;

    if (isHlsSource(activeSrc)) {
      const newUrl = buildApiUrl('/api/transcode', { audio: String(index) });
      if (newUrl) {
        const t = video.currentTime;
        const wasPlaying = !video.paused;
        setError(null);
        setLoading(true);
        setActiveSrc(newUrl);
        setCurrentAudioTrack(index);

        const handleSeek = () => {
          if (videoRef.current) {
            videoRef.current.currentTime = t;
            if (wasPlaying) videoRef.current.play().catch(() => {});
            videoRef.current.removeEventListener('canplay', handleSeek);
          }
        };
        setTimeout(() => {
          if (videoRef.current) videoRef.current.addEventListener('canplay', handleSeek);
        }, 100);
      }
    } else if (video.audioTracks) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        video.audioTracks[i].enabled = i === index;
      }
      setCurrentAudioTrack(index);
    }
  };

  const changeSubtitleTrack = (index: number) => {
    const video = videoRef.current;
    if (!video) return;
    const targetId = `lflix-sub-${index}`;

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

  const changeQuality = (levelIndex: number) => {
    setPreferredLevel(levelIndex);
    const hls = hlsRef.current;
    if (!hls) return;
    hls.nextLevel = levelIndex;
    if (levelIndex === -1) hls.currentLevel = -1;
  };

  // Keyboard navigation
  useEffect(() => {
    if (isNative) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(volume - 0.1);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (!document.fullscreenElement) {
            onClose();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNative, onClose, volume]);

  // Touch screen tap / double-tap handling on the video area
  const handleVideoAreaTouchOrClick = (e: React.MouseEvent | React.TouchEvent) => {
    // Don't trigger if interacting with controls overlay directly
    if ((e.target as HTMLElement).closest('button, input, select, .controls-bar')) return;

    const now = Date.now();
    const timeDiff = now - lastTapTimeRef.current;
    const container = containerRef.current;

    if (timeDiff < 300 && container) {
      // Double tap detected! Cancel single tap
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }

      const rect = container.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : (e as React.MouseEvent).clientX;
      const relativeX = clientX - rect.left;
      const ratio = relativeX / rect.width;

      if (ratio < 0.35) {
        // Double tap left: seek backward 10s
        seekBy(-10);
        setDoubleTapFeedback({ type: 'backward', key: now });
        setTimeout(() => setDoubleTapFeedback(null), 700);
      } else if (ratio > 0.65) {
        // Double tap right: seek forward 10s
        seekBy(10);
        setDoubleTapFeedback({ type: 'forward', key: now });
        setTimeout(() => setDoubleTapFeedback(null), 700);
      } else {
        // Double tap center: toggle aspect ratio Fit vs Fill
        toggleAspectRatio();
      }

      lastTapTimeRef.current = 0;
    } else {
      // Single tap candidate: wait 250ms to verify it's not a double-tap
      lastTapTimeRef.current = now;
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        setShowControls((prev) => !prev);
        if (!showControls) scheduleHideControls();
        singleTapTimerRef.current = null;
      }, 250);
    }
  };

  // Scrubber drag / pointer events
  const calculateScrubTime = (clientX: number) => {
    const timeline = timelineRef.current;
    if (!timeline || !duration) return 0;
    const rect = timeline.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsScrubbing(true);
    wakeControls();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const targetTime = calculateScrubTime(e.clientX);
    setScrubTime(targetTime);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const timeline = timelineRef.current;
    if (timeline && duration > 0) {
      const rect = timeline.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      setHoverPosition({ x, time: (x / rect.width) * duration });
    }
    if (isScrubbing) {
      const targetTime = calculateScrubTime(e.clientX);
      setScrubTime(targetTime);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      const video = videoRef.current;
      if (video) {
        video.currentTime = scrubTime;
        setCurrentTime(scrubTime);
      }
      scheduleHideControls();
    }
  };

  const displayedTime = isScrubbing ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? (displayedTime / duration) * 100 : 0;
  const bufferPercent = duration > 0 ? (buffered / duration) * 100 : 0;
  const hasSettings = audioTracks.length > 1 || subtitleTracks.length > 0 || qualityLevels.length > 1;

  if (isNative) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-400">Opening player...</p>
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Video player"
      ref={containerRef}
      onMouseMove={wakeControls}
      onTouchStart={wakeControls}
      className="fixed inset-0 z-[100] bg-black select-none overflow-hidden touch-none"
    >
      {/* ──────────────── Video Element (Full Bleed) ──────────────── */}
      <div
        className="absolute inset-0 w-full h-full flex items-center justify-center cursor-pointer"
        onClick={handleVideoAreaTouchOrClick}
        onTouchEnd={handleVideoAreaTouchOrClick}
      >
        <video
          ref={videoRef}
          src={isHlsSource(activeSrc) ? undefined : activeSrc}
          autoPlay
          playsInline
          className={`w-full h-full ${
            aspectRatio === 'cover' ? 'object-cover' : 'object-contain'
          } transition-[object-fit] duration-300 pointer-events-none`}
          onError={handleError}
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
        </video>
      </div>

      {/* ──────────────── Double Tap Ripple Feedback ──────────────── */}
      {doubleTapFeedback && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${
            doubleTapFeedback.type === 'backward' ? 'left-8 sm:left-16' : 'right-8 sm:right-16'
          } flex flex-col items-center justify-center p-4 bg-black/75 rounded-full border border-white/20 backdrop-blur-md animate-bounce pointer-events-none z-40`}
        >
          {doubleTapFeedback.type === 'backward' ? (
            <>
              <RotateCcw className="w-8 h-8 text-white mb-1" />
              <span className="text-xs font-bold text-white tracking-widest">-10s</span>
            </>
          ) : (
            <>
              <RotateCw className="w-8 h-8 text-white mb-1" />
              <span className="text-xs font-bold text-white tracking-widest">+10s</span>
            </>
          )}
        </div>
      )}

      {/* ──────────────── Center Loading / Buffering Spinner ──────────────── */}
      {(loading || isBuffering) && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="flex flex-col items-center bg-black/60 backdrop-blur-md px-6 py-5 rounded-2xl border border-white/10 shadow-2xl">
            <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-xs font-medium text-neutral-300">
              {loading ? 'Loading stream...' : 'Buffering...'}
            </span>
          </div>
        </div>
      )}

      {/* ──────────────── Error Overlay ──────────────── */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/90 z-50">
          <div className="bg-neutral-900 border border-red-800/80 rounded-2xl p-6 max-w-md w-full text-center shadow-2xl">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-red-400 mb-1">Playback Error</h3>
            <p className="text-neutral-300 text-sm mb-4">{error}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  const t = buildApiUrl('/api/transcode');
                  if (t) setActiveSrc(t);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
              >
                Retry with Transcode
              </button>
              {onFatalError && (
                <button
                  onClick={() => onFatalError('user-next')}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-sm font-medium transition"
                >
                  Try Next Server
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── Floating Controls Overlay (Auto-Hiding) ──────────────── */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 pointer-events-none z-20 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* ── Top Header Scrim & Actions ── */}
        <div className="w-full bg-gradient-to-b from-black/85 via-black/40 to-transparent pt-3 pb-8 px-4 sm:px-6 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-3 truncate pr-4">
            <button
              onClick={onClose}
              aria-label="Back"
              className="p-2 hover:bg-white/15 rounded-full text-neutral-200 transition active:scale-95"
              title="Close Player"
            >
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate drop-shadow">
              {title}
            </h2>
            {isHDR && (
              <span className="hidden xs:inline-block px-2 py-0.5 bg-amber-500/90 text-black text-[10px] font-extrabold rounded tracking-wider shadow">
                HDR
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Aspect Ratio Fit / Fill Toggle */}
            <button
              onClick={toggleAspectRatio}
              aria-label={`Aspect ratio: ${aspectRatio === 'cover' ? 'Fill (zoomed)' : 'Fit (contained)'}`}
              className="p-2 hover:bg-white/15 rounded-full text-neutral-200 transition active:scale-95"
              title={aspectRatio === 'cover' ? 'Switch to Fit (Original)' : 'Switch to Fill (Full screen)'}
            >
              <RectangleHorizontal
                className={`w-5 h-5 ${aspectRatio === 'cover' ? 'text-red-500 scale-110' : 'text-neutral-300'}`}
              />
            </button>

            {/* Audio & Subtitles Settings */}
            <button
              onClick={() => {
                setShowSettingsModal(true);
                setActiveSettingsTab('audio');
              }}
              aria-label="Audio and Subtitles"
              className="p-2 hover:bg-white/15 rounded-full text-neutral-200 transition active:scale-95 relative"
              title="Audio & Subtitles"
            >
              <Settings2 className="w-5 h-5" />
              {currentSubtitleTrack >= 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="p-2 hover:bg-white/15 rounded-full text-neutral-200 transition active:scale-95"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* ── Center Quick Play / Skip Controls ── */}
        <div className="w-full flex items-center justify-center gap-6 sm:gap-10 pointer-events-auto">
          {/* Skip -10s */}
          <button
            onClick={() => seekBy(-10)}
            aria-label="Rewind 10 seconds"
            className="p-3 sm:p-4 bg-black/40 hover:bg-black/70 active:scale-90 text-white rounded-full border border-white/15 backdrop-blur-md transition shadow-lg"
            title="Rewind 10s"
          >
            <RotateCcw className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>

          {/* Big Center Play / Pause */}
          <button
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="p-4 sm:p-5 bg-red-600/90 hover:bg-red-600 active:scale-95 text-white rounded-full border border-white/20 backdrop-blur-md shadow-2xl transition-all"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
            ) : (
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Skip +10s */}
          <button
            onClick={() => seekBy(10)}
            aria-label="Forward 10 seconds"
            className="p-3 sm:p-4 bg-black/40 hover:bg-black/70 active:scale-90 text-white rounded-full border border-white/15 backdrop-blur-md transition shadow-lg"
            title="Fast Forward 10s"
          >
            <RotateCw className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>
        </div>

        {/* ── Bottom Controls & Timeline Bar ── */}
        <div className="w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent pb-3 pt-8 px-4 sm:px-6 pointer-events-auto controls-bar">
          {/* Timeline Scrubber */}
          <div
            ref={timelineRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => setHoverPosition(null)}
            className="relative w-full py-3 cursor-pointer select-none group touch-none"
          >
            {/* Hover Tooltip */}
            {hoverPosition && duration > 0 && (
              <div
                className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 bg-neutral-900/90 text-white text-[11px] font-mono rounded shadow border border-white/15 pointer-events-none"
                style={{ left: `${hoverPosition.x}px` }}
              >
                {formatTime(hoverPosition.time)}
              </div>
            )}

            {/* Track Background */}
            <div className="w-full h-1.5 group-hover:h-2.5 bg-white/25 rounded-full overflow-hidden relative transition-all">
              {/* Buffer Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-white/40 transition-all duration-200"
                style={{ width: `${bufferPercent}%` }}
              />
              {/* Progress Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-red-600"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Thumb Knob */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 group-hover:w-4.5 group-hover:h-4.5 bg-red-500 border border-white rounded-full shadow-lg transition-transform pointer-events-none"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* Bottom Toolbar Actions */}
          <div className="flex items-center justify-between gap-3 text-neutral-200 mt-1">
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Mini Play / Pause */}
              <button
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="p-1.5 hover:bg-white/15 rounded-lg transition"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              {/* Volume / Mute (desktop slider + mobile tap) */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="p-1.5 hover:bg-white/15 rounded-lg transition"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-red-400" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="hidden sm:inline-block w-16 md:w-20 accent-red-600 h-1 cursor-pointer bg-white/20 rounded-lg"
                  aria-label="Volume slider"
                />
              </div>

              {/* Time Display */}
              <div className="text-xs sm:text-sm font-mono text-neutral-300 drop-shadow select-none">
                <span>{formatTime(displayedTime)}</span>
                <span className="text-neutral-500 mx-1">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Playback Speed Button */}
              <button
                onClick={() => {
                  setShowSettingsModal(true);
                  setActiveSettingsTab('speed');
                }}
                className="px-2 py-1 hover:bg-white/15 rounded-lg text-xs font-semibold text-neutral-300 transition"
                title="Playback Speed"
              >
                {playbackRate === 1 ? '1x' : `${playbackRate}x`}
              </button>

              {/* Picture in Picture */}
              {pipSupported && (
                <button
                  onClick={togglePiP}
                  aria-label="Picture in Picture"
                  className="p-1.5 hover:bg-white/15 rounded-lg transition"
                  title="Picture in Picture"
                >
                  <PictureInPicture2 className="w-5 h-5" />
                </button>
              )}

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                className="p-1.5 hover:bg-white/15 rounded-lg transition"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────── Responsive Mobile / Desktop Settings Modal ──────────────── */}
      {showSettingsModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="w-full max-w-md bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950/40">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-red-500" />
                <h3 className="font-semibold text-white text-base">Playback Settings</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-neutral-800 bg-neutral-900/90 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveSettingsTab('audio')}
                className={`flex-1 min-w-[70px] py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
                  activeSettingsTab === 'audio'
                    ? 'border-red-600 text-red-400 bg-neutral-800/40'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <AudioLines className="w-4 h-4" />
                <span>Audio</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('subtitles')}
                className={`flex-1 min-w-[70px] py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
                  activeSettingsTab === 'subtitles'
                    ? 'border-red-600 text-red-400 bg-neutral-800/40'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Subtitles className="w-4 h-4" />
                <span>Subtitles</span>
              </button>
              {qualityLevels.length > 1 && (
                <button
                  onClick={() => setActiveSettingsTab('quality')}
                  className={`flex-1 min-w-[70px] py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
                    activeSettingsTab === 'quality'
                      ? 'border-red-600 text-red-400 bg-neutral-800/40'
                      : 'border-transparent text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Gauge className="w-4 h-4" />
                  <span>Quality</span>
                </button>
              )}
              <button
                onClick={() => setActiveSettingsTab('speed')}
                className={`flex-1 min-w-[70px] py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition flex items-center justify-center gap-1.5 ${
                  activeSettingsTab === 'speed'
                    ? 'border-red-600 text-red-400 bg-neutral-800/40'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Speed</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              {/* Audio Tab */}
              {activeSettingsTab === 'audio' && (
                <div className="space-y-1">
                  {audioTracks.length > 0 ? (
                    audioTracks.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => {
                          changeAudioTrack(track.id);
                          setShowSettingsModal(false);
                        }}
                        className={`w-full px-4 py-3 rounded-xl text-left text-sm flex items-center justify-between transition ${
                          currentAudioTrack === track.id
                            ? 'bg-red-950/40 text-red-400 border border-red-800/40'
                            : 'hover:bg-neutral-800/60 text-neutral-300'
                        }`}
                      >
                        <span className="font-medium">
                          {track.label} {track.language !== 'unknown' && `(${track.language})`}
                        </span>
                        {currentAudioTrack === track.id && <Check className="w-4 h-4 text-red-400" />}
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-6 text-neutral-400 text-sm">
                      <p>Default Audio Track active</p>
                      <p className="text-xs text-neutral-500 mt-1">No alternate audio streams detected.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Subtitles Tab */}
              {activeSettingsTab === 'subtitles' && (
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      changeSubtitleTrack(-1);
                      setShowSettingsModal(false);
                    }}
                    className={`w-full px-4 py-3 rounded-xl text-left text-sm flex items-center justify-between transition ${
                      currentSubtitleTrack === -1
                        ? 'bg-red-950/40 text-red-400 border border-red-800/40'
                        : 'hover:bg-neutral-800/60 text-neutral-300'
                    }`}
                  >
                    <span className="font-medium">Off</span>
                    {currentSubtitleTrack === -1 && <Check className="w-4 h-4 text-red-400" />}
                  </button>
                  {subtitleTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => {
                        changeSubtitleTrack(track.id);
                        setShowSettingsModal(false);
                      }}
                      className={`w-full px-4 py-3 rounded-xl text-left text-sm flex items-center justify-between transition ${
                        currentSubtitleTrack === track.id
                          ? 'bg-red-950/40 text-red-400 border border-red-800/40'
                          : 'hover:bg-neutral-800/60 text-neutral-300'
                      }`}
                    >
                      <span className="font-medium">
                        {track.label} {track.language !== 'unknown' && `(${track.language})`}
                      </span>
                      {currentSubtitleTrack === track.id && <Check className="w-4 h-4 text-red-400" />}
                    </button>
                  ))}
                  {subtitleTracks.length === 0 && (
                    <p className="text-center py-4 text-xs text-neutral-500">
                      No subtitle tracks available for this video.
                    </p>
                  )}
                </div>
              )}

              {/* Quality Tab */}
              {activeSettingsTab === 'quality' && (
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      changeQuality(-1);
                      setShowSettingsModal(false);
                    }}
                    className={`w-full px-4 py-3 rounded-xl text-left text-sm flex items-center justify-between transition ${
                      preferredLevel === -1
                        ? 'bg-red-950/40 text-red-400 border border-red-800/40'
                        : 'hover:bg-neutral-800/60 text-neutral-300'
                    }`}
                  >
                    <div>
                      <div className="font-medium">Auto (Recommended)</div>
                      {preferredLevel === -1 && activeLevel >= 0 && (
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Currently: {qualityLevels.find((l) => l.index === activeLevel)?.label ?? '—'}
                        </div>
                      )}
                    </div>
                    {preferredLevel === -1 && <Check className="w-4 h-4 text-red-400" />}
                  </button>
                  {qualityLevels.map((lvl) => (
                    <button
                      key={lvl.index}
                      onClick={() => {
                        changeQuality(lvl.index);
                        setShowSettingsModal(false);
                      }}
                      className={`w-full px-4 py-3 rounded-xl text-left text-sm flex items-center justify-between transition ${
                        preferredLevel === lvl.index
                          ? 'bg-red-950/40 text-red-400 border border-red-800/40'
                          : 'hover:bg-neutral-800/60 text-neutral-300'
                      }`}
                    >
                      <div>
                        <div className="font-medium">{lvl.label}</div>
                        {lvl.bitrate > 0 && (
                          <div className="text-xs text-neutral-500 mt-0.5">
                            {(lvl.bitrate / 1_000_000).toFixed(1)} Mbps
                          </div>
                        )}
                      </div>
                      {preferredLevel === lvl.index && <Check className="w-4 h-4 text-red-400" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Speed Tab */}
              {activeSettingsTab === 'speed' && (
                <div className="grid grid-cols-3 gap-2">
                  {PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        changePlaybackRate(rate);
                        setShowSettingsModal(false);
                      }}
                      className={`py-3 px-2 rounded-xl text-center text-sm font-semibold transition ${
                        playbackRate === rate
                          ? 'bg-red-600 text-white shadow-lg'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      {rate === 1 ? 'Normal (1x)' : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
