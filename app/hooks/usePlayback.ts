import { useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { apiUrl } from '@/lib/mobileConfig';
import type { ContentItem } from '@/app/types';

export function usePlayback(
  library: ContentItem[],
  showToast: (message: string, type: 'success' | 'error') => void
) {
  // Video Player (for mobile streaming)
  const [videoPlayer, setVideoPlayer] = useState<{ src: string; title: string; initialTime?: number; isHDR?: boolean } | null>(null);

  // Force browser player (for TVs without VLC)
  const [forceBrowserPlayer, setForceBrowserPlayer] = useState(false);

  // HDR display detection (live — updates when moving between monitors)
  const [hdrDisplaySupported, setHdrDisplaySupported] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(dynamic-range: high)');
    setHdrDisplaySupported(mq.matches);
    const handler = (e: MediaQueryListEvent) => setHdrDisplaySupported(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Play Choice Modal (for mobile)
  const [playChoice, setPlayChoice] = useState<{
    title: string;
    streamUrl: string;
    contentType: 'movie' | 'show';
    contentId: number;
    episodeId?: number;
    onPlayBrowser: () => void
  } | null>(null);

  // Detect mobile device (but not TVs!)
  const isMobile = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    console.log('User Agent:', ua);
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTV = /SmartTV|AppleTV|HbbTV|NetCast|WebOS.+TV|Tizen.+TV|GoogleTV|PlayStation|Xbox|Nintendo/i.test(ua);
    console.log('isMobileDevice:', isMobileDevice, 'isTV:', isTV);
    return isMobileDevice && !isTV;
  }, []);

  // Play file - uses secure ID-based lookup instead of filePath
  const playFile = async (contentType: 'movie' | 'show', contentId: number, episodeId?: number, startTime?: number) => {
    console.log('playFile called:', { contentType, contentId, episodeId, startTime });
    try {
      const mobile = isMobile();
      const isNative = Capacitor.isNativePlatform();
      console.log('isMobile result:', mobile, 'isNative:', isNative);

      // Native App: Use Built-in Player (Capacitor)
      if (isNative) {
        const tokenRes = await fetch(apiUrl('/api/token'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType, contentId, episodeId })
        });
        const { token } = await tokenRes.json();

        if (!token) throw new Error('Failed to generate playback token');

        const streamUrl = apiUrl(`/api/stream?token=${token}`);

        let title = 'Unknown';
        let isHDR = false;
        if (contentType === 'movie') {
          const movie = library.find(m => m.id === contentId);
          title = movie?.title || 'Movie';
          isHDR = !!movie?.isHDR;
        } else {
          const show = library.find(s => s.id === contentId);
          title = show?.title || 'TV Show';
        }

        setVideoPlayer({ src: streamUrl, title, initialTime: startTime, isHDR });
        return;
      }

      // Mobile Browser or TV (force browser): Show browser player choice
      if (mobile || forceBrowserPlayer) {
        const params = new URLSearchParams({
          contentType,
          contentId: contentId.toString(),
          ...(episodeId && { episodeId: episodeId.toString() })
        });
        const streamUrl = `/api/stream?${params.toString()}`;

        let title = 'Unknown';
        let isHDR = false;
        if (contentType === 'movie') {
          const movie = library.find(m => m.id === contentId);
          title = movie?.title || 'Movie';
          isHDR = !!movie?.isHDR;
        } else {
          const show = library.find(s => s.id === contentId);
          title = show?.title || 'TV Show';
        }

        setPlayChoice({
          title,
          streamUrl: window.location.origin + streamUrl,
          contentType,
          contentId,
          episodeId,
          onPlayBrowser: () => setVideoPlayer({ src: streamUrl, title, initialTime: startTime, isHDR })
        });
        return;
      }

      // Desktop: Launch VLC (or TV uses browser)
      console.log('Desktop/VLC path - calling /api/play');
      const res = await fetch(apiUrl('/api/play'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ contentType, contentId, episodeId, startTime })
      });
      console.log('Play response:', res.status);
      const data = await res.json();
      console.log('Play data:', data);
      if (!res.ok) {
        showToast(data.error || 'Failed to play file', 'error');
      } else {
        console.log('Play successful');
      }
    } catch (e: any) {
      console.error('Play error:', e);
      showToast('Failed to play file: ' + e.message, 'error');
    }
  };

  return {
    videoPlayer, setVideoPlayer,
    playChoice, setPlayChoice,
    forceBrowserPlayer, setForceBrowserPlayer,
    hdrDisplaySupported,
    isMobile,
    playFile,
  };
}
