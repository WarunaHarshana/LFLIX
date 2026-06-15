'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Maximize, Minimize, Volume2, VolumeX } from 'lucide-react';

type Props = {
  channel: {
    id: number;
    name: string;
    url: string;
    logo?: string;
  };
  onClose: () => void;
};

export default function IPTVPlayer({ channel, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qualities, setQualities] = useState<{ index: number; label: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const hlsRef = useRef<any>(null);

  const handleQualityChange = (index: number) => {
    setCurrentQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  };

  useEffect(() => {
    setQualities([]);
    setCurrentQuality(-1);
    hlsRef.current = null;
    const video = videoRef.current;
    if (!video) return;

    const isIframe = channel.url.includes('embed') || 
                     channel.url.includes('pages.dev') || 
                     channel.url.includes('html');

    if (isIframe) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Use HLS.js for stream if supported (allows quality selection)
    let hls: any;
    import('hls.js').then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(channel.url);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const levels = hls.levels.map((level: any, idx: number) => {
            const label = level.name || (level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}k`);
            return { index: idx, label };
          });
          setQualities([{ index: -1, label: 'Auto' }, ...levels]);
          setLoading(false);
          videoRef.current?.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
          if (data.fatal) {
            setError('Playback failed during streaming.');
            setLoading(false);
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = channel.url;
        video.play().catch(() => {});
      } else {
        video.src = channel.url;
        video.play().catch(() => {});
      }
    });

    return () => {
      if (hls) {
        hls.destroy();
      }
      hlsRef.current = null;
    };
  }, [channel.url]);

  // Redirect video requestFullscreen to containerRef to prevent washed-out HDR colors in browser fullscreen overlay
  useEffect(() => {
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
  }, [channel.url]);

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleError = () => {
    setError('Failed to load stream. The channel may be offline or unsupported.');
    setLoading(false);
  };

  const handleCanPlay = () => {
    setLoading(false);
    setError(null);
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-neutral-900">
        <div className="flex items-center gap-3">
          {channel.logo && (
            <img src={channel.logo} alt={channel.name} className="w-10 h-10 object-contain bg-white/10 rounded" />
          )}
          <div>
            <h2 className="text-lg font-medium">{channel.name}</h2>
            <span className="text-xs text-neutral-400">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {qualities.length > 0 && (
            <select
              value={currentQuality}
              onChange={(e) => handleQualityChange(Number(e.target.value))}
              className="bg-neutral-800 text-white text-xs rounded border border-neutral-700 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-600/50 mr-2 cursor-pointer font-medium"
            >
              {qualities.map((q) => (
                <option key={q.index} value={q.index}>
                  {q.label}
                </option>
              ))}
            </select>
          )}
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-neutral-800 rounded-full transition"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
          </button>
          <button 
            onClick={toggleFullscreen}
            className="p-2 hover:bg-neutral-800 rounded-full transition"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
          </button>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-neutral-800 rounded-full transition"
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
              <p className="text-neutral-400">Loading stream...</p>
            </div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="bg-neutral-900 border border-red-800 rounded-xl p-6 max-w-md text-center">
              <h3 className="text-xl font-bold text-red-400 mb-2">Stream Error</h3>
              <p className="text-neutral-300">{error}</p>
            </div>
          </div>
        )}
        
        {channel.url.includes('embed') || channel.url.includes('pages.dev') || channel.url.includes('html') ? (
          <iframe
            src={channel.url}
            className="w-full h-full border-0"
            allow="autoplay; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-downloads allow-modals allow-pointer-lock"
            onLoad={() => setLoading(false)}
          />
        ) : (
          <video
            ref={videoRef}
            controls
            controlsList="nofullscreen"
            autoPlay
            muted={isMuted}
            className="max-w-full max-h-full"
            playsInline
            onError={handleError}
            onCanPlay={handleCanPlay}
          >
            Your browser does not support the video tag.
          </video>
        )}
      </div>
    </div>
  );
}
