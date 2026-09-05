'use client';

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, Wifi, Copy, Check, RefreshCw, Share2, AlertTriangle, Network } from 'lucide-react';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';

type Props = {
  onClose: () => void;
};

interface NetworkAdapter {
  name: string;
  ip: string;
  mac?: string;
}

export default function MobileConnectModal({ onClose }: Props) {
  const modalRef = useModalBehavior(true, onClose, { trapFocus: true });

  const [selectedIp, setSelectedIp] = useState<string>('');
  const [port, setPort] = useState<number>(3000);
  const [allIps, setAllIps] = useState<NetworkAdapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);

  const fetchIp = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch('/api/ip');
      if (!res.ok) throw new Error('Failed to fetch IP');
      const data = await res.json();
      
      const resolvedPort = data.port || (typeof window !== 'undefined' && window.location.port ? parseInt(window.location.port, 10) : 3000);
      setPort(resolvedPort);

      if (data.ip) {
        setSelectedIp(data.ip);
      } else if (typeof window !== 'undefined') {
        setSelectedIp(window.location.hostname || '127.0.0.1');
      }

      if (Array.isArray(data.allIps) && data.allIps.length > 0) {
        setAllIps(data.allIps);
      }
    } catch {
      if (typeof window !== 'undefined') {
        setSelectedIp(window.location.hostname || '127.0.0.1');
        setPort(window.location.port ? parseInt(window.location.port, 10) : 3000);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchIp();
    setShareSupported(typeof navigator !== 'undefined' && !!navigator.share);
  }, [fetchIp]);

  const portSuffix = port && port !== 80 ? `:${port}` : '';
  const fullUrl = selectedIp ? `http://${selectedIp}${portSuffix}` : '';
  const isLocalhost = selectedIp === 'localhost' || selectedIp === '127.0.0.1';

  const copyToClipboard = () => {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareUrl = async () => {
    if (navigator.share && fullUrl) {
      try {
        await navigator.share({
          title: 'LFLIX',
          text: 'Watch movies on LFLIX',
          url: fullUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    }
  };

  return (
    <div ref={modalRef as React.RefObject<HTMLDivElement>} role="dialog" aria-modal="true" aria-label="Connect a device" className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Connect Mobile</h2>
              <p className="text-neutral-400 text-sm">Scan to watch on your phone</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Localhost Warning */}
        {isLocalhost && !loading && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold mb-0.5">PC is not connected to a local Wi-Fi / LAN</p>
              <p className="text-amber-300/80">Only localhost was detected. Connect your PC to Wi-Fi or router Ethernet, then tap refresh so mobile devices can reach it.</p>
            </div>
          </div>
        )}

        {/* Multi-interface Selector */}
        {allIps.length > 1 && (
          <div className="mb-4 bg-neutral-800/80 border border-neutral-700/80 rounded-xl p-2.5">
            <label className="text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-blue-400" />
              <span>Select Network Interface:</span>
            </label>
            <select
              value={selectedIp}
              onChange={(e) => setSelectedIp(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 transition"
            >
              {allIps.map((adapter) => (
                <option key={`${adapter.name}-${adapter.ip}`} value={adapter.ip}>
                  {adapter.name} ({adapter.ip})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* QR Code */}
        <div className="flex flex-col items-center">
          <div className="bg-white p-5 rounded-2xl mb-4 shadow-lg min-h-[240px] min-w-[240px] flex items-center justify-center">
            {loading ? (
              <div className="flex flex-col items-center text-neutral-400">
                <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                <span className="text-sm">Detecting network IP...</span>
              </div>
            ) : (
              <QRCodeSVG 
                value={fullUrl || 'http://localhost:3000'}
                size={200}
                level="H"
                includeMargin={false}
              />
            )}
          </div>

          {/* URL Display */}
          <div className="w-full bg-neutral-800 rounded-lg p-3 flex items-center gap-3 mb-4">
            <Wifi className="w-5 h-5 text-green-500 flex-shrink-0" />
            <code className="flex-1 text-sm font-mono text-neutral-300 truncate">
              {loading ? 'Detecting...' : fullUrl}
            </code>
            <button 
              aria-label="Refresh IP" 
              onClick={() => fetchIp(true)}
              className="p-2 hover:bg-neutral-700 rounded-lg transition"
              title="Refresh IP"
              disabled={refreshing || loading}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button 
              aria-label="Copy URL" 
              onClick={copyToClipboard}
              className="p-2 hover:bg-neutral-700 rounded-lg transition"
              title="Copy URL"
              disabled={!fullUrl}
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
            {shareSupported && (
              <button 
                aria-label="Share" 
                onClick={shareUrl}
                className="p-2 hover:bg-neutral-700 rounded-lg transition"
                title="Share"
                disabled={!fullUrl}
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Instructions */}
          <div className="text-center space-y-3 text-sm w-full">
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              <p className="text-neutral-400">Connect your phone to the <strong>same Wi-Fi</strong> network as this PC</p>
            </div>
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              <p className="text-neutral-400">Open your phone's camera and <strong>scan the QR code</strong></p>
            </div>
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
              <p className="text-neutral-400">Tap the link and enter your PIN to watch</p>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-5 p-3.5 bg-blue-900/20 border border-blue-800/60 rounded-xl text-xs w-full">
            <p className="text-blue-300">
              <strong>💡 Tip:</strong> Both devices must be on the same local Wi-Fi or router network.
            </p>
          </div>
          
          {/* Troubleshooting */}
          <div className="mt-4 text-center">
            <p className="text-neutral-500 text-xs leading-relaxed">
              Getting <strong>ERR_SSL_PROTOCOL_ERROR</strong>? Your browser automatically upgraded to HTTPS. 
              <br/>Tap the address bar and type <strong>http://</strong> before the IP address.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
