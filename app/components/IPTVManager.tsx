'use client';

import { useState, useRef } from 'react';
import { X, Upload, Plus, Tv, Globe, Link, FileText, Trash2 } from 'lucide-react';

type Props = {
  onClose: () => void;
  onChannelsUpdated: () => void;
};

export default function IPTVManager({ onClose, onChannelsUpdated }: Props) {
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 rounded-lg">
              <Tv className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-white text-lg">Live TV Manager</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfirmClear(true)}
              className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-400 hover:text-white text-sm font-medium rounded-lg transition flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Clear All
            </button>
            <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Clear All Confirmation */}
        {showConfirmClear && (
          <div className="p-4 bg-red-950/50 border-b border-red-800">
            <p className="text-red-400 text-sm mb-3">⚠️ Are you sure you want to remove all channels? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={handleClearAllChannels}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                Yes, Clear All
              </button>
              <button
                onClick={() => setShowConfirmClear(false)}
                className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-neutral-800">
          <button
            onClick={() => setActiveTab('add')}
            className={`flex-1 py-3 text-sm font-medium transition flex items-center justify-center gap-2 ${activeTab === 'add' ? 'text-red-400 border-b-2 border-red-600' : 'text-neutral-400 hover:text-white'
              }`}
          >
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-3 text-sm font-medium transition flex items-center justify-center gap-2 ${activeTab === 'import' ? 'text-red-400 border-b-2 border-red-600' : 'text-neutral-400 hover:text-white'
              }`}
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${message.startsWith('✅')
              ? 'bg-emerald-900/30 border border-emerald-800 text-emerald-400'
              : message.startsWith('📄')
                ? 'bg-blue-900/30 border border-blue-800 text-blue-400'
                : 'bg-red-900/30 border border-red-800 text-red-400'
              }`}>
              {message}
            </div>
          )}

          {activeTab === 'add' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Channel Name</label>
                <input
                  type="text"
                  value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  placeholder="e.g. CNN"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Stream URL (M3U8)</label>
                <input
                  type="text"
                  value={newChannel.url}
                  onChange={(e) => setNewChannel({ ...newChannel, url: e.target.value })}
                  placeholder="https://example.com/stream.m3u8"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Logo URL (optional)</label>
                <input
                  type="text"
                  value={newChannel.logo}
                  onChange={(e) => setNewChannel({ ...newChannel, logo: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Category</label>
                <select
                  value={newChannel.category}
                  onChange={(e) => setNewChannel({ ...newChannel, category: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-600 outline-none"
                >
                  <option value="General">General</option>
                  <option value="Sports">Sports</option>
                  <option value="News">News</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Movies">Movies</option>
                  <option value="Kids">Kids</option>
                  <option value="Music">Music</option>
                </select>
              </div>
              <button
                onClick={handleAddChannel}
                disabled={loading}
                className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                {loading ? 'Adding...' : 'Add Channel'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Import Type Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setImportTab('public')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition flex items-center justify-center gap-2 ${importTab === 'public'
                    ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                >
                  <Globe className="w-4 h-4" />
                  Free Channels
                </button>
                <button
                  onClick={() => setImportTab('url')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition flex items-center justify-center gap-2 ${importTab === 'url'
                    ? 'bg-blue-900/30 text-blue-400 border border-blue-800'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                >
                  <Link className="w-4 h-4" />
                  M3U URL
                </button>
                <button
                  onClick={() => setImportTab('file')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition flex items-center justify-center gap-2 ${importTab === 'file'
                    ? 'bg-purple-900/30 text-purple-400 border border-purple-800'
                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                >
                  <FileText className="w-4 h-4" />
                  File
                </button>
              </div>

              {importTab === 'public' && (
                <div className="space-y-4">
                  <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-lg p-4">
                    <h4 className="font-medium text-emerald-400 mb-2">Free Public IPTV</h4>
                    <p className="text-sm text-emerald-300/70 mb-4">
                      Import free channels from iptv-org. Select a region or import all worldwide channels.
                    </p>

                    {/* Quick Country Buttons */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <button
                        onClick={() => { setM3uUrl('https://iptv-org.github.io/iptv/index.m3u'); handleImportPublic(); }}
                        disabled={loading}
                        className="py-2 px-3 bg-emerald-700/50 hover:bg-emerald-600/50 disabled:bg-neutral-800 text-emerald-100 text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                      >
                        <Globe className="w-4 h-4" />
                        🌍 Worldwide (8000+)
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/lk.m3u')}
                        disabled={loading}
                        className="py-2 px-3 bg-amber-700/50 hover:bg-amber-600/50 disabled:bg-neutral-800 text-amber-100 text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                      >
                        🇱🇰 Sri Lanka
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/us.m3u')}
                        disabled={loading}
                        className="py-2 px-3 bg-blue-700/50 hover:bg-blue-600/50 disabled:bg-neutral-800 text-blue-100 text-sm font-medium rounded-lg transition"
                      >
                        🇺🇸 United States
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/in.m3u')}
                        disabled={loading}
                        className="py-2 px-3 bg-orange-700/50 hover:bg-orange-600/50 disabled:bg-neutral-800 text-orange-100 text-sm font-medium rounded-lg transition"
                      >
                        🇮🇳 India
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/gb.m3u')}
                        disabled={loading}
                        className="py-2 px-3 bg-purple-700/50 hover:bg-purple-600/50 disabled:bg-neutral-800 text-purple-100 text-sm font-medium rounded-lg transition"
                      >
                        🇬🇧 United Kingdom
                      </button>
                      <button
                        onClick={() => handleImportUrlWithValue('https://iptv-org.github.io/iptv/countries/ca.m3u')}
                        disabled={loading}
                        className="py-2 px-3 bg-red-700/50 hover:bg-red-600/50 disabled:bg-neutral-800 text-red-100 text-sm font-medium rounded-lg transition"
                      >
                        🇨🇦 Canada
                      </button>
                    </div>

                    <button
                      onClick={handleImportPublic}
                      disabled={loading}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Globe className="w-5 h-5" />
                      {loading ? 'Fetching...' : 'Import All Worldwide Channels'}
                    </button>
                  </div>
                </div>
              )}

              {importTab === 'url' && (
                <div className="space-y-4">
                  <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
                    <h4 className="font-medium text-blue-400 mb-2">Import from URL</h4>
                    <p className="text-sm text-blue-300/70 mb-4">
                      Paste your IPTV provider's M3U playlist URL
                    </p>
                    <input
                      type="text"
                      value={m3uUrl}
                      onChange={(e) => setM3uUrl(e.target.value)}
                      placeholder="http://provider.com/playlist.m3u"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-600 outline-none mb-3"
                    />
                    <button
                      onClick={handleImportUrl}
                      disabled={loading}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                    >
                      <Link className="w-5 h-5" />
                      {loading ? 'Fetching...' : 'Import from URL'}
                    </button>
                  </div>
                </div>
              )}

              {importTab === 'file' && (
                <div className="space-y-4">
                  <div className="bg-purple-900/20 border border-purple-800/50 rounded-lg p-4">
                    <h4 className="font-medium text-purple-400 mb-2">Upload M3U File</h4>
                    <p className="text-sm text-purple-300/70 mb-4">
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
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-600 outline-none font-mono text-sm mb-3"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                      >
                        <Upload className="w-5 h-5" />
                        Choose File
                      </button>
                      <button
                        onClick={handleImportFile}
                        disabled={loading || !m3uContent}
                        className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
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
