'use client';

import { useRef, useEffect } from 'react';
import { X, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';

type Props = {
  src: string;
  title: string;
  onClose: () => void;
  initialTime?: number;
};

export default function VideoPlayer({ src, title, onClose, initialTime = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Set initial time when video loads
  useEffect(() => {
    if (videoRef.current && initialTime > 0) {
      videoRef.current.currentTime = initialTime;
    }
  }, [initialTime]);

  // Handle fullscreen
  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-neutral-900">
        <h2 className="text-lg font-medium truncate flex-1">{title}</h2>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-neutral-800 rounded-full transition"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Video */}
      <div className="flex-1 flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          className="max-w-full max-h-full"
          playsInline
        >
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Mobile hint */}
      <div className="p-4 bg-neutral-900 text-center text-sm text-neutral-500">
        Tap video for controls • Works best in fullscreen
      </div>
    </div>
  );
}
