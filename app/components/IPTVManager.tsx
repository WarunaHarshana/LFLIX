'use client';

import type React from 'react';
import { useState, useRef } from 'react';
import { X, Upload, Plus, Tv, Globe, Link, FileText, Trash2 } from 'lucide-react';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';
import LiquidDropdown from './LiquidDropdown';

type Props = {
  onClose: () => void;
  onChannelsUpdated: () => void;
};

export default function IPTVManager({ onClose, onChannelsUpdated }: Props) {
    const modalRef = useModalBehavior(true, onClose, { trapFocus: true });

  const [activeTab, setActiveTab] = useState<'add' | 'import'>('add');
  const [importTab, setImportTab] = useState<'public' | 'url' | 'file'>('public');

  // Manual add
  const [newChannel, setNewChannel] = useState({
    name: '',
    url: '',
    logo: '',
    category: 'General'
  });

  // Import
  const [m3uUrl, setM3uUrl] = useState('');
  const [m3uContent, setM3uContent] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddChannel = async () => {
    if (!newChannel.name || !newChannel.url) {
      setMessage('Name and URL are required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/iptv/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newChannel)
      });

      if (res.ok) {
        setMessage('✅ Channel added!');
        setNewChannel({ name: '', url: '', logo: '', category: 'General' });
        onChannelsUpdated();
      } else {
        const data = await res.json();
        setMessage(`❌ ${data.error || 'Failed to add'}`);
      }
    } catch (error) {
      setMessage('❌ Network error');
    }
    setLoading(false);
  };

  const handleImportPublic = async () => {
    setLoading(true);
    setMessage('Fetching free IPTV channels...');

    try {
      const res = await fetch('/api/iptv/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'iptv-org' })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ Imported ${data.imported} channels from iptv-org!`);
        onChannelsUpdated();
      } else {
        setMessage(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (error) {
      setMessage('❌ Network error');
    }
    setLoading(false);
  };

  const handleImportUrlWithValue = async (url: string) => {
    setLoading(true);
    setMessage(`Fetching channels...`);

    try {
      const res = await fetch('/api/iptv/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ m3uUrl: url })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ Imported ${data.imported} channels!`);
        onChannelsUpdated();
      } else {
        setMessage(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (error) {
      setMessage('❌ Network error');
    }
    setLoading(false);
  };

  const handleImportUrl = async () => {
    if (!m3uUrl.trim()) {
      setMessage('Please enter an M3U URL');
      return;
    }

    setLoading(true);
    setMessage('Fetching playlist...');

    try {
      const res = await fetch('/api/iptv/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ m3uUrl })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ Imported ${data.imported} channels!`);
        setM3uUrl('');
        onChannelsUpdated();
      } else {
        setMessage(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (error) {
      setMessage('❌ Network error');
    }
    setLoading(false);
  };

  const handleImportFile = async () => {
    if (!m3uContent.trim()) {
      setMessage('Please paste M3U content or upload a file');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/iptv/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ m3uContent })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ Imported ${data.imported} channels!`);
        setM3uContent('');
        onChannelsUpdated();
      } else {
        setMessage(`❌ ${data.error || 'Import failed'}`);
      }
    } catch (error) {
      setMessage('❌ Network error');
    }
    setLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setM3uContent(e.target?.result as string);
        setMessage(`📄 Loaded ${file.name}`);
      };
      reader.readAsText(file);
    }
  };

  const handleClearAllChannels = async () => {
    setLoading(true);
    setMessage('Clearing all channels...');

    try {
      const res = await fetch('/api/iptv/channels/clear', {
        method: 'DELETE'
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ Cleared ${data.deleted} channels!`);
        setShowConfirmClear(false);
        onChannelsUpdated();
      } else {
        setMessage(`❌ ${data.error || 'Failed to clear'}`);
      }
    } catch (error) {
      setMessage('❌ Network error');
    }
    setLoading(false);
  };

  return (
    <div ref={modalRef as React.RefObject<HTMLDivElement>} role="dialog" aria-modal="true" aria-label="Manage channels" className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[70] p-4">
      <div className="liquid-glass-base border border-white/20 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-red-600/[0.04] rounded-full blur-3xl pointer-events-none" />
        <div className="p-5 border-b border-white/10 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-red-600/30 to-red-600/10 border border-red-500/30 rounded-2xl text-red-500 shadow-md">
              <Tv className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-lg tracking-tight">Live TV Manager</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfirmClear(true)}
              className="px-3.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 hover:text-white text-xs md:text-sm font-semibold rounded-xl transition-all flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All</span>
            </button>
            <button onClick={onClose} className="p-2 liquid-glass-pill hover:scale-105 border border-white/10 rounded-xl text-neutral-400 hover:text-white transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Clear All Confirmation */}
        {showConfirmClear && (
          <div className="p-4 bg-red-950/60 border-b border-red-500/30 relative z-10">
            <p className="text-red-300 text-sm mb-3 font-medium">⚠️ Are you sure you want to remove all channels? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={handleClearAllChannels}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs md:text-sm font-bold rounded-xl transition shadow-lg shadow-red-900/30 disabled:opacity-50"
              >
                Yes, Clear All
              </button>
              <button
                onClick={() => setShowConfirmClear(false)}
                className="px-4 py-2 liquid-glass-pill border border-white/15 text-white text-xs md:text-sm font-semibold rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-white/10 relative z-10">
          <button
            onClick={() => setActiveTab('add')}
            className={`flex-1 py-3.5 text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'add' ? 'text-white border-b-2 border-white/60 bg-white/[0.06]' : 'text-neutral-400 hover:text-white hover:bg-white/[0.02]'
              }`}
          >
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-3.5 text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'import' ? 'text-white border-b-2 border-white/60 bg-white/[0.06]' : 'text-neutral-400 hover:text-white hover:bg-white/[0.02]'
              }`}
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
        </div>

        <div className="p-6 overflow-y-auto relative z-10 custom-scrollbar">
          {message && (
            <div className={`mb-4 p-3.5 rounded-2xl text-xs md:text-sm font-medium ${message.startsWith('✅')
              ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
              : message.startsWith('📄')
                ? 'bg-blue-950/40 border border-blue-500/30 text-blue-300'
                : 'bg-red-950/40 border border-red-500/30 text-red-300'
              }`}>
              {message}
            </div>
          )}

          {activeTab === 'add' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-semibold text-neutral-300 mb-1.5 uppercase tracking-wider">Channel Name</label>
                <input
                  type="text"
                  value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  placeholder="e.g. CNN"
                  className="w-full bg-white/[0.04] border border-white/15 focus:border-red-400/50 focus:bg-white/[0.08] rounded-2xl px-4 py-2.5 text-sm text-white outline-none transition-all shadow-inner"
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-semibold text-neutral-300 mb-1.5 uppercase tracking-wider">Stream URL (M3U8)</label>
                <input
                  type="text"
                  value={newChannel.url}
                  onChange={(e) => setNewChannel({ ...newChannel, url: e.target.value })}
                  placeholder="https://example.com/stream.m3u8"
                  className="w-full bg-white/[0.04] border border-white/15 focus:border-red-400/50 focus:bg-white/[0.08] rounded-2xl px-4 py-2.5 text-sm text-white outline-none transition-all shadow-inner"
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-semibold text-neutral-300 mb-1.5 uppercase tracking-wider">Logo URL (optional)</label>
                <input
                  type="text"
                  value={newChannel.logo}
                  onChange={(e) => setNewChannel({ ...newChannel, logo: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="w-full bg-white/[0.04] border border-white/15 focus:border-red-400/50 focus:bg-white/[0.08] rounded-2xl px-4 py-2.5 text-sm text-white outline-none transition-all shadow-inner"
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-semibold text-neutral-300 mb-1.5 uppercase tracking-wider">Category</label>
                <LiquidDropdown
                  label="Category"
                  title="Channel Category"
                  options={[
                    { id: 'General', name: 'General' },
                    { id: 'Sports', name: 'Sports' },
                    { id: 'News', name: 'News' },
                    { id: 'Entertainment', name: 'Entertainment' },
                    { id: 'Movies', name: 'Movies' },
                    { id: 'Kids', name: 'Kids' },
                    { id: 'Music', name: 'Music' },
                  ]}
                  value={newChannel.category}
                  onChange={(val) => setNewChannel({ ...newChannel, category: val })}
                  className="w-full"
                  menuWidth="w-full"
                />
              </div>
              <button
                onClick={handleAddChannel}
                disabled={loading}
                className="w-full py-3.5 liquid-btn-primary text-black font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] mt-2 cursor-pointer disabled:opacity-50 text-sm sm:text-base"
              >
                <Plus className="w-5 h-5 text-black" />
                {loading ? 'Adding...' : 'Add Channel'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Import Type Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setImportTab('public')}
                  className={`flex-1 py-2.5 text-xs md:text-sm font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 ${importTab === 'public'
                    ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                    : 'liquid-glass-pill border border-white/10 text-neutral-400 hover:text-white'
                    }`}
                >
                  <Globe className="w-4 h-4" />
                  Free Channels
                </button>
                <button
                  onClick={() => setImportTab('url')}
                  className={`flex-1 py-2.5 text-xs md:text-sm font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 ${importTab === 'url'
                    ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                    : 'liquid-glass-pill border border-white/10 text-neutral-400 hover:text-white'
                    }`}
                >
                  <Link className="w-4 h-4" />
                  M3U URL
                </button>
                <button
                  onClick={() => setImportTab('file')}
                  className={`flex-1 py-2.5 text-xs md:text-sm font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 ${importTab === 'file'
                    ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                    : 'liquid-glass-pill border border-white/10 text-neutral-400 hover:text-white'
                    }`}
                >
                  <FileText className="w-4 h-4" />
                  File
                </button>
              </div>

              {importTab === 'public' && (
                <div className="space-y-4">
                  <div className="liquid-glass-base border border-emerald-500/30 rounded-3xl p-5 shadow-lg">
                    <h4 className="font-bold text-emerald-300 mb-1.5">Free Public IPTV</h4>
                    <p className="text-xs sm:text-sm text-emerald-200/70 mb-4">
                      Import free channels from iptv-org. Select a region or import all worldwide channels.
                    </p>

                    {/* Quick Country Buttons */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <button
                        onClick={() => { setM3uUrl('https://iptv-org.github.io/iptv/index.m3u'); handleImportPublic(); }}
                        disabled={loading}
                        className="py-2.5 px-3 liquid-glass-pill hover:bg-white/[0.12] border border-white/15 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <Globe className="w-4 h-4 text-neutral-400" />
                        <span>Worldwide (8000+)</span>
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/lk.m3u')}
                        disabled={loading}
                        className="py-2.5 px-3 liquid-glass-pill hover:bg-white/[0.12] border border-white/15 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <span>Sri Lanka</span>
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/us.m3u')}
                        disabled={loading}
                        className="py-2.5 px-3 liquid-glass-pill hover:bg-white/[0.12] border border-white/15 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <span>United States</span>
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/in.m3u')}
                        disabled={loading}
                        className="py-2.5 px-3 liquid-glass-pill hover:bg-white/[0.12] border border-white/15 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <span>India</span>
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/gb.m3u')}
                        disabled={loading}
                        className="py-2.5 px-3 liquid-glass-pill hover:bg-white/[0.12] border border-white/15 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <span>United Kingdom</span>
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/ca.m3u')}
                        disabled={loading}
                        className="py-2.5 px-3 liquid-glass-pill hover:bg-white/[0.12] border border-white/15 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <span>Canada</span>
                      </button>
                    </div>

                    <button
                      onClick={handleImportPublic}
                      disabled={loading}
                      className="w-full py-3.5 liquid-btn-emerald disabled:opacity-50 text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer"
                    >
                      <Globe className="w-5 h-5" />
                      {loading ? 'Fetching...' : 'Import All Worldwide Channels'}
                    </button>
                  </div>
                </div>
              )}

              {importTab === 'url' && (
                <div className="space-y-4">
                  <div className="liquid-glass-base border border-blue-500/30 rounded-3xl p-5 shadow-lg">
                    <h4 className="font-bold text-blue-300 mb-1.5">Import from URL</h4>
                    <p className="text-xs sm:text-sm text-blue-200/70 mb-4">
                      Paste your IPTV provider's M3U playlist URL
                    </p>
                    <input
                      type="text"
                      value={m3uUrl}
                      onChange={(e) => setM3uUrl(e.target.value)}
                      placeholder="http://provider.com/playlist.m3u"
                      className="w-full bg-white/[0.04] border border-white/15 focus:border-blue-400/50 focus:bg-white/[0.08] rounded-2xl px-4 py-2.5 text-sm text-white outline-none mb-3 shadow-inner"
                    />
                    <button
                      onClick={handleImportUrl}
                      disabled={loading}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-950/50"
                    >
                      <Link className="w-5 h-5" />
                      {loading ? 'Fetching...' : 'Import from URL'}
                    </button>
                  </div>
                </div>
              )}

              {importTab === 'file' && (
                <div className="space-y-4">
                  <div className="liquid-glass-base border border-purple-500/30 rounded-3xl p-5 shadow-lg">
                    <h4 className="font-bold text-purple-300 mb-1.5">Upload M3U File</h4>
                    <p className="text-xs sm:text-sm text-purple-200/70 mb-4">
                      Upload an .m3u or .m3u8 file from your device
                    </p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".m3u,.m3u8"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <textarea
                      value={m3uContent}
                      onChange={(e) => setM3uContent(e.target.value)}
                      placeholder="#EXTM3U\n#EXTINF:-1,Channel Name\nhttp://stream-url.m3u8"
                      rows={6}
                      className="w-full bg-white/[0.04] border border-white/15 focus:border-purple-400/50 focus:bg-white/[0.08] rounded-2xl px-4 py-2.5 font-mono text-xs sm:text-sm text-white outline-none mb-3 shadow-inner"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 py-3 liquid-glass-pill border border-white/15 hover:scale-105 text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-md"
                      >
                        <Upload className="w-5 h-5" />
                        Choose File
                      </button>
                      <button
                        onClick={handleImportFile}
                        disabled={loading || !m3uContent}
                        className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50"
                      >
                        <FileText className="w-5 h-5" />
                        {loading ? 'Importing...' : 'Import'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
