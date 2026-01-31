'use client';

import { useState, useEffect } from 'react';
import { X, Play, ExternalLink, Smartphone, Monitor, Loader2, Download, AlertCircle } from 'lucide-react';

type Props = {
  title: string;
  streamUrl: string;
  contentType: 'movie' | 'show';
  contentId: number;
  episodeId?: number;
  onPlayBrowser: () => void;
  onClose: () => void;
};

export default function PlayChoiceModal({ title, streamUrl, contentType, contentId, episodeId, onPlayBrowser, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [tokenUrl, setTokenUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [vlcOpened, setVlcOpened] = useState(false);

  useEffect(() => {
    // Generate a token for external players
    const generateToken = async () => {
      try {
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ contentType, contentId, episodeId })
        });
        const data = await res.json();
        if (data.token) {
          setTokenUrl(`${streamUrl}&token=${data.token}`);
        }
      } catch (e) {
        console.error('Token generation failed:', e);
      } finally {
        setLoading(false);
      }
    };
    generateToken();
  }, [contentType, contentId, episodeId, streamUrl]);

  const [vlcOpened, setVlcOpened] = useState(false);

  const openInVLC = () => {
    if (!tokenUrl) return;
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS) {
      // iOS VLC x-callback-url scheme
      const vlcUrl = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(tokenUrl)}`;
      window.location.href = vlcUrl;
    } else {
      // Android - try vlc:// scheme
      const vlcUrl = `vlc://${tokenUrl}`;
      window.location.href = vlcUrl;
    }
    
    setVlcOpened(true);
    
    // Don't close modal immediately - let user see instructions
    setTimeout(() => {
      onClose();
    }, 3000);
  };

  const copyUrl = () => {
    const urlToCopy = tokenUrl || streamUrl;
    navigator.clipboard.writeText(urlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Play {title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* Play in Browser */}
          <button
            onClick={() => {
              onPlayBrowser();
              onClose();
            }}
            className="w-full flex items-center gap-4 p-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition"
          >
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
              <Monitor className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-bold">Play in Browser</p>
              <p className="text-sm text-neutral-400">Built-in video player</p>
            </div>
          </button>

          {/* Open in VLC */}
          <button
            onClick={openInVLC}
            disabled={loading || !tokenUrl}
            className="w-full flex items-center gap-4 p-4 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition"
          >
            <div className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Smartphone className="w-6 h-6" />}
            </div>
            <div className="text-left">
              <p className="font-bold">Open in VLC App</p>
              <p className="text-sm text-neutral-400">
                {loading ? 'Generating link...' : 'Requires VLC installed'}
              </p>
            </div>
          </button>

          {/* Copy URL */}
          <button
            onClick={copyUrl}
            className="w-full flex items-center gap-4 p-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition"
          >
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <ExternalLink className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-bold">{copied ? 'Copied!' : 'Copy Stream URL'}</p>
              <p className="text-sm text-neutral-400">Paste in any player</p>
            </div>
          </button>
        </div>

        {/* VLC Opened Message */}
        {vlcOpened && (
          <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800 rounded-lg text-sm">
            <p className="text-blue-300 font-medium mb-1">Opening VLC...</p>
            <p className="text-blue-400/80 text-xs">
              If VLC doesn't open automatically, use "Copy Stream URL" and paste it manually in VLC:
            </p>
            <ol className="text-blue-400/80 text-xs list-decimal list-inside mt-1 space-y-1">
              <li>Copy the URL above</li>
              <li>Open VLC app</li>
              <li>Go to Network Stream</li>
              <li>Paste the URL</li>
            </ol>
          </div>
        )}

        {/* Format Warning */}
        {!vlcOpened && (
          <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-300 font-medium mb-1">Having issues?</p>
                <ul className="text-yellow-400/80 text-xs space-y-1 list-disc list-inside">
                  <li><strong>Best option:</strong> Use "Play in Browser"</li>
                  <li>MP4 files work better than MKV/AVI in VLC mobile</li>
                  <li>Try "Copy Stream URL" and paste in VLC manually</li>
                  <li>VLC mobile doesn't support all video formats</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
