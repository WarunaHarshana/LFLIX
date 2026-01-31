'use client';

import { useState } from 'react';
import { X, Play, ExternalLink, Smartphone, Monitor } from 'lucide-react';

type Props = {
  title: string;
  streamUrl: string;
  onPlayBrowser: () => void;
  onClose: () => void;
};

export default function PlayChoiceModal({ title, streamUrl, onPlayBrowser, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const openInVLC = () => {
    // VLC mobile URL schemes
    const vlcUrl = `vlc://${streamUrl}`;
    window.location.href = vlcUrl;
    
    // Close modal after a delay
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(streamUrl);
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
            className="w-full flex items-center gap-4 p-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition"
          >
            <div className="w-12 h-12 bg-orange-600 rounded-full flex items-center justify-center">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-bold">Open in VLC App</p>
              <p className="text-sm text-neutral-400">Requires VLC installed</p>
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

        {/* Instructions */}
        <div className="mt-6 p-4 bg-neutral-800/50 rounded-lg text-sm text-neutral-400">
          <p className="mb-2"><strong>VLC App:</strong></p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Install VLC from App Store/Play Store</li>
            <li>Tap "Open in VLC App" above</li>
            <li>VLC should open and start playing</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
