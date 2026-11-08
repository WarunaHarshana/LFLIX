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
  ExternalLink,
  Copy,
  Tv,
  Smartphone,
  Share2,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorVideoPlayer } from 'capacitor-video-player';
import { getServerUrl } from '@/lib/mobileConfig';

export type SubtitleFontOption = 'inter' | 'netflix' | 'montserrat';

export const SUBTITLE_FONTS: { id: SubtitleFontOption; label: string; fontStyle: string; family: string }[] = [
  {
    id: 'inter',
    label: 'Inter',
    fontStyle: "'Inter', sans-serif",
    family: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: 'netflix',
    label: 'Cinema',
    fontStyle: "'Netflix Sans', sans-serif",
    family: "'Netflix Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    fontStyle: "'Montserrat', sans-serif",
    family: "'Montserrat', system-ui, sans-serif",
  },
];

export const SUBTITLE_COLORS = [
  { label: 'White', value: '#ffffff', bgClass: 'bg-white' },
  { label: 'Yellow', value: '#e2e535', bgClass: 'bg-[#e2e535]' },
  { label: 'Blue', value: '#80b1fa', bgClass: 'bg-[#80b1fa]' },
  { label: 'Green', value: '#10b239', bgClass: 'bg-[#10b239]' },
];

export const SUBTITLE_SIZES = [
  { label: '80%', value: 80, sizeStr: 'clamp(0.85rem, 1.8vw, 1.35rem)' },
  { label: '100%', value: 100, sizeStr: 'clamp(1rem, 2.2vw, 1.65rem)' },
  { label: '125%', value: 125, sizeStr: 'clamp(1.2rem, 2.7vw, 2rem)' },
  { label: '150%', value: 150, sizeStr: 'clamp(1.4rem, 3.2vw, 2.4rem)' },
];

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

function buildHlsConfig(src: string, initialTime = 0): Record<string, unknown> {
  const local = isLocalSource(src);
  const startPosition = initialTime > 0 ? initialTime : -1;

  if (local) {
    return {
      enableWorker: true,
      progressive: true,
      startPosition,
      maxBufferLength: 24,
      maxMaxBufferLength: 48,
      maxBufferSize: 60 * 1000 * 1000,
      backBufferLength: 30,
      startFragPrefetch: false,
      lowLatencyMode: false,
      xhrSetup: (xhr: XMLHttpRequest) => {
        xhr.withCredentials = true;
      },
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 25_000,
          maxLoadTimeMs: 60_000,
          timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
          errorRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 3000 },
        },
      },
    };
  }

  return {
    enableWorker: true,
    progressive: true,
    startPosition,
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
        timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
        errorRetry: { maxNumRetry: 3, retryDelayMs: 500, maxRetryDelayMs: 2000 },
      },
    },
    manifestLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 8_000,
        maxLoadTimeMs: 15_000,
        timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
        errorRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
      },
    },
  };
}

export function isHlsSource(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || /\/api\/transcode(\?|$)/i.test(url) || /\/api\/hls(\?|$)/i.test(url);
}

export function isStreamIncompatible(
  src: string,
  videoCodec?: string | null,
  audioCodec?: string | null,
  fileName?: string | null
): boolean {
  if (isHlsSource(src)) return false;

  const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(audioCodec);
  const v = norm(videoCodec);
  const badAudio = ['ac3', 'eac3', 'ddp', 'dolby', 'dts', 'dtshd', 'truehd', 'mlp', 'flac', 'pcm', 'lpcm'];
  const badVideo = ['hevc', 'h265', 'x265', 'hev1', 'hvc1', 'vc1', 'mpeg2', 'wmv', 'vp6'];

  let ext = fileName ? fileName.split('.').pop()?.toLowerCase() : '';
  if (!ext && src) {
    try {
      const u = new URL(src, 'http://localhost');
      ext = u.pathname.split('.').pop()?.toLowerCase() || '';
    } catch {}
  }
  const badContainers = ['mkv', 'avi', 'wmv', 'flv', 'ts', 'm2ts', 'divx', 'xvid', 'mpg', 'mpeg', 'vob'];
  const isBadContainer = !!ext && badContainers.includes(ext);
  const fn = (fileName || '').toLowerCase();
  const hasBadCodecInName =
    fn.includes('hevc') ||
    fn.includes('x265') ||
    fn.includes('h265') ||
    fn.includes('10bit') ||
    fn.includes('truehd') ||
    fn.includes('dts');

  return (
    isBadContainer ||
    hasBadCodecInName ||
    (a !== '' && badAudio.some((c) => a.includes(c))) ||
    (v !== '' && badVideo.some((c) => v.includes(c)))
  );
}

export function buildApiUrlForSrc(src: string, base: string, extra?: Record<string, string>): string {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const u = new URL(src, origin);
    const params = new URLSearchParams();
    for (const k of ['token', 'contentType', 'contentId', 'episodeId', 'infoHash', 'fileIndex']) {
      const v = u.searchParams.get(k);
      if (v) params.set(k, v);
    }
    if (extra) {
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : '';
  } catch {
    return '';
  }
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

export interface ParsedSubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseVttTimestamp(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2].replace(',', '.'));
    return (isNaN(hours) ? 0 : hours * 3600) +
           (isNaN(minutes) ? 0 : minutes * 60) +
           (isNaN(seconds) ? 0 : seconds);
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1].replace(',', '.'));
    return (isNaN(minutes) ? 0 : minutes * 60) +
           (isNaN(seconds) ? 0 : seconds);
  }
  return 0;
}

