'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { X, Wifi, Play, Square, CheckCircle, AlertCircle } from 'lucide-react';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';

type Props = {
  onClose: () => void;
};

export default function DlnaModal({ onClose }: Props) {
    const modalRef = useModalBehavior(true, onClose, { trapFocus: true });

  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check status when modal opens
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/dlna', { credentials: 'include' });
      const data = await res.json();
      setRunning(data.running);
    } catch (e) {
      console.error('Failed to check DLNA status:', e);
    }
  };

  const startDlna = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await fetch('/api/dlna', { 
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      
      if (res.ok) {
        setRunning(true);
        setSuccess(data.message);
      } else {
        setError(data.error || 'Failed to start DLNA server');
      }
    } catch (e) {
      setError('Failed to start DLNA server');
    } finally {
      setLoading(false);
    }
  };

  const stopDlna = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await fetch('/api/dlna', { 
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      
      if (res.ok) {
        setRunning(false);
        setSuccess(data.message);
      } else {
        setError(data.error || 'Failed to stop DLNA server');
      }
    } catch (e) {
      setError('Failed to stop DLNA server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={modalRef as React.RefObject<HTMLDivElement>} role="dialog" aria-modal="true" aria-label="DLNA server" className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="liquid-glass-base border border-white/15 rounded-3xl w-full max-w-md p-6 shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(255,255,255,0.08)] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 liquid-orb bg-purple-500/20 border-purple-500/35 flex items-center justify-center">
              <Wifi className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Cast to Smart TV (DLNA)</h2>
              <p className="text-neutral-400 text-sm">Stream to Smart TVs and media devices</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 liquid-orb text-neutral-300 hover:text-white transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status */}
        <div className={`p-4 rounded-2xl mb-6 flex items-center gap-3 transition-all ${
          running
            ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.15)]'
            : 'liquid-glass-pill bg-white/[0.03] border border-white/10'
        }`}>
          {running ? (
            <>
              <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-300">DLNA Server Running</p>
                <p className="text-xs text-emerald-300/80">Smart TVs and media players can discover your library</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-neutral-400 shrink-0" />
              <div>
                <p className="font-semibold text-neutral-300">DLNA Server Stopped</p>
                <p className="text-xs text-neutral-400">Start to enable Smart TV and device discovery</p>
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-3 mb-6">
          {!running ? (
            <button
              onClick={startDlna}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 p-4 liquid-btn-emerald text-white font-bold rounded-2xl shadow-lg shadow-emerald-950/40 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-white" />
              )}
              Start DLNA Server
            </button>
          ) : (
            <button
              onClick={stopDlna}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 p-4 liquid-btn-red text-white font-bold rounded-2xl shadow-lg shadow-rose-950/40 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Square className="w-5 h-5 fill-white" />
              )}
              Stop DLNA Server
            </button>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="p-3.5 liquid-glass-pill bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-sm mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3.5 liquid-glass-pill bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-sm mb-4">
            {success}
          </div>
        )}

        {/* Instructions */}
        <div className="liquid-glass-pill bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3 text-sm text-neutral-300">
          <div>
            <p className="font-semibold text-white mb-2 text-xs uppercase tracking-wider">How to cast to TV:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-neutral-300/80">
              <li>Click &quot;Start DLNA Server&quot; above</li>
              <li>Turn on your Smart TV (Samsung, LG, Sony, Roku, Apple TV, Fire TV, etc.)</li>
              <li>Go to &quot;Sources&quot;, &quot;Media Player&quot;, or &quot;Network Media&quot; on your TV</li>
              <li>Select &quot;LFLIX Media Server&quot;</li>
              <li>Browse your movies &amp; TV shows and press Play!</li>
            </ol>
          </div>

          <div className="p-3 bg-blue-500/15 border border-blue-500/30 rounded-xl">
            <p className="text-blue-300 text-xs leading-relaxed">
              <strong>Note:</strong> Your TV and this PC must be connected to the same WiFi network.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
