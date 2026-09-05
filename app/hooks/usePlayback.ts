import { useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { apiUrl } from '@/lib/mobileConfig';
import type { ContentItem } from '@/app/types';

export function usePlayback(
  library: ContentItem[],
  showToast: (message: string, type: 'success' | 'error') => void
) {
  // Video Player (for mobile streaming)
  const [videoPlayer, setVideoPlayer] = useState<{ src: string; title: string; initialTime?: number; isHDR?: boolean; audioCodec?: string | null; videoCodec?: string | null; fileName?: string | null } | null>(null);

  // Force browser player (for TVs without VLC)
  const [forceBrowserPlayer, setForceBrowserPlayer] = useState(false);

  // HDR display detection (live — updates when moving between monitors)
  const [hdrDisplaySupported, setHdrDisplaySupported] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    try {
      const mq = window.matchMedia('(dynamic-range: high)');
      setHdrDisplaySupported(!!mq?.matches);
      const handler = (e: MediaQueryListEvent | MediaQueryList) => setHdrDisplaySupported(!!e.matches);
      if (typeof mq?.addEventListener === 'function') {
        mq.addEventListener('change', handler as EventListener);
        return () => mq.removeEventListener('change', handler as EventListener);
      } else if (typeof (mq as any)?.addListener === 'function') {
        (mq as any).addListener(handler);
        return () => (mq as any).removeListener(handler);
      }
    } catch {
      // Ignore errors on devices/browsers that don't support dynamic-range media queries
    }
  }, []);


  // Detect if client should use built-in browser player
  // (Mobile, tablets, Smart TVs, consoles, touch devices, and any remote Wi-Fi connection)
  const isMobile = useCallback(() => {
    if (typeof window === 'undefined') return false;
    if (forceBrowserPlayer) return true;

    const hostname = window.location.hostname;
    const isRemote = hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1';
    if (isRemote) return true;

    const ua = navigator.userAgent;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isTV = /SmartTV|AppleTV|HbbTV|NetCast|WebOS.+TV|Tizen.+TV|GoogleTV|PlayStation|Xbox|Nintendo/i.test(ua);
    const isTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);

    return isMobileDevice || isIPad || isTV || isTouch;
  }, [forceBrowserPlayer]);

  // Play file - uses secure ID-based lookup instead of filePath
  const playFile = async (contentType: 'movie' | 'show', contentId: number, episodeId?: number, startTime?: number) => {
    console.log('playFile called:', { contentType, contentId, episodeId, startTime });
    try {
      const useBrowserPlayer = isMobile();
      const isNative = Capacitor.isNativePlatform();
      console.log('useBrowserPlayer:', useBrowserPlayer, 'isNative:', isNative);

      let title = 'Unknown';
      let isHDR = false;
      let audioCodec: string | null | undefined;
      let videoCodec: string | null | undefined;
      let fileName: string | null | undefined;

      if (contentType === 'movie') {
        const movie = library.find(m => m.id === contentId);
        title = movie?.title || 'Movie';
        isHDR = !!movie?.isHDR;
        audioCodec = movie?.audioCodec;
        videoCodec = movie?.videoCodec;
        fileName = movie?.filePath ? movie.filePath.split(/[/\\]/).pop() : null;
      } else {
        const show = library.find(s => s.id === contentId);
        title = show?.title || 'TV Show';
        if (episodeId) {
          try {
            const res = await fetch(`/api/episodes?showId=${contentId}`);
            if (res.ok) {
              const data = await res.json();
              let foundEp: any = null;
              for (const s of (data.seasons || [])) {
                foundEp = s.episodes.find((e: any) => e.id === episodeId);
                if (foundEp) break;
              }
              if (foundEp) {
                title = `${title} - S${foundEp.seasonNumber}E${foundEp.episodeNumber} - ${foundEp.title}`;
                isHDR = !!foundEp.isHDR;
                audioCodec = foundEp.audioCodec;
                videoCodec = foundEp.videoCodec;
                fileName = foundEp.filePath ? foundEp.filePath.split(/[/\\]/).pop() : null;
              }
            }
          } catch (e) {
            console.error('Failed to fetch episode details:', e);
          }
        }
      }

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

        setVideoPlayer({ src: streamUrl, title, initialTime: startTime, isHDR, audioCodec, videoCodec, fileName });
        return;
      }

      // Mobile, TV, remote Wi-Fi, or forced browser: Launch built-in player directly
      if (useBrowserPlayer) {
        let token = '';
        try {
          const tokenRes = await fetch(apiUrl('/api/token'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ contentType, contentId, episodeId })
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            token = tokenData.token || '';
          }
        } catch {
          // continue without token if generation fails
        }

        const params = new URLSearchParams({
          contentType,
          contentId: contentId.toString(),
          ...(episodeId && { episodeId: episodeId.toString() }),
          ...(token && { token })
        });
        const streamUrl = `/api/stream?${params.toString()}`;

        // Directly launch the built-in video player
        setVideoPlayer({
          src: streamUrl,
          title,
          initialTime: startTime,
          isHDR,
          audioCodec,
          videoCodec,
          fileName
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
    forceBrowserPlayer, setForceBrowserPlayer,
    hdrDisplaySupported,
    isMobile,
    playFile,
  };
}
