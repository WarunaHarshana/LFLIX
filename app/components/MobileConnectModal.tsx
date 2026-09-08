'use client';

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Smartphone, Wifi, Copy, Check, RefreshCw, Share2, AlertTriangle, Network, Lock } from 'lucide-react';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';
import LiquidDropdown from './LiquidDropdown';

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
  const [pin, setPin] = useState<string | null>(null);
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

      if (data.pin) {
        setPin(data.pin);
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
    <div ref={modalRef as React.RefObject<HTMLDivElement>} role="dialog" aria-modal="true" aria-label="Connect a device" className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="liquid-glass-base border border-white/15 rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(255,255,255,0.08)] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 liquid-orb bg-blue-500/20 border-blue-500/35 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Connect Mobile</h2>
              <p className="text-neutral-400 text-sm">Scan to watch on your phone</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 liquid-orb text-neutral-300 hover:text-white transition cursor-pointer" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Localhost Warning */}
        {isLocalhost && !loading && (
          <div className="mb-4 p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold mb-0.5">PC is not connected to a local Wi-Fi / LAN</p>
              <p className="text-amber-300/80">Only localhost was detected. Connect your PC to Wi-Fi or router Ethernet, then tap refresh so mobile devices can reach it.</p>
            </div>
          </div>
        )}

        {/* Multi-interface Selector */}
        {allIps.length > 1 && (
          <div className="mb-4 liquid-glass-pill bg-white/[0.03] border border-white/10 rounded-2xl p-3">
            <label className="text-xs font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-blue-400" />
              <span>Select Network Interface:</span>
            </label>
            <LiquidDropdown
              label="Select Network Interface"
              title="Network Interface"
              options={allIps.map((adapter) => ({
                id: adapter.ip,
                name: `${adapter.name} (${adapter.ip})`,
              }))}
              value={selectedIp}
              onChange={(val) => setSelectedIp(val)}
              className="w-full"
              menuWidth="w-full"
            />
          </div>
        )}

        {/* QR Code */}
        <div className="flex flex-col items-center">
          <div className="bg-white p-5 rounded-3xl mb-4 shadow-[0_15px_40px_rgba(0,0,0,0.6),0_0_20px_rgba(255,255,255,0.1)] min-h-[240px] min-w-[240px] flex items-center justify-center border border-white/40">
            {loading ? (
              <div className="flex flex-col items-center text-neutral-500">
                <RefreshCw className="w-8 h-8 animate-spin mb-2 text-blue-500" />
                <span className="text-sm font-medium">Detecting network IP...</span>
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
          <div className="w-full liquid-glass-pill bg-white/[0.04] border border-white/10 rounded-2xl p-3 flex items-center gap-2.5 mb-3">
            <Wifi className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <code className="flex-1 text-sm font-mono text-neutral-200 truncate">
              {loading ? 'Detecting...' : fullUrl}
            </code>
            <button 
              aria-label="Refresh IP" 
              onClick={() => fetchIp(true)}
              className="p-2 liquid-orb text-neutral-300 hover:text-white rounded-xl transition cursor-pointer"
              title="Refresh IP"
              disabled={refreshing || loading}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button 
              aria-label="Copy URL" 
              onClick={copyToClipboard}
              className="p-2 liquid-orb text-neutral-300 hover:text-white rounded-xl transition cursor-pointer"
              title="Copy URL"
              disabled={!fullUrl}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            {shareSupported && (
              <button 
                aria-label="Share" 
                onClick={shareUrl}
                className="p-2 liquid-orb text-neutral-300 hover:text-white rounded-xl transition cursor-pointer"
                title="Share"
                disabled={!fullUrl}
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* PIN Display */}
          {pin && (
            <div className="w-full liquid-glass-pill bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-300 font-medium">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>Your Login PIN:</span>
              </div>
              <span className="font-mono font-bold tracking-widest text-sm text-amber-300 bg-black/60 px-3 py-1 rounded-xl border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                {pin}
              </span>
            </div>
          )}

          {/* Instructions */}
          <div className="text-center space-y-3 text-sm w-full">
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 liquid-orb bg-blue-500/30 border-blue-400/40 text-blue-300 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
              <p className="text-neutral-300 text-xs sm:text-sm">Connect your phone to the <strong className="text-white">same Wi-Fi</strong> network as this PC</p>
            </div>
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 liquid-orb bg-blue-500/30 border-blue-400/40 text-blue-300 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
              <p className="text-neutral-300 text-xs sm:text-sm">Open your phone&apos;s camera and <strong className="text-white">scan the QR code</strong></p>
            </div>
            <div className="flex items-start gap-3 text-left">
              <span className="w-6 h-6 liquid-orb bg-blue-500/30 border-blue-400/40 text-blue-300 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
              <p className="text-neutral-300 text-xs sm:text-sm">
                Tap the link and enter your PIN{pin ? <> (<strong className="text-amber-300">{pin}</strong>)</> : ''} to watch
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-5 p-3.5 liquid-glass-pill bg-blue-500/10 border border-blue-500/25 rounded-2xl text-xs w-full">
            <p className="text-blue-300 leading-relaxed">
              <strong>💡 Tip:</strong> Both devices must be on the same local Wi-Fi or router network.
            </p>
          </div>
          
          {/* Troubleshooting */}
          <div className="mt-4 text-center">
            <p className="text-neutral-400 text-xs leading-relaxed">
              Getting <strong className="text-neutral-200">ERR_SSL_PROTOCOL_ERROR</strong>? Your browser automatically upgraded to HTTPS. 
              <br/>Tap the address bar and type <strong className="text-neutral-200">http://</strong> before the IP address.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
