'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Globe,
  Smartphone,
  Tv,
  Cast,
  Copy,
  Check,
  Play,
  Share2,
  Sparkles,
} from 'lucide-react';
import type { PlayChoiceItem } from '@/app/hooks/usePlayback';

type Props = {
  item: PlayChoiceItem;
  onClose: () => void;
  onPlayInBrowser: () => void;
  onPlayOnHostPc: () => void;
  onOpenDlna: () => void;
  showToast?: (message: string, type: 'success' | 'error') => void;
};

export default function PlayChoiceModal({
  item,
  onClose,
  onPlayInBrowser,
  onPlayOnHostPc,
  onOpenDlna,
  showToast,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isTV, setIsTV] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isTvDevice = /SmartTV|AppleTV|HbbTV|NetCast|WebOS.+TV|Tizen.+TV|GoogleTV|PlayStation|Xbox|Nintendo/i.test(ua);
    const isTouch = !/Windows NT/i.test(ua) && ((navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window));

    setIsMobile(isMobileDevice || isIPad || isTouch);
    setIsAndroid(/Android/i.test(ua));
    setIsIOS(/iPhone|iPad|iPod/i.test(ua) || isIPad);
    setIsTV(isTvDevice);
  }, []);

  // Keyboard navigation (ESC to close, 1-5 for quick number selection on keyboard/remote)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Builds direct stream URL with token
  const getFullStreamUrl = useCallback(() => {
    if (typeof window === 'undefined') return item.streamUrl;
    if (item.streamUrl.startsWith('http')) return item.streamUrl;
    return `${window.location.origin}${item.streamUrl}`;
  }, [item.streamUrl]);

  // Launch mobile VLC app
  const handleOpenVlc = () => {
    const fullUrl = getFullStreamUrl();
    const hostAndPath = fullUrl.replace(/^https?:\/\//, '');

    if (isAndroid) {
      const intentUrl = `intent://${hostAndPath}#Intent;scheme=http;type=video/*;package=org.videolan.vlc;action=android.intent.action.VIEW;end`;
      window.location.href = intentUrl;
    } else if (isIOS) {
      window.location.href = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(fullUrl)}`;
    } else {
      window.location.href = `vlc://${fullUrl}`;
    }

    if (showToast) showToast('Opening in VLC Mobile...', 'success');
    onClose();
  };

  // Launch MX Player (Android)
  const handleOpenMxPlayer = () => {
    const fullUrl = getFullStreamUrl();
    const hostAndPath = fullUrl.replace(/^https?:\/\//, '');
    const intentUrl = `intent://${hostAndPath}#Intent;scheme=http;type=video/*;package=com.mxtech.videoplayer.ad;action=android.intent.action.VIEW;end`;
    window.location.href = intentUrl;

    if (showToast) showToast('Opening in MX Player...', 'success');
    onClose();
  };

  // Open with any video player (Android chooser intent)
  const handleOpenAnyPlayer = () => {
    const fullUrl = getFullStreamUrl();
    if (isAndroid) {
      const hostAndPath = fullUrl.replace(/^https?:\/\//, '');
      const intentUrl = `intent://${hostAndPath}#Intent;scheme=http;type=video/*;action=android.intent.action.VIEW;end`;
      window.location.href = intentUrl;
    } else {
      window.open(fullUrl, '_blank');
    }
    onClose();
  };

  // Copy direct stream URL
  const handleCopyLink = async () => {
    const fullUrl = getFullStreamUrl();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        window.prompt('Copy stream URL:', fullUrl);
      }
      setCopied(true);
      if (showToast) showToast('Stream link copied! Paste into VLC Network Stream', 'success');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt('Copy stream URL:', fullUrl);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xl animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg liquid-glass-base border border-white/15 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(255,255,255,0.08)] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-white/[0.03] flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                Choose Where to Play
              </span>
            </div>
            <h2 className="text-base sm:text-xl font-bold text-white truncate">
              {item.title}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {item.isHDR && (
                <span className="px-2 py-0.5 bg-amber-500/25 text-amber-300 text-[11px] font-bold rounded-md border border-amber-400/40 shadow-sm">
                  HDR
                </span>
              )}
              {item.videoCodec && (
                <span className="px-2 py-0.5 liquid-glass-pill text-neutral-200 text-[11px] font-medium rounded-md uppercase border border-white/10">
                  {item.videoCodec.toUpperCase()}
                </span>
              )}
              {item.audioCodec && (
                <span className="px-2 py-0.5 liquid-glass-pill text-neutral-200 text-[11px] font-medium rounded-md uppercase border border-white/10">
                  {item.audioCodec.toUpperCase()}
                </span>
              )}
              {item.startTime && item.startTime > 0 && (
                <span className="text-xs text-neutral-400">
                  Resume from {Math.floor(item.startTime / 60)}m
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 liquid-orb text-neutral-300 hover:text-white transition flex-shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options List */}
        <div className="p-3 sm:p-4 space-y-2.5 overflow-y-auto">
          {/* Option 1: Play in Web Browser */}
          <button
            onClick={() => {
              onPlayInBrowser();
              onClose();
            }}
            className="w-full p-4 liquid-glass-pill hover:border-red-500/50 rounded-2xl flex items-center gap-3.5 transition group text-left shadow-sm active:scale-[0.99] cursor-pointer"
          >
            <div className="p-2.5 liquid-orb bg-red-600/20 border-red-500/30 text-red-400 rounded-xl group-hover:bg-red-600 group-hover:text-white transition">
              <Globe className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm sm:text-base">
                  Play in Browser Player
                </span>
                {isTV && (
                  <span className="px-1.5 py-0.5 bg-red-500/20 text-red-300 text-[10px] font-bold rounded border border-red-500/30">
                    TV Browser
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 truncate">
                Stream right here in this browser with subtitles and audio tracks
              </p>
            </div>
          </button>

          {/* Option 2: VLC Mobile App (Android/iOS) */}
          <button
            onClick={handleOpenVlc}
            className="w-full p-4 liquid-glass-pill hover:border-orange-500/50 rounded-2xl flex items-center gap-3.5 transition group text-left shadow-sm active:scale-[0.99] cursor-pointer"
          >
            <div className="p-2.5 liquid-orb bg-orange-500/20 border-orange-500/30 text-orange-400 rounded-xl group-hover:bg-orange-500 group-hover:text-white transition">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm sm:text-base">
                  Play in VLC App (Mobile)
                </span>
                <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-300 text-[10px] font-bold rounded border border-orange-500/30">
                  0% Server Lag
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate">
                Direct phone hardware decoding for 100% 4K quality with 0% server CPU load
              </p>
            </div>
          </button>

          {/* Option 3: MX Player (Android) */}
          {isAndroid && (
            <button
              onClick={handleOpenMxPlayer}
              className="w-full p-4 liquid-glass-pill hover:border-blue-500/50 rounded-2xl flex items-center gap-3.5 transition group text-left shadow-sm active:scale-[0.99] cursor-pointer"
            >
              <div className="p-2.5 liquid-orb bg-blue-500/20 border-blue-500/30 text-blue-400 rounded-xl group-hover:bg-blue-500 group-hover:text-white transition">
                <Play className="w-5 h-5 fill-current" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm sm:text-base">
                    Play in MX Player
                  </span>
                  <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded border border-blue-500/30">
                    HW+ Decoder
                  </span>
                </div>
                <p className="text-xs text-neutral-400 truncate">
                  Launch MX Player app on Android
                </p>
              </div>
            </button>
          )}

          {/* Option 4: Open with Any Video App */}
          {isMobile && (
            <button
              onClick={handleOpenAnyPlayer}
              className="w-full p-4 liquid-glass-pill hover:border-emerald-500/50 rounded-2xl flex items-center gap-3.5 transition group text-left shadow-sm active:scale-[0.99] cursor-pointer"
            >
              <div className="p-2.5 liquid-orb bg-emerald-500/20 border-emerald-500/30 text-emerald-400 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition">
                <Share2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm sm:text-base">
                  {isAndroid ? 'Open with Any App (Chooser)' : 'Open Stream Directly'}
                </div>
                <p className="text-xs text-neutral-400 truncate">
                  {isAndroid
                    ? 'Pick from installed video players (Nova, Just Player, Kodi)'
                    : 'Open media stream directly'}
                </p>
              </div>
            </button>
          )}

          {/* Option 5: Cast to Smart TV (DLNA) */}
          <button
            onClick={() => {
              onOpenDlna();
              onClose();
            }}
            className="w-full p-4 liquid-glass-pill hover:border-sky-500/50 rounded-2xl flex items-center gap-3.5 transition group text-left shadow-sm active:scale-[0.99] cursor-pointer"
          >
            <div className="p-2.5 liquid-orb bg-sky-500/20 border-sky-500/30 text-sky-400 rounded-xl group-hover:bg-sky-500 group-hover:text-white transition">
              <Cast className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm sm:text-base">
                  Cast to Smart TV (DLNA)
                </span>
                <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-300 text-[10px] font-bold rounded border border-sky-500/30">
                  Samsung / LG / Sony / Roku
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate">
                Stream to your TV's built-in Media Player via home Wi-Fi
              </p>
            </div>
          </button>

          {/* Option 6: Remote Play on Host PC Screen */}
          <button
            onClick={() => {
              onPlayOnHostPc();
              onClose();
            }}
            className="w-full p-4 liquid-glass-pill hover:border-violet-500/50 rounded-2xl flex items-center gap-3.5 transition group text-left shadow-sm active:scale-[0.99] cursor-pointer"
          >
            <div className="p-2.5 liquid-orb bg-violet-500/20 border-violet-500/30 text-violet-400 rounded-xl group-hover:bg-violet-500 group-hover:text-white transition">
              <Tv className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm sm:text-base">
                  Play on Host PC Screen
                </span>
                <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-300 text-[10px] font-bold rounded border border-violet-500/30">
                  Remote Control
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate">
                Launch MPV / VLC on the host computer's monitor or connected TV
              </p>
            </div>
          </button>

          {/* Option 7: Copy Direct Stream Link */}
          <button
            onClick={handleCopyLink}
            className="w-full p-4 liquid-glass-pill hover:border-purple-500/50 rounded-2xl flex items-center gap-3.5 transition group text-left shadow-sm active:scale-[0.99] cursor-pointer"
          >
            <div className="p-2.5 liquid-orb bg-purple-500/20 border-purple-500/30 text-purple-400 rounded-xl group-hover:bg-purple-500 group-hover:text-white transition">
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm sm:text-base">
                {copied ? 'Stream URL Copied!' : 'Copy Direct Stream Link'}
              </div>
              <p className="text-xs text-neutral-400 truncate">
                Paste URL into VLC &gt; Network Stream, Infuse, Kodi, or TV player
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
