'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Save, RefreshCw, Settings as SettingsIcon, Folder, Key, Monitor, Keyboard, Download, HardDrive, Eye, Palette, Activity } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '../components/ThemeProvider';

type Settings = {
    vlcPath: string;
    tmdbApiKey: string;
    omdbApiKey: string;
    downloadPath: string;
};

// Component for refresh metadata button
function RefreshMetadataButton() {
    const [refreshing, setRefreshing] = useState(false);
    const [result, setResult] = useState<{ refreshed: number; total: number } | null>(null);

    const handleRefresh = async () => {
        setRefreshing(true);
        setResult(null);
        try {
            const res = await fetch('/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            const data = await res.json();
            setResult({ refreshed: data.refreshed || 0, total: data.total || 0 });
        } catch (e) {
            console.error('Refresh failed', e);
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className="flex items-center gap-4">
            <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-white hover:bg-neutral-200 disabled:bg-neutral-700 text-black font-medium rounded-lg flex items-center gap-2 transition"
            >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh Missing Metadata'}
            </button>
            {result && (
                <span className="text-sm text-neutral-400">
                    Updated {result.refreshed} of {result.total} items
                </span>
            )}
        </div>
    );
}

// Component for re-probe media info button
function ReprobeButton() {
    const [reprobing, setReprobing] = useState(false);
    const [result, setResult] = useState<{ updated: number; total: number; failed: number } | null>(null);

    const handleReprobe = async () => {
        setReprobing(true);
        setResult(null);
        try {
            const res = await fetch('/api/reprobe', { method: 'POST' });
            const data = await res.json();
            setResult({ updated: data.updated || 0, total: data.total || 0, failed: data.failed || 0 });
        } catch (e) {
            console.error('Reprobe failed', e);
        } finally {
            setReprobing(false);
        }
    };

    return (
        <div className="flex items-center gap-4">
            <button
                onClick={handleReprobe}
                disabled={reprobing}
                className="px-4 py-2 bg-white hover:bg-neutral-200 disabled:bg-neutral-700 text-black font-medium rounded-lg flex items-center gap-2 transition"
            >
                <HardDrive className={`w-4 h-4 ${reprobing ? 'animate-pulse' : ''}`} />
                {reprobing ? 'Re-probing...' : 'Re-probe Media Info'}
            </button>
            {result && (
                <span className="text-sm text-neutral-400">
                    Updated {result.updated} of {result.total} files{result.failed > 0 ? ` (${result.failed} failed)` : ''}
                </span>
            )}
        </div>
    );
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<Settings>({
        vlcPath: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
        tmdbApiKey: '',
        omdbApiKey: '',
        downloadPath: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const { theme, setTheme, accent, setAccent, isMounted } = useTheme();

    // Display preferences (localStorage only)
    const [displayPrefs, setDisplayPrefs] = useState({ showTitles: true, showRatings: true, cinematicMode: false });
    useEffect(() => {
        try {
            const saved = localStorage.getItem('lflix-display-prefs');
            if (saved) setDisplayPrefs(JSON.parse(saved));
        } catch {}
    }, []);
    const updateDisplayPref = (key: string, value: boolean) => {
        const updated = { ...displayPrefs, [key]: value };
        setDisplayPrefs(updated);
        localStorage.setItem('lflix-display-prefs', JSON.stringify(updated));
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            setSettings({
                vlcPath: data.vlcPath || 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
                tmdbApiKey: data.tmdbApiKey || '',
                omdbApiKey: data.omdbApiKey || '',
                downloadPath: data.downloadPath || ''
            });
        } catch (e) {
            console.error('Failed to load settings', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Failed to save settings', e);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-neutral-500" />
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-black text-white">
            {/* Header */}
            <div className="bg-neutral-900 border-b border-neutral-800">
                <div className="max-w-4xl mx-auto px-8 py-6 flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-neutral-800 rounded-full transition">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <SettingsIcon className="w-6 h-6 text-[var(--text-secondary)]" />
                        <h1 className="text-2xl font-bold">Settings</h1>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">

                {/* Diagnostics */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Activity className="w-5 h-5 text-[var(--text-secondary)]" />
                        <h2 className="text-lg font-semibold">Diagnostics</h2>
                    </div>
                    <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="font-medium text-white">System health</div>
                            <div className="mt-1 text-sm text-neutral-400">Database, downloads, release queue, and torrent source status</div>
                        </div>
                        <Link
                            href="/diagnostics"
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium transition hover:bg-neutral-700"
                        >
                            <Activity className="w-4 h-4" />
                            Open Diagnostics
                        </Link>
                    </div>
                </section>

                {/* VLC Path */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Monitor className="w-5 h-5 text-[var(--text-secondary)]" />
                        <h2 className="text-lg font-semibold">Video Player</h2>
                    </div>
                    <div className="p-6">
                        <label className="block text-sm text-neutral-400 mb-2">Media Player Executable Path</label>
                        <input
                            type="text"
                            value={settings.vlcPath}
                            onChange={(e) => setSettings(prev => ({ ...prev, vlcPath: e.target.value }))}
                            className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-3 outline-none focus:border-white/70 transition font-mono text-sm"
                            placeholder="C:\Program Files\VideoLAN\VLC\vlc.exe"
                        />
                        <p className="text-xs text-neutral-500 mt-2">
                            Path to your media player executable. Supports VLC, PotPlayer, MPC-HC/BE, mpv, and any other player.
                        </p>
                    </div>
                </section>

                {/* Download Path */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Download className="w-5 h-5 text-[var(--text-secondary)]" />
                        <h2 className="text-lg font-semibold">Download Path</h2>
                    </div>
                    <div className="p-6">
                        <label className="block text-sm text-neutral-400 mb-2">Torrent Download Folder</label>
                        <input
                            type="text"
                            value={settings.downloadPath}
                            onChange={(e) => setSettings(prev => ({ ...prev, downloadPath: e.target.value }))}
                            className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-3 outline-none focus:border-white/70 transition font-mono text-sm"
                            placeholder="C:\Users\you\Downloads\Movies"
                        />
                        <p className="text-xs text-neutral-500 mt-2">
                            Where torrent downloads will be saved. Use a folder that is also in your library for auto-import.
                        </p>
                    </div>
                </section>

                {/* TMDB API Key */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Key className="w-5 h-5 text-yellow-500" />
                        <h2 className="text-lg font-semibold">TMDB Integration</h2>
                    </div>
                    <div className="p-6">
                        <label className="block text-sm text-neutral-400 mb-2">API Key</label>
                        <input
                            type="password"
                            value={settings.tmdbApiKey}
                            onChange={(e) => setSettings(prev => ({ ...prev, tmdbApiKey: e.target.value }))}
                            className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-3 outline-none focus:border-white/70 transition font-mono text-sm"
                            placeholder="Using built-in TMDB key"
                        />
                        <p className="text-xs text-neutral-500 mt-2">
                            Optional override for movie/show metadata, posters, and ratings. Leave blank to use the built-in key, or get your own at{' '}
                            <a href="https://www.themoviedb.org/settings/api" target="_blank" className="text-white hover:underline">
                                themoviedb.org
                            </a>
                        </p>
                    </div>
                </section>

                {/* OMDb API Key */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Key className="w-5 h-5 text-yellow-500" />
                        <h2 className="text-lg font-semibold">OMDb Integration</h2>
                    </div>
                    <div className="p-6">
                        <label className="block text-sm text-neutral-400 mb-2">API Key</label>
                        <input
                            type="password"
                            value={settings.omdbApiKey}
                            onChange={(e) => setSettings(prev => ({ ...prev, omdbApiKey: e.target.value }))}
                            className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-3 outline-none focus:border-white/70 transition font-mono text-sm"
                            placeholder="Enter your OMDb API key"
                        />
                        <p className="text-xs text-neutral-500 mt-2">
                            Used to fetch real IMDb ratings by IMDb ID. Get a key at{' '}
                            <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" className="text-white hover:underline">
                                omdbapi.com
                            </a>
                        </p>
                    </div>
                </section>

                {/* Display Preferences */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Eye className="w-5 h-5 text-[var(--text-secondary)]" />
                        <h2 className="text-lg font-semibold">Display Preferences</h2>
                    </div>
                    <div className="p-6 space-y-5">
                        <p className="text-neutral-400 text-sm">
                            Customize what information is shown on the home page.
                        </p>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-neutral-300 group-hover:text-white transition">Show titles on poster cards</span>
                            <button
                                onClick={() => updateDisplayPref('showTitles', !displayPrefs.showTitles)}
                                className={`w-11 h-6 rounded-full transition-colors relative ${
                                    displayPrefs.showTitles ? 'bg-white' : 'bg-neutral-700'
                                }`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                                    displayPrefs.showTitles ? 'translate-x-5 bg-black' : ''
                                }`} />
                            </button>
                        </label>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-neutral-300 group-hover:text-white transition">Show ratings on poster cards</span>
                            <button
                                onClick={() => updateDisplayPref('showRatings', !displayPrefs.showRatings)}
                                className={`w-11 h-6 rounded-full transition-colors relative ${
                                    displayPrefs.showRatings ? 'bg-white' : 'bg-neutral-700'
                                }`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                                    displayPrefs.showRatings ? 'translate-x-5 bg-black' : ''
                                }`} />
                            </button>
                        </label>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-neutral-300 group-hover:text-white transition">Cinematic mode <span className="text-neutral-500 text-xs">(simplified navbar)</span></span>
                            <button
                                onClick={() => updateDisplayPref('cinematicMode', !displayPrefs.cinematicMode)}
                                className={`w-11 h-6 rounded-full transition-colors relative ${
                                    displayPrefs.cinematicMode ? 'bg-white' : 'bg-neutral-700'
                                }`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                                    displayPrefs.cinematicMode ? 'translate-x-5 bg-black' : ''
                                }`} />
                            </button>
                        </label>
                    </div>
                </section>

                {/* Appearance Preferences */}
                {isMounted && (
                    <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                        <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                            <Palette className="w-5 h-5 text-[var(--text-secondary)]" />
                            <h2 className="text-lg font-semibold">Appearance</h2>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Theme Toggle */}
                            <div>
                                <h3 className="text-sm text-neutral-400 mb-3">Base Theme</h3>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition ${
                                            theme === 'dark' 
                                                ? 'bg-neutral-800 border-white text-white' 
                                                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                                        }`}
                                    >
                                        <div className="w-4 h-4 rounded-full bg-[#141414] border border-neutral-600"></div>
                                        Dark Theme
                                    </button>
                                    <button
                                        onClick={() => setTheme('oled')}
                                        className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition ${
                                            theme === 'oled' 
                                                ? 'bg-neutral-800 border-white text-white' 
                                                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                                        }`}
                                    >
                                        <div className="w-4 h-4 rounded-full bg-black border border-neutral-600"></div>
                                        OLED Black
                                    </button>
                                </div>
                            </div>

                            {/* Accent Color */}
                            <div>
                                <h3 className="text-sm text-neutral-400 mb-3">Accent Color</h3>
                                <div className="flex gap-4 flex-wrap">
                                    {[
                                        { id: 'default', color: '#f5f5f5', label: 'Default' },
                                        { id: 'red', color: '#e50914', label: 'Netflix Red' },
                                        { id: 'blue', color: '#3b82f6', label: 'Blue' },
                                        { id: 'purple', color: '#8b5cf6', label: 'Purple' },
                                        { id: 'green', color: '#10b981', label: 'Green' },
                                    ].map((acc) => (
                                        <button
                                            key={acc.id}
                                            onClick={() => setAccent(acc.id as any)}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition ${
                                                accent === acc.id 
                                                    ? 'border-white bg-neutral-800 text-white' 
                                                    : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                                            }`}
                                        >
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color }}></div>
                                            {acc.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Keyboard Shortcuts Reference */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Keyboard className="w-5 h-5 text-[var(--text-secondary)]" />
                        <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-3">
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-mono">←</kbd>
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-mono">→</kbd>
                                <span className="text-neutral-400">Navigate horizontally</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-mono">↑</kbd>
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-mono">↓</kbd>
                                <span className="text-neutral-400">Navigate vertically</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-mono">Enter</kbd>
                                <span className="text-neutral-400">Play / Open selected item</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-mono">Esc</kbd>
                                <span className="text-neutral-400">Close modal / Cancel</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-mono">/</kbd>
                                <span className="text-neutral-400">Open search</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-mono">F</kbd>
                                <span className="text-neutral-400">Open folder manager</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Metadata Refresh */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <RefreshCw className="w-5 h-5 text-[var(--text-secondary)]" />
                        <h2 className="text-lg font-semibold">Metadata Refresh</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-neutral-400 text-sm mb-4">
                            If some movies or shows are missing posters, ratings, or descriptions, you can refresh
                            their metadata from TMDB and IMDb ratings from OMDb. This will attempt to re-fetch information for items
                            that are currently missing poster images or IMDb ratings.
                        </p>
                        <RefreshMetadataButton />
                    </div>
                </section>

                {/* Re-probe Media Info */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <HardDrive className="w-5 h-5 text-[var(--text-secondary)]" />
                        <h2 className="text-lg font-semibold">Media Info</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-neutral-400 text-sm mb-4">
                            Re-scan all media files with FFprobe to detect the correct resolution, video/audio codecs,
                            HDR status, and audio channels. Use this if resolution or codec information appears wrong.
                        </p>
                        <ReprobeButton />
                    </div>
                </section>

                {/* Library Info */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Folder className="w-5 h-5 text-[var(--text-secondary)]" />
                        <h2 className="text-lg font-semibold">Library</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-neutral-400 text-sm mb-4">
                            Manage your library folders from the main page by clicking the{' '}
                            <span className="text-white font-medium">+</span> button or pressing{' '}
                            <kbd className="px-2 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono">F</kbd>
                        </p>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition text-sm"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Library
                        </Link>
                    </div>
                </section>

                {/* Save Button */}
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-3 bg-white hover:bg-neutral-200 disabled:bg-neutral-700 text-black font-bold rounded-lg flex items-center gap-2 transition"
                    >
                        {saving ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : saved ? (
                            <>✓ Saved</>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Save Settings
                            </>
                        )}
                    </button>
                </div>
            </div>
        </main>
    );
}
