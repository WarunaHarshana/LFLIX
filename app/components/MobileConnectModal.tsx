'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, Wifi, Copy, Check } from 'lucide-react';

type Props = {
  onClose: () => void;
};

export default function MobileConnectModal({ onClose }: Props) {
  const [localIp, setLocalIp] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Get the current host (works if accessed via IP)
    const host = window.location.host;
    setLocalIp(host);
  }, []);

  const fullUrl = `http://${localIp}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <div className="bg-white p-4 rounded-xl mb-4">
            <QRCodeSVG 
              value={fullUrl}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>

          {/* URL Display */}
          <div className="w-full bg-neutral-800 rounded-lg p-3 flex items-center gap-3 mb-4">
            <Wifi className="w-5 h-5 text-green-500 flex-shrink-0" />
            <code className="flex-1 text-sm font-mono text-neutral-300 truncate">
              {fullUrl}
            </code>
            <button 
              onClick={copyToClipboard}
              className="p-2 hover:bg-neutral-700 rounded-lg transition"
              title="Copy URL"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Instructions */}
          <div className="text-center space-y-2 text-sm">
            <p className="text-neutral-400">
              1. Connect your phone to the <strong>same WiFi</strong> as this PC
            </p>
            <p className="text-neutral-400">
              2. Open your phone's camera and <strong>scan the QR code</strong>
            </p>
            <p className="text-neutral-400">
              3. Tap the link to open LocalFlix on your phone
            </p>
          </div>

          {/* Tips */}
          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg text-sm">
            <p className="text-blue-300">
              <strong>Tip:</strong> Make sure your PC's firewall allows connections on port 3000
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
