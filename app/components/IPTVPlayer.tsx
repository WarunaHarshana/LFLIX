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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.src = channel.url;
      video.play().catch(() => {
        // Auto-play blocked, user needs to click
      });
    }
  }, [channel.url]);

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen().catch(() => {});
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
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
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
        
        <video
          ref={videoRef}
          controls
          autoPlay
          muted={isMuted}
          className="max-w-full max-h-full"
          playsInline
          onError={handleError}
          onCanPlay={handleCanPlay}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}
