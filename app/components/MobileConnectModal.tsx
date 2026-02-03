'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, Wifi, Copy, Check, RefreshCw, Share2 } from 'lucide-react';

type Props = {
  onClose: () => void;
};

export default function MobileConnectModal({ onClose }: Props) {
  const [localIp, setLocalIp] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    // Fetch the actual IP address from server
    const fetchIp = async () => {
      try {
        const res = await fetch('/api/ip');
        const data = await res.json();
        setLocalIp(`${data.ip}:${data.port}`);
      } catch {
        // Fallback to window location
        setLocalIp(window.location.host);
      } finally {
        setLoading(false);
      }
    };
    
    fetchIp();
    
    // Check if Web Share API is supported
    setShareSupported(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);

  const fullUrl = `http://${localIp}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareUrl = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'LFLIX',
          text: 'Watch movies on LFLIX',
          url: fullUrl,
        });
      } catch (err) {
        // User cancelled or share failed
      }
    }
  };

  const refreshIp = () => {
    const host = window.location.host;
    setLocalIp(host);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Connect Mobile</h2>
              <p className="text-neutral-400 text-sm">Scan to watch on your phone</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center">
          <div className="bg-white p-6 rounded-2xl mb-4 shadow-lg min-h-[252px] min-w-[252px] flex items-center justify-center">
            {loading ? (
              <div className="flex flex-col items-center text-neutral-400">
                <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                <span className="text-sm">Getting IP...</span>
              </div>
            ) : (
              <QRCodeSVG 
                value={fullUrl}
                size={220}
                level="H"
                includeMargin={false}
              />
            )}
          </div>

          {/* URL Display */}
          <div className="w-full bg-neutral-800 rounded-lg p-3 flex items-center gap-3 mb-4">
            <Wifi className="w-5 h-5 text-green-500 flex-shrink-0" />
            <code className="flex-1 text-sm font-mono text-neutral-300 truncate">
              {fullUrl}
            </code>
            <button 
              onClick={refreshIp}
              className="p-2 hover:bg-neutral-700 rounded-lg transition"
              title="Refresh IP"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button 
              onClick={copyToClipboard}
              className="p-2 hover:bg-neutral-700 rounded-lg transition"
              title="Copy URL"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
            {shareSupported && (
              <button 
                onClick={shareUrl}
                className="p-2 hover:bg-neutral-700 rounded-lg transition"
                title="Share"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Instructions */}
          <div className="text-center space-y-3 text-sm">
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              <p className="text-neutral-400">Connect your phone to the <strong>same WiFi</strong> as this PC</p>
            </div>
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              <p className="text-neutral-400">Open your phone's camera and <strong>scan the QR code</strong></p>
            </div>
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
              <p className="text-neutral-400">Tap the link and login with your PIN</p>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg text-sm">
            <p className="text-blue-300">
              <strong>💡 Tip:</strong> Both devices must be on the same WiFi network
            </p>
          </div>
          
          {/* Troubleshooting */}
          <div className="mt-4 text-center">
            <p className="text-neutral-500 text-xs">
              Not working? Try typing the URL manually in your phone's browser
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
