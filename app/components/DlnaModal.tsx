'use client';

import { useState, useEffect } from 'react';
import { X, Wifi, Play, Square, CheckCircle, AlertCircle } from 'lucide-react';

type Props = {
  onClose: () => void;
};

export default function DlnaModal({ onClose }: Props) {
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
    <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600/20 rounded-full flex items-center justify-center">
              <Wifi className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">DLNA Server</h2>
              <p className="text-neutral-400 text-sm">Stream to VLC wirelessly</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status */}
        <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${
          running ? 'bg-green-900/20 border border-green-800' : 'bg-neutral-800'
        }`}>
          {running ? (
            <>
              <CheckCircle className="w-6 h-6 text-green-500" />
              <div>
                <p className="font-medium text-green-400">DLNA Server Running</p>
                <p className="text-sm text-green-300/70">VLC can now discover your library</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-neutral-500" />
              <div>
                <p className="font-medium text-neutral-400">DLNA Server Stopped</p>
                <p className="text-sm text-neutral-500">Start to enable VLC discovery</p>
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
              className="flex-1 flex items-center justify-center gap-2 p-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-xl transition font-medium"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              Start DLNA Server
            </button>
          ) : (
            <button
              onClick={stopDlna}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 p-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl transition font-medium"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              Stop DLNA Server
            </button>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-900/20 border border-green-800 rounded-lg text-green-400 text-sm mb-4">
            {success}
          </div>
        )}

        {/* Instructions */}
        <div className="space-y-4 text-sm text-neutral-400">
          <div>
            <p className="font-medium text-neutral-300 mb-2">How to use:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Click "Start DLNA Server" above</li>
              <li>Open VLC on your phone</li>
              <li>Go to "Browse" → "Network"</li>
              <li>Look for "LocalFlix Media Server"</li>
              <li>Tap it to see your movies</li>
              <li>Select a movie to play!</li>
            </ol>
          </div>

          <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
            <p className="text-blue-300 text-xs">
              <strong>Note:</strong> Both devices must be on the same WiFi network.
              This works like Windows Media Server - VLC auto-discovers your library!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
