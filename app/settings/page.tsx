'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Save, RefreshCw, Settings as SettingsIcon, Folder, Key, Monitor, Keyboard } from 'lucide-react';
import Link from 'next/link';

type Settings = {
    vlcPath: string;
    tmdbApiKey: string;
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
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-700 text-white font-medium rounded-lg flex items-center gap-2 transition"
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

export default function SettingsPage() {
    const [settings, setSettings] = useState<Settings>({
        vlcPath: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
        tmdbApiKey: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            setSettings({
                vlcPath: data.vlcPath || 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
                tmdbApiKey: data.tmdbApiKey || ''
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
                        <SettingsIcon className="w-6 h-6 text-red-500" />
                        <h1 className="text-2xl font-bold">Settings</h1>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">

                {/* VLC Path */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Monitor className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold">Video Player</h2>
                    </div>
                    <div className="p-6">
                        <label className="block text-sm text-neutral-400 mb-2">VLC Executable Path</label>
                        <input
                            type="text"
                            value={settings.vlcPath}
                            onChange={(e) => setSettings(prev => ({ ...prev, vlcPath: e.target.value }))}
                            className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-3 outline-none focus:border-red-600 transition font-mono text-sm"
                            placeholder="C:\Program Files\VideoLAN\VLC\vlc.exe"
                        />
                        <p className="text-xs text-neutral-500 mt-2">
                            Path to the VLC media player executable. Localflix uses VLC to play media files.
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
                            className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-3 outline-none focus:border-red-600 transition font-mono text-sm"
                            placeholder="Enter your TMDB API key"
                        />
                        <p className="text-xs text-neutral-500 mt-2">
                            Used to fetch movie/show metadata, posters, and ratings. Get a free key at{' '}
                            <a href="https://www.themoviedb.org/settings/api" target="_blank" className="text-red-500 hover:underline">
                                themoviedb.org
                            </a>
                        </p>
                    </div>
                </section>

                {/* Keyboard Shortcuts Reference */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Keyboard className="w-5 h-5 text-green-500" />
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
                        <RefreshCw className="w-5 h-5 text-purple-500" />
                        <h2 className="text-lg font-semibold">Metadata Refresh</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-neutral-400 text-sm mb-4">
                            If some movies or shows are missing posters, ratings, or descriptions, you can refresh
                            their metadata from TMDB. This will attempt to re-fetch information for all items
                            that are currently missing poster images.
                        </p>
                        <RefreshMetadataButton />
                    </div>
                </section>

                {/* Library Info */}
                <section className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                    <div className="p-6 border-b border-neutral-800 flex items-center gap-3">
                        <Folder className="w-5 h-5 text-orange-500" />
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
                        className="px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-neutral-700 text-white font-bold rounded-lg flex items-center gap-2 transition"
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
