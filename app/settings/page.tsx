'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Save, RefreshCw, Settings as SettingsIcon, Folder, Key, Monitor, Keyboard, Download, HardDrive, Eye, Palette, Activity, Cloud, CloudUpload, CheckCircle, XCircle, FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '../components/ThemeProvider';

type Settings = {
    vlcPath: string;
    tmdbApiKey: string;
    omdbApiKey: string;
    downloadPath: string;
    autoOrganize?: string;
    gdriveEnabled?: string;
    gdriveRemote?: string;
    gdriveBasePath?: string;
    gdriveTempPath?: string;
    gdriveMountDrive?: string;
    gdriveMountPath?: string;
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
                className="liquid-btn-primary px-4 py-2.5 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center gap-2 transition text-sm shadow-md"
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
                className="liquid-btn-primary px-4 py-2.5 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center gap-2 transition text-sm shadow-md"
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
        downloadPath: '',
        autoOrganize: 'true',
        gdriveEnabled: 'false',
        gdriveRemote: 'gdrive',
        gdriveBasePath: 'Media',
        gdriveTempPath: '',
        gdriveMountDrive: 'Z:',
        gdriveMountPath: 'Z:\\Media',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [tmdbConfigured, setTmdbConfigured] = useState(true);
    const [gdriveStatus, setGdriveStatus] = useState<any>(null);
    const [gdriveActionLoading, setGdriveActionLoading] = useState<string | null>(null);

    const { theme, setTheme, accent, setAccent, isMounted } = useTheme();

    // Display preferences (localStorage only)
    const [displayPrefs, setDisplayPrefs] = useState<{
        showTitles: boolean;
        showRatings: boolean;
        cinematicMode: boolean;
        gridColumns?: number;
    }>({ showTitles: true, showRatings: true, cinematicMode: false, gridColumns: 8 });

    useEffect(() => {
        try {
            const saved = localStorage.getItem('lflix-display-prefs');
            if (saved) {
                const parsed = JSON.parse(saved);
                setDisplayPrefs(prev => ({ ...prev, ...parsed, gridColumns: parsed.gridColumns || 8 }));
            }
        } catch {}
    }, []);

    const updateDisplayPref = (key: string, value: any) => {
        const updated = { ...displayPrefs, [key]: value };
        setDisplayPrefs(updated);
        localStorage.setItem('lflix-display-prefs', JSON.stringify(updated));
    };

    useEffect(() => {
        fetchSettings();
        fetchGdriveStatus();
    }, []);

    const fetchGdriveStatus = async () => {
        try {
            const res = await fetch('/api/gdrive');
            if (res.ok) {
                const data = await res.json();
                setGdriveStatus(data);
            }
        } catch (e) {
            console.error('Failed to load GDrive status', e);
        }
    };

    const handleGdriveAction = async (action: string) => {
        setGdriveActionLoading(action);
        try {
            const res = await fetch('/api/gdrive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (action === 'test') {
                alert(`Connection Test: ${data.success ? 'Successful!' : 'Failed: ' + (data.error || 'Unknown error')}`);
            }
            await fetchGdriveStatus();
        } catch (e) {
            console.error(`GDrive action ${action} failed`, e);
        } finally {
            setGdriveActionLoading(null);
        }
    };

    const handleGdriveAddLibrary = async () => {
        setGdriveActionLoading('add-library');
        try {
            const mountPath = settings.gdriveMountPath || `${settings.gdriveMountDrive}\\${settings.gdriveBasePath}`;
            const moviesPath = `${mountPath}\\Movies`;
            const tvPath = `${mountPath}\\TV Shows`;
            
            await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath: moviesPath, contentType: 'movie' }) });
            await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPath: tvPath, contentType: 'show' }) });
            alert('Google Drive library folders (Z:\\Media\\Movies & Z:\\Media\\TV Shows) added successfully!');
        } catch (e) {
            console.error('Failed to add library folders', e);
        } finally {
            setGdriveActionLoading(null);
        }
    };

    const handleGdriveChange = (field: keyof Settings, value: string) => {
        setSettings(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'gdriveMountDrive' || field === 'gdriveBasePath') {
                const drive = updated.gdriveMountDrive || 'Z:';
                const base = updated.gdriveBasePath || 'Media';
                updated.gdriveMountPath = `${drive}\\${base}`;
            }
            return updated;
        });
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            setSettings({
                vlcPath: data.vlcPath || 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
                tmdbApiKey: data.tmdbApiKey || '',
                omdbApiKey: data.omdbApiKey || '',
                downloadPath: data.downloadPath || '',
                autoOrganize: data.autoOrganize !== undefined ? String(data.autoOrganize) : 'true',
                gdriveEnabled: data.gdriveEnabled !== undefined ? String(data.gdriveEnabled) : 'false',
                gdriveRemote: data.gdriveRemote || 'gdrive',
                gdriveBasePath: data.gdriveBasePath || 'Media',
                gdriveTempPath: data.gdriveTempPath || '',
                gdriveMountDrive: data.gdriveMountDrive || 'Z:',
                gdriveMountPath: data.gdriveMountPath || 'Z:\\Media',
            });
            setTmdbConfigured(data.tmdbConfigured !== false);
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
            <div className="min-h-screen bg-[var(--background)] text-white flex items-center justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-neutral-500" />
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-[var(--background)] text-white pb-16">
            {/* Header */}
            <div className="sticky top-0 z-30 liquid-glass-dock border-b border-white/10 backdrop-blur-2xl">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
                    <Link href="/" className="liquid-orb w-10 h-10 rounded-full flex items-center justify-center transition hover:scale-105" title="Back to Library">
                        <ArrowLeft className="w-5 h-5 text-white" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl liquid-glass-pill flex items-center justify-center">
                            <SettingsIcon className="w-5 h-5 text-white/80" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">

                {/* Diagnostics */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Activity className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">Diagnostics</h2>
                    </div>
                    <div className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="font-medium text-white">System health</div>
                            <div className="mt-1 text-sm text-neutral-400">Database, downloads, local drives, release queue, and torrent source status</div>
                        </div>
                        <Link
                            href="/diagnostics"
                            className="inline-flex items-center justify-center gap-2 rounded-xl liquid-glass-pill px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/15"
                        >
                            <Activity className="w-4 h-4 text-emerald-400" />
                            Open Diagnostics
                        </Link>
                    </div>
                </section>

                {/* VLC Path */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Monitor className="w-4 h-4 text-sky-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">Video Player</h2>
                    </div>
                    <div className="p-6">
                        <label className="block text-sm text-neutral-300 font-medium mb-2">Media Player Executable Path</label>
                        <input
                            type="text"
                            value={settings.vlcPath}
                            onChange={(e) => setSettings(prev => ({ ...prev, vlcPath: e.target.value }))}
                            className="w-full liquid-input rounded-xl px-4 py-3 outline-none text-white transition font-mono text-sm placeholder:text-white/30"
                            placeholder="C:\Program Files\VideoLAN\VLC\vlc.exe"
                        />
                        <p className="text-xs text-neutral-400 mt-2">
                            Path to your media player executable. Supports VLC, PotPlayer, MPC-HC/BE, mpv, and any other player.
                        </p>
                    </div>
                </section>

                {/* Download Path & Organization */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Download className="w-4 h-4 text-violet-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">Downloads & Media Organization</h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <div>
                            <label className="block text-sm text-neutral-300 font-medium mb-2">Torrent Download Folder</label>
                            <input
                                type="text"
                                value={settings.downloadPath}
                                onChange={(e) => setSettings(prev => ({ ...prev, downloadPath: e.target.value }))}
                                className="w-full liquid-input rounded-xl px-4 py-3 outline-none text-white transition font-mono text-sm placeholder:text-white/30"
                                placeholder="C:\Users\you\Downloads\Movies"
                            />
                            <p className="text-xs text-neutral-400 mt-2">
                                Where torrent downloads will be saved. Use a folder that is also in your library for auto-import.
                            </p>
                        </div>

                        <div className="pt-4 border-t border-white/10">
                            <label className="flex items-center justify-between cursor-pointer group">
                                <div className="pr-4">
                                    <div className="text-neutral-200 group-hover:text-white transition font-medium">
                                        Auto-Organize Downloaded Media
                                    </div>
                                    <div className="text-xs text-neutral-400 mt-1 leading-relaxed">
                                        Automatically organize downloaded movies and TV shows into clean folders (e.g. <span className="text-neutral-300">Movie Title (Year)</span> and <span className="text-neutral-300">TV Shows/Show Name/Season N/</span>) and clean up promotional ads, sample clips, and temporary torrent folders.
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSettings(prev => ({ ...prev, autoOrganize: prev.autoOrganize === 'false' ? 'true' : 'false' }))}
                                    className={`w-12 h-7 rounded-full p-0.5 border transition-all duration-300 relative flex-shrink-0 ${
                                        settings.autoOrganize !== 'false'
                                            ? 'bg-white/95 border-white shadow-[0_0_14px_rgba(255,255,255,0.4)]'
                                            : 'bg-white/5 border-white/15 hover:border-white/30'
                                    }`}
                                >
                                    <span className={`block w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${
                                        settings.autoOrganize !== 'false' ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/70'
                                    }`} />
                                </button>
                            </label>
                        </div>
                    </div>
                </section>

                {/* Google Drive Integration */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Cloud className="w-4 h-4 text-[#4285f4]" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">☁️ Google Drive</h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <label className="flex items-center justify-between cursor-pointer group">
                            <div className="pr-4">
                                <div className="text-neutral-200 group-hover:text-white transition font-medium">
                                    Enable Google Drive Downloads
                                </div>
                                <div className="text-xs text-neutral-400 mt-1 leading-relaxed">
                                    Download directly to Google Drive via rclone mount. Requires rclone installed and configured.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleGdriveChange('gdriveEnabled', settings.gdriveEnabled === 'true' ? 'false' : 'true')}
                                className={`w-12 h-7 rounded-full p-0.5 border transition-all duration-300 relative flex-shrink-0 ${
                                    settings.gdriveEnabled === 'true'
                                        ? 'bg-[#4285f4] border-[#4285f4] shadow-[0_0_14px_rgba(66,133,244,0.4)]'
                                        : 'bg-white/5 border-white/15 hover:border-white/30'
                                }`}
                            >
                                <span className={`block w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${
                                    settings.gdriveEnabled === 'true' ? 'translate-x-5 bg-white' : 'translate-x-0 bg-white/70'
                                }`} />
                            </button>
                        </label>

                        <div className={`space-y-6 transition-opacity duration-300 ${settings.gdriveEnabled === 'true' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-neutral-300 font-medium mb-2">Rclone Remote Name</label>
                                    <input
                                        type="text"
                                        value={settings.gdriveRemote || ''}
                                        onChange={(e) => handleGdriveChange('gdriveRemote', e.target.value)}
                                        className="w-full liquid-input rounded-xl px-4 py-3 outline-none text-white transition font-mono text-sm placeholder:text-white/30 focus:border-[#4285f4]"
                                        placeholder="gdrive"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-neutral-300 font-medium mb-2">Base Path on Drive</label>
                                    <input
                                        type="text"
                                        value={settings.gdriveBasePath || ''}
                                        onChange={(e) => handleGdriveChange('gdriveBasePath', e.target.value)}
                                        className="w-full liquid-input rounded-xl px-4 py-3 outline-none text-white transition font-mono text-sm placeholder:text-white/30 focus:border-[#4285f4]"
                                        placeholder="Media"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-neutral-300 font-medium mb-2">Mount Drive Letter</label>
                                    <input
                                        type="text"
                                        value={settings.gdriveMountDrive || ''}
                                        onChange={(e) => handleGdriveChange('gdriveMountDrive', e.target.value)}
                                        className="w-full liquid-input rounded-xl px-4 py-3 outline-none text-white transition font-mono text-sm placeholder:text-white/30 focus:border-[#4285f4]"
                                        placeholder="Z:"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-neutral-300 font-medium mb-2">Mount Path</label>
                                    <input
                                        type="text"
                                        value={settings.gdriveMountPath || ''}
                                        disabled
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-neutral-400 font-mono text-sm"
                                        placeholder="Z:\Media"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-neutral-300 font-medium mb-2">Torrent Temp Folder (Local)</label>
                                <input
                                    type="text"
                                    value={settings.gdriveTempPath || ''}
                                    onChange={(e) => handleGdriveChange('gdriveTempPath', e.target.value)}
                                    className="w-full liquid-input rounded-xl px-4 py-3 outline-none text-white transition font-mono text-sm placeholder:text-white/30 focus:border-[#4285f4]"
                                    placeholder="C:\TorrentTemp"
                                />
                                <p className="text-xs text-neutral-400 mt-2">
                                    Local directory to hold active torrent downloads before copying to the mounted drive. Highly recommended to avoid direct-to-cloud write throttling.
                                </p>
                            </div>

                            <div className="pt-4 border-t border-white/10">
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {(gdriveStatus?.connected || gdriveStatus?.mounted) ? (
                                                <div className="flex items-center gap-2 text-emerald-400">
                                                    <CheckCircle className="w-5 h-5" />
                                                    <span className="text-sm font-medium">{gdriveStatus?.mounted ? 'Mounted & Connected' : 'Connected'}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-red-400">
                                                    <XCircle className="w-5 h-5" />
                                                    <span className="text-sm font-medium">Disconnected</span>
                                                </div>
                                            )}
                                            {gdriveStatus?.usage && (
                                                <span className="text-sm text-neutral-400 ml-4 border-l border-white/10 pl-4">
                                                    Storage: {gdriveStatus.usage.used} / {gdriveStatus.usage.total} ({gdriveStatus.usage.free} free)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleGdriveAction('test')}
                                            disabled={gdriveActionLoading === 'test'}
                                            className="px-4 py-2 rounded-xl liquid-glass-pill text-sm font-medium hover:bg-white/10 transition flex items-center gap-2"
                                        >
                                            <CloudUpload className={`w-4 h-4 ${gdriveActionLoading === 'test' ? 'animate-pulse' : ''}`} />
                                            Test Connection
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleGdriveAction('setup')}
                                            disabled={gdriveActionLoading === 'setup'}
                                            className="px-4 py-2 rounded-xl liquid-glass-pill text-sm font-medium hover:bg-white/10 transition flex items-center gap-2"
                                        >
                                            <FolderPlus className={`w-4 h-4 ${gdriveActionLoading === 'setup' ? 'animate-pulse' : ''}`} />
                                            Setup Folders
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleGdriveAction(gdriveStatus?.mounted ? 'unmount' : 'mount')}
                                            disabled={gdriveActionLoading === 'mount' || gdriveActionLoading === 'unmount'}
                                            className="px-4 py-2 rounded-xl liquid-glass-pill text-sm font-medium hover:bg-white/10 transition flex items-center gap-2"
                                        >
                                            <HardDrive className={`w-4 h-4 ${(gdriveActionLoading === 'mount' || gdriveActionLoading === 'unmount') ? 'animate-pulse' : ''}`} />
                                            {gdriveStatus?.mounted ? 'Unmount Drive' : 'Mount Drive'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleGdriveAddLibrary}
                                            disabled={gdriveActionLoading === 'add-library'}
                                            className="px-4 py-2 rounded-xl liquid-glass-pill text-sm font-medium hover:bg-[#4285f4]/20 hover:text-[#4285f4] transition flex items-center gap-2"
                                        >
                                            <Folder className={`w-4 h-4 ${gdriveActionLoading === 'add-library' ? 'animate-pulse' : ''}`} />
                                            Auto-add Library Folders
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* TMDB API Key */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Key className="w-4 h-4 text-amber-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">TMDB Integration</h2>
                    </div>
                    <div className="p-6">
                        {!tmdbConfigured && (
                            <p className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm backdrop-blur-md">
                                No TMDB API key configured. Posters, ratings, and Discover are unavailable until you add
                                one below — your library will still scan using filenames.
                            </p>
                        )}
                        <label className="block text-sm text-neutral-300 font-medium mb-2">API Key</label>
                        <input
                            type="password"
                            value={settings.tmdbApiKey}
                            onChange={(e) => setSettings(prev => ({ ...prev, tmdbApiKey: e.target.value }))}
                            className="w-full liquid-input rounded-xl px-4 py-3 outline-none text-white transition font-mono text-sm placeholder:text-white/30"
                            placeholder={tmdbConfigured ? 'Set via TMDB_API_KEY' : 'Required for metadata'}
                        />
                        <p className="text-xs text-neutral-400 mt-2">
                            Required for movie/show metadata, posters, and ratings. You can also set{' '}
                            <code className="text-neutral-300 font-mono">TMDB_API_KEY</code> in <code className="text-neutral-300 font-mono">.env.local</code>.
                            Get a free key at{' '}
                            <a href="https://www.themoviedb.org/settings/api" target="_blank" className="text-white underline hover:text-amber-300 transition">
                                themoviedb.org
                            </a>
                        </p>
                    </div>
                </section>

                {/* OMDb API Key */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Key className="w-4 h-4 text-amber-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">OMDb Integration</h2>
                    </div>
                    <div className="p-6">
                        <label className="block text-sm text-neutral-300 font-medium mb-2">API Key</label>
                        <input
                            type="password"
                            value={settings.omdbApiKey}
                            onChange={(e) => setSettings(prev => ({ ...prev, omdbApiKey: e.target.value }))}
                            className="w-full liquid-input rounded-xl px-4 py-3 outline-none text-white transition font-mono text-sm placeholder:text-white/30"
                            placeholder="Enter your OMDb API key"
                        />
                        <p className="text-xs text-neutral-400 mt-2">
                            Used to fetch real IMDb ratings by IMDb ID. Get a key at{' '}
                            <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" className="text-white underline hover:text-amber-300 transition">
                                omdbapi.com
                            </a>
                        </p>
                    </div>
                </section>

                {/* Display Preferences */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Eye className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">Display Preferences</h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <p className="text-neutral-400 text-sm">
                            Customize what information is shown on the home page.
                        </p>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-neutral-200 group-hover:text-white transition font-medium">Show titles on poster cards</span>
                            <button
                                type="button"
                                onClick={() => updateDisplayPref('showTitles', !displayPrefs.showTitles)}
                                className={`w-12 h-7 rounded-full p-0.5 border transition-all duration-300 relative flex-shrink-0 ${
                                    displayPrefs.showTitles
                                        ? 'bg-white/95 border-white shadow-[0_0_14px_rgba(255,255,255,0.4)]'
                                        : 'bg-white/5 border-white/15 hover:border-white/30'
                                }`}
                            >
                                <span className={`block w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${
                                    displayPrefs.showTitles ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/70'
                                }`} />
                            </button>
                        </label>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-neutral-200 group-hover:text-white transition font-medium">Show ratings on poster cards</span>
                            <button
                                type="button"
                                onClick={() => updateDisplayPref('showRatings', !displayPrefs.showRatings)}
                                className={`w-12 h-7 rounded-full p-0.5 border transition-all duration-300 relative flex-shrink-0 ${
                                    displayPrefs.showRatings
                                        ? 'bg-white/95 border-white shadow-[0_0_14px_rgba(255,255,255,0.4)]'
                                        : 'bg-white/5 border-white/15 hover:border-white/30'
                                }`}
                            >
                                <span className={`block w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${
                                    displayPrefs.showRatings ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/70'
                                }`} />
                            </button>
                        </label>
                        <label className="flex items-center justify-between cursor-pointer group">
                            <div>
                                <span className="text-neutral-200 group-hover:text-white transition font-medium">Cinematic mode</span>
                                <span className="text-neutral-400 text-xs ml-2">(simplified navbar)</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => updateDisplayPref('cinematicMode', !displayPrefs.cinematicMode)}
                                className={`w-12 h-7 rounded-full p-0.5 border transition-all duration-300 relative flex-shrink-0 ${
                                    displayPrefs.cinematicMode
                                        ? 'bg-white/95 border-white shadow-[0_0_14px_rgba(255,255,255,0.4)]'
                                        : 'bg-white/5 border-white/15 hover:border-white/30'
                                }`}
                            >
                                <span className={`block w-5 h-5 rounded-full transition-transform duration-300 shadow-sm ${
                                    displayPrefs.cinematicMode ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/70'
                                }`} />
                            </button>
                        </label>

                        {/* Tiles per row setting */}
                        <div className="pt-4 border-t border-white/10">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <div className="text-neutral-200 font-medium">Tiles per row</div>
                                    <div className="text-xs text-neutral-400">Number of poster columns displayed across the library grid</div>
                                </div>
                                <span className="text-sm font-semibold text-white px-3 py-1 rounded-lg liquid-glass-pill">
                                    {displayPrefs.gridColumns || 8} columns
                                </span>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                {[
                                    { value: 4, label: '4 (Large)' },
                                    { value: 5, label: '5' },
                                    { value: 6, label: '6 (Medium)' },
                                    { value: 7, label: '7' },
                                    { value: 8, label: '8 (Default)' },
                                    { value: 10, label: '10 (Compact)' },
                                ].map((col) => (
                                    <button
                                        key={col.value}
                                        onClick={() => updateDisplayPref('gridColumns', col.value)}
                                        className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition duration-200 ${
                                            (displayPrefs.gridColumns || 8) === col.value
                                                ? 'liquid-glass-pill-active shadow-md'
                                                : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                        }`}
                                    >
                                        {col.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Appearance Preferences */}
                {isMounted && (
                    <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                            <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                                <Palette className="w-4 h-4 text-pink-400" />
                            </div>
                            <h2 className="text-lg font-semibold tracking-wide">Appearance</h2>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Theme Toggle */}
                            <div>
                                <h3 className="text-sm text-neutral-300 font-medium mb-3">Base Theme</h3>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setTheme('dark')}
                                        className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition duration-200 font-medium text-sm ${
                                            theme === 'dark' 
                                                ? 'liquid-glass-pill-active shadow-md' 
                                                : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                        }`}
                                    >
                                        <div className="w-4 h-4 rounded-full bg-[#141414] border border-white/30 shadow-inner"></div>
                                        Dark Theme
                                    </button>
                                    <button
                                        onClick={() => setTheme('oled')}
                                        className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition duration-200 font-medium text-sm ${
                                            theme === 'oled' 
                                                ? 'liquid-glass-pill-active shadow-md' 
                                                : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                        }`}
                                    >
                                        <div className="w-4 h-4 rounded-full bg-black border border-white/30 shadow-inner"></div>
                                        OLED Black
                                    </button>
                                </div>
                            </div>

                            {/* Accent Color */}
                            <div>
                                <h3 className="text-sm text-neutral-300 font-medium mb-3">Accent Color</h3>
                                <div className="flex gap-3 flex-wrap">
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
                                            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition duration-200 text-sm font-medium ${
                                                accent === acc.id 
                                                    ? 'liquid-glass-pill-active shadow-md' 
                                                    : 'liquid-glass-pill text-neutral-300 hover:text-white'
                                            }`}
                                        >
                                            <div className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.3)]" style={{ backgroundColor: acc.color }}></div>
                                            {acc.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Keyboard Shortcuts Reference */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Keyboard className="w-4 h-4 text-amber-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">Keyboard Shortcuts</h2>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-3">
                                <kbd className="px-2.5 py-1 liquid-glass-pill rounded-lg font-mono text-xs text-white shadow-inner">←</kbd>
                                <kbd className="px-2.5 py-1 liquid-glass-pill rounded-lg font-mono text-xs text-white shadow-inner">→</kbd>
                                <span className="text-neutral-300">Navigate horizontally</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2.5 py-1 liquid-glass-pill rounded-lg font-mono text-xs text-white shadow-inner">↑</kbd>
                                <kbd className="px-2.5 py-1 liquid-glass-pill rounded-lg font-mono text-xs text-white shadow-inner">↓</kbd>
                                <span className="text-neutral-300">Navigate vertically</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2.5 py-1 liquid-glass-pill rounded-lg font-mono text-xs text-white shadow-inner">Enter</kbd>
                                <span className="text-neutral-300">Play / Open selected item</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2.5 py-1 liquid-glass-pill rounded-lg font-mono text-xs text-white shadow-inner">Esc</kbd>
                                <span className="text-neutral-300">Close modal / Cancel</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2.5 py-1 liquid-glass-pill rounded-lg font-mono text-xs text-white shadow-inner">/</kbd>
                                <span className="text-neutral-300">Open search</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2.5 py-1 liquid-glass-pill rounded-lg font-mono text-xs text-white shadow-inner">F</kbd>
                                <span className="text-neutral-300">Open folder manager</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Metadata Refresh */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <RefreshCw className="w-4 h-4 text-teal-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">Metadata Refresh</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-neutral-300 text-sm mb-4 leading-relaxed">
                            If some movies or shows are missing posters, ratings, or descriptions, you can refresh
                            their metadata from TMDB and IMDb ratings from OMDb. This will attempt to re-fetch information for items
                            that are currently missing poster images or IMDb ratings.
                        </p>
                        <RefreshMetadataButton />
                    </div>
                </section>

                {/* Re-probe Media Info */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <HardDrive className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">Media Info</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-neutral-300 text-sm mb-4 leading-relaxed">
                            Re-scan all media files with FFprobe to detect the correct resolution, video/audio codecs,
                            HDR status, and audio channels. Use this if resolution or codec information appears wrong.
                        </p>
                        <ReprobeButton />
                    </div>
                </section>

                {/* Library Info */}
                <section className="liquid-glass-base rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-8 h-8 rounded-lg liquid-glass-pill flex items-center justify-center">
                            <Folder className="w-4 h-4 text-amber-400" />
                        </div>
                        <h2 className="text-lg font-semibold tracking-wide">Library</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-neutral-300 text-sm mb-4 leading-relaxed">
                            Manage your library folders from the main page by clicking the{' '}
                            <span className="text-white font-medium">+</span> button or pressing{' '}
                            <kbd className="px-2 py-0.5 liquid-glass-pill rounded text-xs font-mono text-white">F</kbd>
                        </p>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 px-5 py-2.5 liquid-glass-pill rounded-xl transition text-sm font-medium text-white hover:bg-white/15"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Library
                        </Link>
                    </div>
                </section>

                {/* Save Button */}
                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="liquid-btn-primary px-8 py-3.5 disabled:opacity-50 text-black font-bold rounded-2xl flex items-center gap-2.5 transition text-base shadow-xl hover:scale-[1.02] active:scale-[0.98]"
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