export function parseWebVTT(vttText: string): ParsedSubtitleCue[] {
  const cues: ParsedSubtitleCue[] = [];
  if (!vttText) return cues;

  const cleaned = vttText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const blocks = cleaned.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx >= 0) {
      const match = lines[timeLineIdx].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
      if (match) {
        const start = parseVttTimestamp(match[1]);
        const end = parseVttTimestamp(match[2]);
        const text = lines
          .slice(timeLineIdx + 1)
          .join('\n')
          .replace(/<[^>]+>/g, '')
          .trim();
        if (text && end > start) {
          cues.push({ start, end, text });
        }
      }
    }
  }

  return cues;
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
  onPlaybackReady?: () => void;
  hideExternalPlayer?: boolean;
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
  onPlaybackReady,
  hideExternalPlayer = false,
}: Props) {
  const videoRef = useRef<ExtendedHTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isNative = Capacitor.isNativePlatform();

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

  // Floating HUD Notification State (Apple Design §12 & §16)
  const [hudNotification, setHudNotification] = useState<{
    id: number;
    text: string;
    icon: React.ReactNode;
  } | null>(null);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showHud = useCallback((text: string, icon: React.ReactNode) => {
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    setHudNotification({ id: Date.now(), text, icon });
    hudTimeoutRef.current = setTimeout(() => {
      setHudNotification(null);
    }, 1400);
  }, []);

  // Hold-to-2× Playback Speed State & Gesture
  const [isHoldingSpeed, setIsHoldingSpeed] = useState(false);
  const speedHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousSpeedRef = useRef<number>(1);

  // Tracks & settings
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'audio' | 'subtitles' | 'quality' | 'speed'>('audio');
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string; language: string }[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; label: string; language: string; url: string }[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState<number>(-1);
  const [activeCueText, setActiveCueText] = useState<string>('');
  const cuesRef = useRef<ParsedSubtitleCue[]>([]);

  const updateActiveCue = useCallback((timeInSeconds: number) => {
    const cues = cuesRef.current;
    if (cues.length === 0) {
      setActiveCueText((prev) => (prev ? '' : prev));
      return;
    }
    const matching = cues.filter((c) => timeInSeconds >= c.start && timeInSeconds <= c.end);
    const text = matching.map((c) => c.text).join('\n');
    setActiveCueText((prev) => (prev !== text ? text : prev));
  }, []);

  // Fetch and parse WebVTT cues for active subtitle track
  useEffect(() => {
    if (isNative) return;
    if (currentSubtitleTrack < 0 || !subtitleTracks[currentSubtitleTrack]) {
      cuesRef.current = [];
      setActiveCueText('');
      return;
    }

    const track = subtitleTracks[currentSubtitleTrack];
    let cancelled = false;

    fetch(track.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((vttText) => {
        if (cancelled) return;
        const parsed = parseWebVTT(vttText);
        cuesRef.current = parsed;
        const video = videoRef.current;
        if (video) {
          updateActiveCue(video.currentTime);
        }
      })
      .catch((err) => {
        console.warn('[subtitles] Failed to fetch or parse subtitle track:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [currentSubtitleTrack, subtitleTracks, isNative, updateActiveCue]);

  // Subtitle styling & appearance state (adapted from modern high-contrast streaming player styling)
  const [subtitleFont, setSubtitleFont] = useState<SubtitleFontOption>('inter');
  const [subtitleColor, setSubtitleColor] = useState<string>('#ffffff');
  const [subtitleSize, setSubtitleSize] = useState<number>(100);
  const [subtitleBg, setSubtitleBg] = useState<boolean>(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lflix-subtitle-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.font) setSubtitleFont(parsed.font);
        if (parsed.color) setSubtitleColor(parsed.color);
        if (parsed.size) setSubtitleSize(parsed.size);
        if (typeof parsed.background === 'boolean') setSubtitleBg(parsed.background);
      }
    } catch {}
  }, []);

  const updateSubtitleSetting = (key: 'font' | 'color' | 'size' | 'background', val: any) => {
    try {
      const current = {
        font: subtitleFont,
        color: subtitleColor,
        size: subtitleSize,
        background: subtitleBg,
        [key]: val,
      };
      if (key === 'font') setSubtitleFont(val);
      if (key === 'color') setSubtitleColor(val);
      if (key === 'size') setSubtitleSize(val);
      if (key === 'background') setSubtitleBg(val);
      localStorage.setItem('lflix-subtitle-settings', JSON.stringify(current));
    } catch {}
  };

  const activeSubFont = SUBTITLE_FONTS.find((f) => f.id === subtitleFont) || SUBTITLE_FONTS[0];
  const activeSubSize = SUBTITLE_SIZES.find((s) => s.value === subtitleSize) || SUBTITLE_SIZES[1];

  const [qualityLevels, setQualityLevels] = useState<{ index: number; label: string; height: number; bitrate: number }[]>([]);
  const [activeLevel, setActiveLevel] = useState<number>(-1);
  const [preferredLevel, setPreferredLevel] = useState<number>(-1);
  const [pipSupported, setPipSupported] = useState(false);
  const [hdrSupported, setHdrSupported] = useState<boolean | null>(null);
  const [nativePlayerMsg, setNativePlayerMsg] = useState<string | null>(null);
  const [showExternalPlayerModal, setShowExternalPlayerModal] = useState(false);
  const [copiedStreamLink, setCopiedStreamLink] = useState(false);
  const [isMobileClient, setIsMobileClient] = useState(false);
  const [isAndroidClient, setIsAndroidClient] = useState(false);
  const [isIOSClient, setIsIOSClient] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isTouch = !/Windows NT/i.test(ua) && ((navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window));
    setIsMobileClient(isMobileDevice || isIPad || isTouch);
    setIsAndroidClient(/Android/i.test(ua));
    setIsIOSClient(/iPhone|iPad|iPod/i.test(ua) || isIPad);
  }, []);

  // Resolves the full authenticated direct HTTP stream URL for external players
  const getDirectStreamUrl = useCallback(async (): Promise<string> => {
    try {
      const parsedUrl = new URL(src, window.location.origin);
      const contentType = parsedUrl.searchParams.get('contentType');
      const contentId = parsedUrl.searchParams.get('contentId');
      const episodeId = parsedUrl.searchParams.get('episodeId');
      let token = parsedUrl.searchParams.get('token');

      // If token is missing, generate a 24-hour token so external players (VLC, MX Player)
      // bypass browser cookie requirements in middleware.ts
      if (!token && contentType && contentId) {
        try {
          const res = await fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              contentType,
              contentId: parseInt(contentId, 10),
              episodeId: episodeId ? parseInt(episodeId, 10) : undefined,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            token = data.token || null;
          }
        } catch {
          /* ignore */
        }
      }

      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (contentType) params.set('contentType', contentType);
      if (contentId) params.set('contentId', contentId);
      if (episodeId) params.set('episodeId', episodeId);

      const qs = params.toString();
      return `${window.location.origin}/api/stream${qs ? `?${qs}` : ''}`;
    } catch {
      return `${window.location.origin}${src}`;
    }
  }, [src]);

  // Plays on the PC screen (calls host /api/play)
  const handlePlayOnHostPc = async () => {
    try {
      const parsedUrl = new URL(src, window.location.origin);
      const contentType = parsedUrl.searchParams.get('contentType');
      const contentId = parsedUrl.searchParams.get('contentId');
      const episodeId = parsedUrl.searchParams.get('episodeId');
      const currentPos = videoRef.current?.currentTime || initialTime || 0;

      if (contentType && contentId) {
        const res = await fetch('/api/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            contentType,
            contentId: parseInt(contentId, 10),
            episodeId: episodeId ? parseInt(episodeId, 10) : undefined,
            startTime: Math.floor(currentPos),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          if (videoRef.current) videoRef.current.pause();
          setNativePlayerMsg(`Playing on Host PC (${data.message || 'Player'})`);
          setTimeout(() => setNativePlayerMsg(null), 4000);
          setShowExternalPlayerModal(false);
          return;
        } else {
          setNativePlayerMsg(`Failed to launch on PC: ${data.error || 'Error'}`);
          setTimeout(() => setNativePlayerMsg(null), 4000);
        }
      } else {
        // Direct stream or torrent stream
        const fullStreamUrl = src.startsWith('http') ? src : `${window.location.origin}${src}`;
        const res = await fetch('/api/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            streamUrl: fullStreamUrl,
            startTime: Math.floor(currentPos),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          if (videoRef.current) videoRef.current.pause();
          setNativePlayerMsg(`Playing on Host PC (${data.message || 'Player'})`);
          setTimeout(() => setNativePlayerMsg(null), 4000);
          setShowExternalPlayerModal(false);
          return;
        } else {
          setNativePlayerMsg(`Failed to launch on PC: ${data.error || 'Error'}`);
          setTimeout(() => setNativePlayerMsg(null), 4000);
        }
      }
    } catch (err: any) {
      setNativePlayerMsg(`Error: ${err?.message || 'Failed to play'}`);
      setTimeout(() => setNativePlayerMsg(null), 4000);
    }
  };

  // Opens mobile VLC via custom intent or URL scheme
  const handleOpenMobileVlc = async () => {
    try {
      const streamUrl = await getDirectStreamUrl();
      if (videoRef.current) videoRef.current.pause();

      const hostAndPath = streamUrl.replace(/^https?:\/\//, '');
      if (isAndroidClient) {
        const intentUrl = `intent://${hostAndPath}#Intent;scheme=http;type=video/*;package=org.videolan.vlc;action=android.intent.action.VIEW;end`;
        window.location.href = intentUrl;
      } else if (isIOSClient) {
        window.location.href = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(streamUrl)}`;
      } else {
        window.location.href = `vlc://${streamUrl}`;
      }
      setNativePlayerMsg('Opening in VLC Mobile...');
      setTimeout(() => setNativePlayerMsg(null), 4000);
      setShowExternalPlayerModal(false);
    } catch {
      setNativePlayerMsg('Failed to open VLC');
      setTimeout(() => setNativePlayerMsg(null), 4000);
    }
  };

  // Opens MX Player on Android
  const handleOpenMobileMxPlayer = async () => {
    try {
      const streamUrl = await getDirectStreamUrl();
      if (videoRef.current) videoRef.current.pause();

      const hostAndPath = streamUrl.replace(/^https?:\/\//, '');
      const intentUrl = `intent://${hostAndPath}#Intent;scheme=http;type=video/*;package=com.mxtech.videoplayer.ad;action=android.intent.action.VIEW;end`;
      window.location.href = intentUrl;

      setNativePlayerMsg('Opening in MX Player...');
      setTimeout(() => setNativePlayerMsg(null), 4000);
      setShowExternalPlayerModal(false);
    } catch {
      setNativePlayerMsg('Failed to open MX Player');
      setTimeout(() => setNativePlayerMsg(null), 4000);
    }
  };

  // Opens native Android app chooser dialog
  const handleOpenAnyPlayer = async () => {
    try {
      const streamUrl = await getDirectStreamUrl();
      if (videoRef.current) videoRef.current.pause();

      if (isAndroidClient) {
        const hostAndPath = streamUrl.replace(/^https?:\/\//, '');
        const intentUrl = `intent://${hostAndPath}#Intent;scheme=http;type=video/*;action=android.intent.action.VIEW;end`;
        window.location.href = intentUrl;
      } else {
        window.open(streamUrl, '_blank');
      }
      setShowExternalPlayerModal(false);
    } catch {
      /* ignore */
    }
  };

  // Copies direct stream link to clipboard for VLC, Infuse, Kodi, or casting
  const handleCopyStreamLink = async () => {
    try {
      const streamUrl = await getDirectStreamUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(streamUrl);
      } else {
        window.prompt('Copy stream URL:', streamUrl);
      }
      setCopiedStreamLink(true);
      setNativePlayerMsg('Stream link copied! Paste into VLC Network Stream');
      setTimeout(() => {
        setCopiedStreamLink(false);
        setNativePlayerMsg(null);
      }, 4000);
    } catch {
      const streamUrl = await getDirectStreamUrl();
      window.prompt('Copy stream URL:', streamUrl);
    }
  };

  const handleExternalPlayerButtonClick = (e: React.MouseEvent) => {
    if (isMobileClient || e.shiftKey) {
      setShowExternalPlayerModal(true);
    } else {
      handlePlayOnHostPc();
    }
  };

  const [activeSrc, setActiveSrc] = useState<string>(() => {
    if (!isNative && isStreamIncompatible(src, videoCodec, audioCodec, fileName)) {
      return buildApiUrlForSrc(src, '/api/transcode') || src;
    }
    return src;
  });
  const [didFallback, setDidFallback] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const hlsRef = useRef<any>(null);

  // Helper to build parameterized API URLs forwarding stream tokens
  const buildApiUrl = useCallback(
    (base: string, extra?: Record<string, string>): string => {
      return buildApiUrlForSrc(src, base, extra);
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

  // Codec checks and transcode route resolution when props update
  useEffect(() => {
    setDidFallback(false);
    if (!isNative && isStreamIncompatible(src, videoCodec, audioCodec, fileName)) {
      const transcodeUrl = buildApiUrlForSrc(src, '/api/transcode');
      setActiveSrc(transcodeUrl || src);
    } else {
      setActiveSrc(src);
    }
  }, [src, isNative, audioCodec, videoCodec, fileName]);

  // Attach HLS engine for HLS / transcode streams
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    if (!video) return;
    if (!isHlsSource(activeSrc)) return;

    setQualityLevels([]);
    setActiveLevel(-1);

    let hls: any;
    let cancelled = false;
    let connectWatchdog: NodeJS.Timeout | null = null;

    if (onFatalError) {
      connectWatchdog = setTimeout(() => {
        if (!cancelled) {
          try {
            if (hlsRef.current) hlsRef.current.destroy();
          } catch {
            /* ignore */
          }
          setError('Stream connection timed out.');
          onFatalError('connect-timeout');
        }
      }, 15000);
    }

    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled || !videoRef.current) return;

        // Prioritize MSE / hls.js on all browsers that support it (including Android Chrome).
        // On Android, video.canPlayType('application/vnd.apple.mpegurl') returns 'maybe',
        // but Android Chrome's native player fails on transcode streams with error 4 (MEDIA_ERR_SRC_NOT_SUPPORTED).
        // MediaSource Extensions (Hls.isSupported()) work reliably on Android Chrome.
        if (Hls.isSupported()) {
          hls = new Hls(buildHlsConfig(activeSrc, initialTime));
          hlsRef.current = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, (_e: any, data: any) => {
            if (connectWatchdog) {
              clearTimeout(connectWatchdog);
              connectWatchdog = null;
            }
            onPlaybackReady?.();

            const levels = (data?.levels || []).map((lvl: any, index: number) => {
              const is4k = (lvl.height && lvl.height >= 2160) || (lvl.width && lvl.width >= 3840);
              const label = is4k
                ? '4K (2160p)'
                : lvl.height
                  ? `${lvl.height}p`
                  : `${Math.round((lvl.bitrate || 0) / 1000)}k`;
              return {
                index,
                label,
                height: lvl.height || 0,
                bitrate: lvl.bitrate || 0,
              };
            });
            levels.sort((x: any, y: any) => y.height - x.height || y.bitrate - x.bitrate);
            setQualityLevels(levels);

            // If a 4K level is available (e.g. Cinejoy Lisbon), prefer 4K quality by default
            const fourKLevel = levels.find((l: any) => l.height >= 2160);
            if (fourKLevel) {
              hls.currentLevel = fourKLevel.index;
              setPreferredLevel(fourKLevel.index);
            }

            // Note: Hls.js startPosition initializes fragment loading directly at initialTime,
            // avoiding the duplicate initial fragment download caused by post-manifest seeks.
            videoRef.current?.play().catch(() => {});
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_e: any, data: any) => {
            setActiveLevel(typeof data?.level === 'number' ? data.level : -1);
          });

          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
            videoRef.current.load();
          }
          hls.loadSource(activeSrc);
          hls.attachMedia(videoRef.current);

          let networkErrorRetries = 0;
          let mediaErrorRetries = 0;

          hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
            if (!data?.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              networkErrorRetries += 1;
              if (networkErrorRetries <= 2) {
                hls.startLoad();
              } else {
                if (connectWatchdog) {
                  clearTimeout(connectWatchdog);
                  connectWatchdog = null;
                }
                setError('Playback encountered a network error.');
                try {
                  hls.destroy();
                } catch {
                  /* ignore */
                }
                onFatalError?.('hls-network-fatal');
              }
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              mediaErrorRetries += 1;
              if (mediaErrorRetries === 1) {
                hls.recoverMediaError();
              } else if (mediaErrorRetries === 2) {
                try {
                  hls.swapAudioCodec?.();
                } catch {
                  /* ignore */
                }
                hls.recoverMediaError();
              } else {
                if (connectWatchdog) {
                  clearTimeout(connectWatchdog);
                  connectWatchdog = null;
                }
                setError('Playback encountered a media decode error.');
                try {
                  hls.destroy();
                } catch {
                  /* ignore */
                }
                onFatalError?.('hls-media-fatal');
              }
            } else {
              if (connectWatchdog) {
                clearTimeout(connectWatchdog);
                connectWatchdog = null;
              }
              setError('Playback encountered an error.');
              try {
                hls.destroy();
              } catch {
                /* ignore */
              }
              onFatalError?.('hls-fatal');
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS fallback for Apple devices (iOS Safari, macOS Safari) where MSE is unavailable
          video.src = activeSrc;
          if (initialTime > 0) {
            video.currentTime = initialTime;
          }
          video.play().catch(() => {});
        } else {
          if (connectWatchdog) {
            clearTimeout(connectWatchdog);
            connectWatchdog = null;
          }
          setError('This browser cannot play the stream.');
          onFatalError?.('unsupported-browser');
        }
      })
      .catch(() => {
        if (connectWatchdog) {
          clearTimeout(connectWatchdog);
          connectWatchdog = null;
        }
        setError('Failed to load streaming engine.');
        onFatalError?.('engine-load-failed');
      });

    return () => {
      cancelled = true;
      if (connectWatchdog) {
        clearTimeout(connectWatchdog);
        connectWatchdog = null;
      }
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {
          /* ignore */
        }
        hlsRef.current = null;
      }
      if (videoRef.current && isHlsSource(activeSrc)) {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [activeSrc, isNative, initialTime, onFatalError, onPlaybackReady, reloadKey]);

  // Subtitle auto-discovery / explicit track loading
  useEffect(() => {
    if (isNative) return;

    if (subtitles && subtitles.length > 0) {
      const mapped = subtitles.map((t, i) => ({
        id: i,
        label: t.label || `Subtitle ${i + 1}`,
        language: t.language || 'unknown',
        url: t.url,
      }));
      setSubtitleTracks(mapped);

      // Auto-select English or preferred track by default
      try {
        const prefEnabled = localStorage.getItem('lflix-subtitle-enabled');
        if (prefEnabled !== 'false') {
          const prefLang = localStorage.getItem('lflix-subtitle-lang');
          let chosenIndex = 0;
          if (prefLang) {
            const matchIdx = mapped.findIndex((t) => t.language.toLowerCase().startsWith(prefLang.toLowerCase()));
            if (matchIdx >= 0) chosenIndex = matchIdx;
          } else {
            const enIdx = mapped.findIndex((t) => t.language.toLowerCase().startsWith('en') || t.label.toLowerCase().includes('english'));
            if (enIdx >= 0) chosenIndex = enIdx;
          }
          setCurrentSubtitleTrack(chosenIndex);
        }
      } catch {}
      return;
    }

    const listUrl = buildApiUrl('/api/subtitles', { list: '1' });
    if (!listUrl) return;

    let cancelled = false;
    fetch(listUrl, { credentials: 'include' })
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

        try {
          const prefEnabled = localStorage.getItem('lflix-subtitle-enabled');
          if (prefEnabled !== 'false' && tracks.length > 0) {
            const prefLang = localStorage.getItem('lflix-subtitle-lang');
            let chosenIndex = 0;
            if (prefLang) {
              const matchIdx = tracks.findIndex((t: any) => t.language.toLowerCase().startsWith(prefLang.toLowerCase()));
              if (matchIdx >= 0) chosenIndex = matchIdx;
            } else {
              const enIdx = tracks.findIndex((t: any) => t.language.toLowerCase().startsWith('en') || t.label.toLowerCase().includes('english'));
              if (enIdx >= 0) chosenIndex = enIdx;
            }
            setCurrentSubtitleTrack(chosenIndex);
          }
        } catch {}

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

  // Synchronize text tracks mode with currentSubtitleTrack state whenever tracks load or selection changes
  useEffect(() => {
    if (isNative) return;
    const video = videoRef.current;
    if (!video || subtitleTracks.length === 0) return;

    const trackEls = video.querySelectorAll('track');
    trackEls.forEach((el, i) => {
      if (el.track) {
        el.track.mode = i === currentSubtitleTrack ? 'hidden' : 'disabled';
      }
    });

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (currentSubtitleTrack === -1) {
        track.mode = 'disabled';
      } else if (currentSubtitleTrack < subtitleTracks.length) {
        const target = subtitleTracks[currentSubtitleTrack];
        if (i === currentSubtitleTrack || (target && track.label === target.label)) {
          track.mode = 'hidden';
        } else {
          track.mode = 'disabled';
        }
      }
    }
  }, [subtitleTracks, currentSubtitleTrack, isNative]);

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
      onPlaybackReady?.();
    };
    const onCanPlay = () => {
      setLoading(false);
      setIsBuffering(false);
      setError(null);
      onPlaybackReady?.();
    };
    const onTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(video.currentTime);
      }
      updateActiveCue(video.currentTime);

      // Auto-fallback if audio is advancing but no visual frames can be rendered (e.g. HEVC/x265 in Chrome)
      if (
        !didFallback &&
        !isHlsSource(activeSrc) &&
        video.currentTime > 1.2 &&
        video.videoWidth === 0 &&
        video.videoHeight === 0
      ) {
        const transcodeUrl = buildApiUrl('/api/transcode', {
          duration: video.duration > 0 ? String(Math.floor(video.duration)) : '',
        });
        if (transcodeUrl) {
          setDidFallback(true);
          setError(null);
          setLoading(true);
          try {
            video.pause();
            video.removeAttribute('src');
            video.load();
          } catch {}
          setReloadKey((k) => k + 1);
          setActiveSrc(transcodeUrl);
          return;
        }
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
    const onSeeked = () => {
      updateActiveCue(video.currentTime);
    };
    const onSeeking = () => {
      updateActiveCue(video.currentTime);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('seeking', onSeeking);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('seeking', onSeeking);
    };
  }, [isNative, isScrubbing, onPlaybackReady, scheduleHideControls, updateActiveCue]);

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
          try {
            video.pause();
            video.removeAttribute('src');
            video.load();
          } catch {}
          setReloadKey((k) => k + 1);
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
      if (onFatalError) {
        onFatalError(`video-error-${errorCode || 'unknown'}`);
      }
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

    if (index === -1) {
      try {
        localStorage.setItem('lflix-subtitle-enabled', 'false');
      } catch {}
      cuesRef.current = [];
      setActiveCueText('');
    } else if (subtitleTracks[index]) {
      try {
        localStorage.setItem('lflix-subtitle-enabled', 'true');
        if (subtitleTracks[index].language && subtitleTracks[index].language !== 'unknown') {
          localStorage.setItem('lflix-subtitle-lang', subtitleTracks[index].language);
        }
      } catch {}
    }

    if (video) {
      // 1. Enable/disable HTMLTrackElements directly
      const trackEls = video.querySelectorAll('track');
      trackEls.forEach((el, i) => {
        if (el.track) {
          el.track.mode = i === index ? 'hidden' : 'disabled';
        }
      });

      // 2. Enable/disable video.textTracks
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (index === -1) {
          track.mode = 'disabled';
        } else if (index < subtitleTracks.length) {
          const target = subtitleTracks[index];
          if (i === index || (target && track.label === target.label)) {
            track.mode = 'hidden';
          } else {
            track.mode = 'disabled';
          }
        }
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
        case 'Enter':
        case 'k':
        case 'K':
        case 'MediaPlayPause':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'MediaPlay':
          e.preventDefault();
          if (videoRef.current && videoRef.current.paused) videoRef.current.play();
          break;
        case 'MediaPause':
          e.preventDefault();
          if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
        case 'MediaRewind':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
        case 'MediaFastForward':
          e.preventDefault();
          seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          const nextVolUp = Math.min(1, Math.round((volume + 0.05) * 100) / 100);
          setVolume(nextVolUp);
          showHud(`${Math.round(nextVolUp * 100)}%`, <Volume2 className="w-4 h-4 text-white" />);
          break;
        case 'ArrowDown':
          e.preventDefault();
          const nextVolDown = Math.max(0, Math.round((volume - 0.05) * 100) / 100);
          setVolume(nextVolDown);
          showHud(
            nextVolDown === 0 ? 'Muted' : `${Math.round(nextVolDown * 100)}%`,
            nextVolDown === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume1 className="w-4 h-4 text-white" />
          );
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          showHud(
            isMuted ? 'Unmuted' : 'Muted',
            isMuted ? <Volume2 className="w-4 h-4 text-white" /> : <VolumeX className="w-4 h-4 text-red-400" />
          );
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
  }, [isNative, onClose, volume, isMuted, showHud]);

  // Hold-to-2× Speed Pointer Handlers
  const handlePointerDownCanvas = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, .controls-bar, .player-glass-popover')) return;

    previousSpeedRef.current = videoRef.current?.playbackRate || playbackRate || 1;
    speedHoldTimerRef.current = setTimeout(() => {
      setIsHoldingSpeed(true);
      if (videoRef.current) {
        videoRef.current.playbackRate = 2;
        showHud('2× Speed', <Gauge className="w-4 h-4 text-amber-400" />);
      }
    }, 350);
  };

  const handlePointerUpCanvas = () => {
    if (speedHoldTimerRef.current) {
      clearTimeout(speedHoldTimerRef.current);
      speedHoldTimerRef.current = null;
    }
    if (isHoldingSpeed) {
      setIsHoldingSpeed(false);
      if (videoRef.current) {
        videoRef.current.playbackRate = previousSpeedRef.current;
        showHud(`${previousSpeedRef.current}× Speed`, <Gauge className="w-4 h-4 text-white" />);
      }
    }
  };

  // Touch screen tap / double-tap handling on the video area
  const handleVideoAreaTouchOrClick = (e: React.MouseEvent | React.TouchEvent) => {
    // If hold-to-2x gesture just finished, suppress click
    if (isHoldingSpeed) return;
    // Don't trigger if interacting with controls overlay directly
    if ((e.target as HTMLElement).closest('button, input, select, .controls-bar, .player-glass-popover')) return;

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
      className="lflix-player-container fixed inset-0 z-[100] bg-black select-none overflow-hidden touch-none"
    >
      {/* Dynamic Subtitle Style Injection matching modern high-contrast typography */}
      <style>{`
        .lflix-player-container video::cue {
          color: ${subtitleColor} !important;
          font-family: ${activeSubFont.family} !important;
          font-size: ${activeSubSize.sizeStr} !important;
          background-color: ${subtitleBg ? 'rgba(0, 0, 0, 0.75)' : 'transparent'} !important;
          text-shadow: ${
            subtitleBg
              ? '0 0 4px #000000, 0 2px 4px rgba(0, 0, 0, 0.9)'
              : '0 0 4px #000000, 0 2px 4px rgba(0, 0, 0, 0.95), -1px -1px 2px #000000, 1px -1px 2px #000000, -1px 1px 2px #000000, 1px 1px 2px #000000, 0 0 8px #000000'
          } !important;
          line-height: 1.35 !important;
          font-weight: 600 !important;
          border-radius: 4px !important;
          padding: 0.25em 0.6em !important;
          box-decoration-break: clone !important;
          -webkit-box-decoration-break: clone !important;
        }
      `}</style>

      {/* ──────────────── Video Element (Full Bleed) ──────────────── */}
      <div
        className="absolute inset-0 w-full h-full flex items-center justify-center cursor-pointer select-none"
        onClick={handleVideoAreaTouchOrClick}
        onTouchEnd={handleVideoAreaTouchOrClick}
        onPointerDown={handlePointerDownCanvas}
        onPointerUp={handlePointerUpCanvas}
        onPointerLeave={handlePointerUpCanvas}
      >
        <video
          key={reloadKey}
          ref={videoRef}
          crossOrigin="anonymous"
          src={isHlsSource(activeSrc) ? undefined : activeSrc}
          autoPlay
          playsInline
          className={`w-full h-full ${
            aspectRatio === 'cover' ? 'object-cover' : 'object-contain'
          } transition-[object-fit] duration-300 pointer-events-none`}
          onError={handleError}
        >
          {subtitleTracks.map((track, i) => (
            <track
              key={track.id}
              id={`lflix-sub-${track.id}`}
              kind="subtitles"
              src={track.url}
              srcLang={(track.language || 'und').slice(0, 3)}
              label={track.label}
              default={currentSubtitleTrack === i}
            />
          ))}
        </video>
      </div>

      {/* ──────────────── Custom High-Legibility Subtitle Overlay ──────────────── */}
      {activeCueText && currentSubtitleTrack >= 0 && (
        <div
          className="absolute left-0 right-0 flex justify-center pointer-events-none z-30 px-4 transition-all duration-200"
          style={{
            bottom: showControls ? '6.5rem' : '3rem',
          }}
        >
          <div
            className="inline-block transition-all select-none"
            style={{
              color: subtitleColor,
              fontFamily: activeSubFont.family,
              fontSize: activeSubSize.sizeStr,
              backgroundColor: subtitleBg ? 'rgba(0, 0, 0, 0.75)' : 'transparent',
              textShadow: subtitleBg
                ? '0 0 4px #000000, 0 2px 4px rgba(0, 0, 0, 0.9)'
                : '0 0 4px #000000, 0 2px 4px rgba(0, 0, 0, 0.95), -1px -1px 2px #000000, 1px -1px 2px #000000, -1px 1px 2px #000000, 1px 1px 2px #000000, 0 0 8px #000000',
              fontWeight: 600,
              lineHeight: 1.35,
              padding: '0.25em 0.6em',
              borderRadius: '4px',
              textAlign: 'center',
              maxWidth: '85%',
              whiteSpace: 'pre-line',
            }}
          >
            {activeCueText}
          </div>
        </div>
      )}

      {/* ──────────────── Apple-Style Floating Top HUD Notification ──────────────── */}
      {hudNotification && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 player-hud-pill px-4 py-2 rounded-full pointer-events-none animate-fadeIn select-none shadow-2xl">
          {hudNotification.icon}
          <span className="text-white text-xs font-semibold tracking-wider uppercase font-mono">
            {hudNotification.text}
          </span>
        </div>
      )}

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
                  setDidFallback(true);
                  const t = buildApiUrl('/api/transcode', { _t: Date.now().toString() });
                  if (t) setActiveSrc(t);
                  setReloadKey((k) => k + 1);
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
            {/* Play in MPV / VLC or External App Button */}
            {!hideExternalPlayer && (
              <button
                onClick={handleExternalPlayerButtonClick}
                aria-label={isMobileClient ? 'External Player' : 'Play in MPV / VLC'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800/90 hover:bg-neutral-700 border border-white/20 rounded-full text-xs font-semibold text-white transition active:scale-95 shadow-md"
                title={
                  isMobileClient
                    ? 'Play in VLC or external mobile player (0% server buffering)'
                    : 'Play in MPV / VLC player for 100% untouched 4K quality with zero lag (Shift+Click for stream options)'
                }
              >
                {isMobileClient ? (
                  <>
                    <ExternalLink className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs">External App</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-red-500" />
                    <span className="hidden sm:inline">Play in VLC/MPV</span>
                  </>
                )}
              </button>
            )}

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

            {/* Quick Subtitles Button */}
            {subtitleTracks.length > 0 && (
              <button
                onClick={() => {
                  setShowSettingsModal(true);
                  setActiveSettingsTab('subtitles');
                }}
                aria-label="Subtitles"
                className={`p-2 hover:bg-white/15 rounded-full transition active:scale-95 relative ${
                  currentSubtitleTrack >= 0 ? 'text-red-500' : 'text-neutral-300'
                }`}
                title={`Subtitles: ${currentSubtitleTrack >= 0 ? subtitleTracks[currentSubtitleTrack]?.label || 'On' : 'Off'}`}
              >
                <Subtitles className="w-5 h-5" />
                {currentSubtitleTrack >= 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            )}

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

        {/* ── Native Player Toast ── */}
        {nativePlayerMsg && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-black/90 text-emerald-400 border border-emerald-500/40 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl backdrop-blur-md pointer-events-auto">
            {nativePlayerMsg}
          </div>
        )}

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
            className="group/progress relative w-full h-8 flex items-center cursor-pointer select-none touch-none py-2"
            role="slider"
            aria-label="Seek time"
            aria-valuemin={0}
            aria-valuemax={duration || 100}
            aria-valuenow={currentTime}
          >
            {/* Hover Tooltip - Floating Frosted Pill */}
            {hoverPosition && duration > 0 && (
              <div
                className="absolute -top-9 -translate-x-1/2 player-hud-pill px-3 py-1 rounded-full text-xs text-white pointer-events-none whitespace-nowrap shadow-xl font-mono font-medium tracking-wide z-40 transition-transform duration-75"
                style={{ left: `${hoverPosition.x}px` }}
              >
                {formatTime(hoverPosition.time)}
              </div>
            )}

            {/* Background Track with Dynamic Height Transition */}
            <div className="relative w-full h-1 group-hover/progress:h-2 transition-[height] duration-150 rounded-full bg-white/20 overflow-hidden">
              {/* Buffer Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-white/35 rounded-full transition-[width] duration-200"
                style={{ width: `${bufferPercent}%` }}
              />
              {/* Progress Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-red-600 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Thumb Knob */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 border-2 border-white rounded-full shadow-lg scale-0 group-hover/progress:scale-100 transition-transform duration-150 ease-out pointer-events-none z-30"
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
                className="p-1.5 hover:bg-white/15 active:scale-95 rounded-lg transition-transform duration-100"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              {/* Hover-Expanding Volume Control */}
              <div className="flex items-center group/vol relative">
                <button
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="p-1.5 hover:bg-white/15 active:scale-95 rounded-lg transition-transform duration-100"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-red-400" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <div className="w-0 group-hover/vol:w-20 sm:group-hover/vol:w-24 overflow-hidden transition-all duration-200 ease-out flex items-center h-8 -ml-1 pl-1">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setVolume(val);
                      showHud(`${Math.round(val * 100)}%`, <Volume2 className="w-4 h-4 text-white" />);
                    }}
                    className="w-16 sm:w-20 accent-red-600 h-1 cursor-pointer bg-white/25 rounded-lg"
                    aria-label="Volume slider"
                  />
                </div>
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
                className="px-2 py-1 hover:bg-white/15 active:scale-95 rounded-lg text-xs font-semibold text-neutral-300 transition-all duration-100"
                title="Playback Speed"
              >
                {playbackRate === 1 ? '1x' : `${playbackRate}x`}
              </button>

              {/* Settings Button */}
              <button
                onClick={() => setShowSettingsModal((prev) => !prev)}
                aria-label="Playback Settings"
                className="p-1.5 hover:bg-white/15 active:scale-95 rounded-lg transition-all duration-100 text-neutral-300 hover:text-white"
                title="Playback Settings"
              >
                <Settings2 className="w-5 h-5" />
              </button>

              {/* Picture in Picture */}
              {pipSupported && (
                <button
                  onClick={togglePiP}
                  aria-label="Picture in Picture"
                  className="p-1.5 hover:bg-white/15 active:scale-95 rounded-lg transition-all duration-100"
                  title="Picture in Picture"
                >
                  <PictureInPicture2 className="w-5 h-5" />
                </button>
              )}

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                className="p-1.5 hover:bg-white/15 active:scale-95 rounded-lg transition-all duration-100"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────── Responsive Floating Contextual Settings Popover ──────────────── */}
      {showSettingsModal && (
        <>
          {/* Subtle click-outside backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity"
            onClick={() => setShowSettingsModal(false)}
          />

          {/* Contextual Popover Container anchored above bottom toolbar */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Playback Settings"
            className="absolute bottom-20 right-3 sm:right-6 w-[calc(100%-1.5rem)] sm:w-96 max-w-sm player-glass-popover z-50 overflow-hidden flex flex-col max-h-[75vh] animate-fadeIn shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{
              transition: 'height 0.28s var(--player-spring)',
            }}
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between p-3.5 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-red-500" />
                <h3 className="font-semibold text-white text-sm">Playback Settings</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                aria-label="Close settings"
                className="p-1.5 hover:bg-white/10 active:scale-95 rounded-full text-neutral-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-white/10 bg-white/[0.02] overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveSettingsTab('audio')}
                className={`flex-1 min-w-[65px] py-2 px-2.5 text-xs sm:text-sm font-medium border-b-2 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeSettingsTab === 'audio'
                    ? 'border-red-500 text-white font-bold bg-white/[0.08]'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]'
                }`}
              >
                <AudioLines className="w-4 h-4" />
                <span>Audio</span>
              </button>
              <button
                onClick={() => setActiveSettingsTab('subtitles')}
                className={`flex-1 min-w-[65px] py-2 px-2.5 text-xs sm:text-sm font-medium border-b-2 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeSettingsTab === 'subtitles'
                    ? 'border-red-500 text-white font-bold bg-white/[0.08]'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]'
                }`}
              >
                <Subtitles className="w-4 h-4" />
                <span>Subtitles</span>
              </button>
              {qualityLevels.length > 1 && (
                <button
                  onClick={() => setActiveSettingsTab('quality')}
                  className={`flex-1 min-w-[65px] py-2 px-2.5 text-xs sm:text-sm font-medium border-b-2 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeSettingsTab === 'quality'
                      ? 'border-red-500 text-white font-bold bg-white/[0.08]'
                      : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]'
                  }`}
                >
                  <Gauge className="w-4 h-4" />
                  <span>Quality</span>
                </button>
              )}
              <button
                onClick={() => setActiveSettingsTab('speed')}
                className={`flex-1 min-w-[65px] py-2 px-2.5 text-xs sm:text-sm font-medium border-b-2 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeSettingsTab === 'speed'
                    ? 'border-red-500 text-white font-bold bg-white/[0.08]'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Speed</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-3.5 overflow-y-auto max-h-[50vh] scrollbar-thin">
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
                        className={`w-full px-4 py-3 rounded-xl text-left text-sm flex items-center justify-between transition cursor-pointer liquid-dropdown-item ${
                          currentAudioTrack === track.id
                            ? 'liquid-dropdown-item-active text-white'
                            : 'text-neutral-300 hover:text-white'
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
                <div className="space-y-4">
                  {/* Language Track Selection */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2 px-1">
                      Select Track
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      <button
                        onClick={() => changeSubtitleTrack(-1)}
                        className={`w-full px-3.5 py-2.5 rounded-xl text-left text-sm flex items-center justify-between transition cursor-pointer liquid-dropdown-item ${
                          currentSubtitleTrack === -1
                            ? 'liquid-dropdown-item-active text-white'
                            : 'text-neutral-300 hover:text-white'
                        }`}
                      >
                        <span className="font-medium">Off</span>
                        {currentSubtitleTrack === -1 && <Check className="w-4 h-4 text-white" />}
                      </button>
                      {subtitleTracks.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => changeSubtitleTrack(track.id)}
                          className={`w-full px-3.5 py-2.5 rounded-xl text-left text-sm flex items-center justify-between transition cursor-pointer liquid-dropdown-item ${
                            currentSubtitleTrack === track.id
                              ? 'liquid-dropdown-item-active text-white'
                              : 'text-neutral-300 hover:text-white'
                          }`}
                        >
                          <span className="font-medium truncate">
                            {track.label} {track.language !== 'unknown' && `(${track.language})`}
                          </span>
                          {currentSubtitleTrack === track.id && <Check className="w-4 h-4 text-red-400 shrink-0 ml-2" />}
                        </button>
                      ))}
                      {subtitleTracks.length === 0 && (
                        <p className="text-center py-2 text-xs text-neutral-500">
                          No subtitle tracks available for this video.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Subtitle Appearance & Style (High-Legibility Modern Typography) */}
                  <div className="pt-3 border-t border-neutral-800 space-y-3.5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 px-1">
                      Subtitle Appearance
                    </div>

                    {/* Live Preview Card */}
                    <div className="relative overflow-hidden rounded-xl bg-neutral-950 border border-neutral-800 p-3 text-center min-h-[60px] flex items-center justify-center shadow-inner">
                      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-700 via-neutral-900 to-black pointer-events-none" />
                      <span
                        style={{
                          color: subtitleColor,
                          fontFamily: activeSubFont.family,
                          fontSize: activeSubSize.sizeStr,
                          backgroundColor: subtitleBg ? 'rgba(0, 0, 0, 0.75)' : 'transparent',
                          textShadow: subtitleBg
                            ? '0 0 4px #000000, 0 2px 4px rgba(0, 0, 0, 0.9)'
                            : '0 0 4px #000000, 0 2px 4px rgba(0, 0, 0, 0.95), -1px -1px 2px #000000, 1px -1px 2px #000000, -1px 1px 2px #000000, 1px 1px 2px #000000, 0 0 8px #000000',
                          fontWeight: 600,
                          lineHeight: 1.35,
                          padding: '0.25em 0.6em',
                          borderRadius: '4px',
                          display: 'inline-block',
                        }}
                        className="transition-all select-none"
                      >
                        Sample Subtitle Text
                      </span>
                    </div>

                    {/* Font Selector */}
                    <div>
                      <span className="text-xs font-semibold text-neutral-400 mb-1.5 block px-1">Font</span>
                      <div className="grid grid-cols-3 gap-1.5 bg-neutral-900/80 p-1 rounded-xl border border-neutral-800">
                        {SUBTITLE_FONTS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => updateSubtitleSetting('font', f.id)}
                            style={{ fontFamily: f.fontStyle }}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
                              subtitleFont === f.id
                                ? 'bg-neutral-700 text-white shadow'
                                : 'text-neutral-400 hover:text-neutral-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color Presets */}
                    <div>
                      <span className="text-xs font-semibold text-neutral-400 mb-1.5 block px-1">Color</span>
                      <div className="flex items-center gap-3 px-1">
                        {SUBTITLE_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => updateSubtitleSetting('color', c.value)}
                            title={c.label}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition ${c.bgClass} ${
                              subtitleColor.toLowerCase() === c.value.toLowerCase()
                                ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-neutral-900 scale-110 shadow-lg'
                                : 'hover:scale-105 opacity-80 hover:opacity-100 border border-neutral-700'
                            }`}
                          >
                            {subtitleColor.toLowerCase() === c.value.toLowerCase() && (
                              <Check className="w-3.5 h-3.5 text-black drop-shadow" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Size Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 px-1">
                        <span className="text-xs font-semibold text-neutral-400">Size</span>
                        <span className="text-xs text-neutral-400 font-mono">{subtitleSize}%</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 bg-neutral-900/80 p-1 rounded-xl border border-neutral-800">
                        {SUBTITLE_SIZES.map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => updateSubtitleSetting('size', s.value)}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
                              subtitleSize === s.value
                                ? 'bg-neutral-700 text-white shadow'
                                : 'text-neutral-400 hover:text-neutral-200'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Background Box Toggle */}
                    <div className="flex items-center justify-between px-1 py-1">
                      <div>
                        <div className="text-xs text-neutral-200 font-medium">Dark Background Box</div>
                        <div className="text-[11px] text-neutral-500">Translucent background behind text</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateSubtitleSetting('background', !subtitleBg)}
                        className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                          subtitleBg ? 'bg-red-600' : 'bg-neutral-700'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            subtitleBg ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
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
                    className={`w-full px-4 py-3 rounded-xl text-left text-sm flex items-center justify-between transition cursor-pointer liquid-dropdown-item ${
                      preferredLevel === -1
                        ? 'liquid-dropdown-item-active text-white'
                        : 'text-neutral-300 hover:text-white'
                    }`}
                  >
                    <div>
                      <div className="font-medium">Auto (Recommended)</div>
                      {preferredLevel === -1 && activeLevel >= 0 && (
                        <div className="text-xs text-neutral-300 mt-0.5">
                          Currently: {qualityLevels.find((l) => l.index === activeLevel)?.label ?? '—'}
                        </div>
                      )}
                    </div>
                    {preferredLevel === -1 && <Check className="w-4 h-4 text-white" />}
                  </button>
                  {qualityLevels.map((lvl) => (
                    <button
                      key={lvl.index}
                      onClick={() => {
                        changeQuality(lvl.index);
                        setShowSettingsModal(false);
                      }}
                      className={`w-full px-4 py-3 rounded-xl text-left text-sm flex items-center justify-between transition cursor-pointer liquid-dropdown-item ${
                        preferredLevel === lvl.index
                          ? 'liquid-dropdown-item-active text-white'
                          : 'text-neutral-300 hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="font-medium">{lvl.label}</div>
                        {lvl.bitrate > 0 && (
                          <div className="text-xs text-neutral-300 mt-0.5">
                            {(lvl.bitrate / 1_000_000).toFixed(1)} Mbps
                          </div>
                        )}
                      </div>
                      {preferredLevel === lvl.index && <Check className="w-4 h-4 text-white" />}
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
                      className={`py-3 px-2 rounded-xl text-center text-sm font-semibold transition cursor-pointer ${
                        playbackRate === rate
                          ? 'liquid-btn-primary font-bold text-black shadow-lg'
                          : 'liquid-glass-pill text-neutral-300 hover:text-white'
                      }`}
                    >
                      {rate === 1 ? 'Normal (1x)' : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ──────────────── External Mobile / Desktop Player Modal ──────────────── */}
      {showExternalPlayerModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setShowExternalPlayerModal(false)}
        >
          <div
            className="w-full max-w-md bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950/60">
              <div className="flex items-center gap-2.5">
                <ExternalLink className="w-5 h-5 text-red-500" />
                <div>
                  <h3 className="font-bold text-white text-base leading-tight">External Player Options</h3>
                  <p className="text-[11px] text-neutral-400">
                    {isMobileClient
                      ? 'Play in mobile apps with 0% server lag'
                      : 'Play options for your local network'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExternalPlayerModal(false)}
                className="p-1.5 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-2.5 overflow-y-auto">
              {/* Option 1: Open in VLC */}
              <button
                onClick={handleOpenMobileVlc}
                className="w-full p-3.5 bg-neutral-800/80 hover:bg-neutral-700/90 border border-white/10 hover:border-orange-500/50 rounded-xl flex items-center gap-3.5 transition group text-left"
              >
                <div className="p-2.5 bg-orange-500/15 text-orange-400 rounded-xl group-hover:scale-105 transition">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">Play in VLC (Mobile)</span>
                    <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] font-bold rounded">
                      Fastest
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 truncate">
                    Direct hardware decoding on phone with 0% server CPU load
                  </p>
                </div>
              </button>

              {/* Option 2: MX Player (Android only) */}
              {isAndroidClient && (
                <button
                  onClick={handleOpenMobileMxPlayer}
                  className="w-full p-3.5 bg-neutral-800/80 hover:bg-neutral-700/90 border border-white/10 hover:border-blue-500/50 rounded-xl flex items-center gap-3.5 transition group text-left"
                >
                  <div className="p-2.5 bg-blue-500/15 text-blue-400 rounded-xl group-hover:scale-105 transition">
                    <Play className="w-5 h-5 fill-current" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">Play in MX Player</span>
                      <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded">
                        HW+
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 truncate">
                      Launch MX Player app with hardware acceleration
                    </p>
                  </div>
                </button>
              )}

              {/* Option 3: Open with Any Video App */}
              <button
                onClick={handleOpenAnyPlayer}
                className="w-full p-3.5 bg-neutral-800/80 hover:bg-neutral-700/90 border border-white/10 hover:border-emerald-500/50 rounded-xl flex items-center gap-3.5 transition group text-left"
              >
                <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-xl group-hover:scale-105 transition">
                  <Share2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm">
                    {isAndroidClient ? 'Open with Any App (Chooser)' : 'Open Direct Stream'}
                  </div>
                  <p className="text-xs text-neutral-400 truncate">
                    {isAndroidClient
                      ? 'Pick from installed video players (Nova, Just Player, etc.)'
                      : 'Open direct media stream in browser tab'}
                  </p>
                </div>
              </button>

              {/* Option 4: Copy Direct Stream URL */}
              <button
                onClick={handleCopyStreamLink}
                className="w-full p-3.5 bg-neutral-800/80 hover:bg-neutral-700/90 border border-white/10 hover:border-purple-500/50 rounded-xl flex items-center gap-3.5 transition group text-left"
              >
                <div className="p-2.5 bg-purple-500/15 text-purple-400 rounded-xl group-hover:scale-105 transition">
                  {copiedStreamLink ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">
                      {copiedStreamLink ? 'Stream URL Copied!' : 'Copy Stream Link'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 truncate">
                    Paste into VLC &gt; Network Stream, Infuse, Kodi, or TV cast app
                  </p>
                </div>
              </button>

              <div className="pt-2 pb-1">
                <div className="border-t border-neutral-800" />
              </div>

              {/* Option 5: Remote Play on Host PC Screen */}
              <button
                onClick={handlePlayOnHostPc}
                className="w-full p-3.5 bg-neutral-850 hover:bg-neutral-800 border border-white/10 hover:border-red-500/40 rounded-xl flex items-center gap-3.5 transition group text-left"
              >
                <div className="p-2.5 bg-red-500/15 text-red-400 rounded-xl group-hover:scale-105 transition">
                  <Tv className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">Play on Host PC Screen</span>
                    <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-400 text-[10px] font-medium rounded">
                      Remote Control
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 truncate">
                    Start playback on the host computer / TV monitor (MPV/VLC)
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
