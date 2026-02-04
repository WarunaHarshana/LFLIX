'use client';

import { useRef, useEffect, useState } from 'react';
import { X, AlertCircle, Maximize, Minimize, Settings2, Subtitles, AudioLines, Check } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorVideoPlayer } from 'capacitor-video-player';

type Props = {
  src: string;
  title: string;
  onClose: () => void;
  initialTime?: number;
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

export default function VideoPlayer({ src, title, onClose, initialTime = 0 }: Props) {
  const videoRef = useRef<ExtendedHTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string; language: string }[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; label: string; language: string }[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState<number>(-1);
  const isNative = Capacitor.isNativePlatform();

  // Handle Native Player
  useEffect(() => {
    if (!isNative) return;

    let playerHandle: any;

    const playNative = async () => {
      try {
        // Construct absolute URL
        const absoluteUrl = src.startsWith('http') ? src : window.location.origin + src;
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

  // If Native, show a placeholder (player covers screen)
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

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Set initial time and detect tracks when video loads
  useEffect(() => {
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

      // Text tracks (subtitles)
      const textTracks = [];
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          textTracks.push({
            id: i,
            label: track.label || `Subtitle ${i + 1}`,
            language: track.language || 'unknown'
          });
        }
      }
      setSubtitleTracks(textTracks);
    };

    video.addEventListener('loadedmetadata', detectTracks);
    return () => video.removeEventListener('loadedmetadata', detectTracks);
  }, [initialTime]);

  const handleError = () => {
    const video = videoRef.current;
    if (video) {
      const errorCode = video.error?.code;
      const errorMessage = video.error?.message || 'Unknown error';
      console.error('Video error:', errorCode, errorMessage);

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
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen().catch(err => {
          console.error('Fullscreen error:', err);
        });
      }
    }
  };

  // Auto-enter fullscreen on play (for TV/better experience)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      if (!document.fullscreenElement && video.requestFullscreen) {
        video.requestFullscreen().catch(() => {
          // Ignore errors
        });
      }
    };

    video.addEventListener('play', handlePlay);
    return () => video.removeEventListener('play', handlePlay);
  }, []);

  // Change audio track
  const changeAudioTrack = (index: number) => {
    const video = videoRef.current as ExtendedHTMLVideoElement | null;
    if (video && video.audioTracks) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        video.audioTracks[i].enabled = (i === index);
      }
      setCurrentAudioTrack(index);
    }
  };

  // Change subtitle track
  const changeSubtitleTrack = (index: number) => {
    const video = videoRef.current;
    if (!video) return;

    // Disable all tracks first
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = 'disabled';
    }

    // Enable selected track
    if (index >= 0 && video.textTracks[index]) {
      video.textTracks[index].mode = 'showing';
    }
    setCurrentSubtitleTrack(index);
  };

  const hasAudioTracks = audioTracks.length > 1;
  const hasSubtitleTracks = subtitleTracks.length > 0;
  const hasSettings = hasAudioTracks || hasSubtitleTracks;

  // Debug log to see what's detected
  useEffect(() => {
    console.log('VideoPlayer - Audio tracks:', audioTracks.length, audioTracks);
    console.log('VideoPlayer - Subtitle tracks:', subtitleTracks.length, subtitleTracks);
  }, [audioTracks, subtitleTracks]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-neutral-900">
        <h2 className="text-lg font-medium truncate flex-1">{title}</h2>
        <div className="flex items-center gap-2">
          {/* Settings Button - Always show, displays info about tracks */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-neutral-800 rounded-full transition"
              title="Audio & Subtitles"
            >
              <Settings2 className="w-6 h-6" />
            </button>

            {/* Settings Menu */}
            {showSettings && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden z-50">
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

          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-neutral-800 rounded-full transition"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
          </button>
          <button
            onClick={onClose}
            className="p-3 hover:bg-neutral-800 rounded-full transition bg-neutral-800/50"
            title="Close"
            style={{ touchAction: 'manipulation' }}
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
          src={src}
          controls
          autoPlay
          className="max-w-full max-h-full"
          playsInline
          onError={handleError}
          onCanPlay={handleCanPlay}
        >
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Hint */}
      <div className="p-4 bg-neutral-900 text-center text-sm text-neutral-500">
        {error ? 'See error above' : hasSettings ? 'Tap ⚙️ for audio & subtitles • Tap video for controls' : 'Tap video for controls • Works best in fullscreen'}
      </div>
    </div>
  );
}
