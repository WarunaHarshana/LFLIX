/**
 * Download Manager — wraps WebTorrent for torrent downloading + HTTP direct downloads
 * Supports: add, remove, pause, resume downloads (torrent & HTTP)
 */

import db from './db';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';

// Download record type
export interface DownloadRecord {
    id: number;
    magnetUri: string;
    infoHash: string | null;
    name: string | null;
    watchlistId: number | null;
    status: 'downloading' | 'completed' | 'error' | 'paused';
    progress: number;
    downloadSpeed: number;
    totalSize: number;
    downloadedSize: number;
    downloadPath: string | null;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
}

class DownloadManager {
    private client: any = null;
    private progressTimers: Map<number, NodeJS.Timeout> = new Map();
    private httpAbortControllers: Map<number, AbortController> = new Map();

    public async getClient(): Promise<any> {
        if (this.client) return this.client;
        const WebTorrent = (await import('webtorrent')).default;
        this.client = new (WebTorrent as any)();
        return this.client;
    }

    // Public recovery method — only resets downloads stuck for >30 seconds
    async recoverAll(): Promise<void> {
        try {
            // Only reset downloads that have been stuck for more than 30 seconds
            // (fresh downloads that are still initializing shouldn't be touched)
            const staleDownloads = db.prepare(
                `SELECT id, magnetUri, status, infoHash, name, downloadPath, startedAt 
                 FROM downloads 
                 WHERE status IN ('downloading') 
                 AND magnetUri NOT LIKE 'http-direct:%'
                 AND datetime(startedAt) < datetime('now', '-30 seconds')`
            ).all() as any[];

            if (staleDownloads.length === 0) {
                console.log('[DownloadManager] Recovery: no stuck downloads');
                return;
            }

            console.log(`[DownloadManager] Recovery: found ${staleDownloads.length} stuck downloads`);
            
            let recovered = 0;
            for (const dl of staleDownloads) {
                const torrent = this.findTorrent(dl.infoHash || dl.magnetUri);
                if (!torrent) {
                    db.prepare("UPDATE downloads SET status = 'paused', downloadSpeed = 0 WHERE id = ?").run(dl.id);
                    console.log(`[DownloadManager] Recovery: #${dl.id} "${dl.name || 'unknown'}" → paused`);
                    recovered++;
                }
            }

            if (recovered > 0) {
                console.log(`[DownloadManager] Recovery: ${recovered} downloads ready to resume`);
            }
        } catch (e) {
            console.error('[DownloadManager] Recovery error:', e);
        }
    }

    // Helper: find a torrent by multiple strategies (used by add, pause, resume)
    private findTorrent(identifier: string): any {
        if (!this.client || !this.client.torrents) return null;

        // Strategy 1: Direct lookup via client.get()
        try {
            const torrent = this.client.get(identifier);
            if (torrent && typeof torrent.on === 'function') return torrent;
        } catch { /* ignore */ }

        // Strategy 2: If it's a magnet URI, extract infoHash and try again
        if (identifier.startsWith('magnet:')) {
            try {
                const xtMatch = identifier.match(/xt=urn:btih:([a-fA-F0-9]+)/);
                if (xtMatch) {
                    const infoHash = xtMatch[1].toLowerCase();
                    const torrent = this.client.get(infoHash);
                    if (torrent && typeof torrent.on === 'function') return torrent;
                }
            } catch { /* ignore */ }
        }

        // Strategy 3: Linear search through all torrents in client
        try {
            const searchHash = identifier.toLowerCase().replace(/[^a-f0-9]/g, '');
            for (const t of this.client.torrents) {
                if (!t || typeof t.on !== 'function') continue;
                if (t.infoHash && t.infoHash.toLowerCase() === searchHash) return t;
                // Also try partial match on magnet URI
                if (identifier.startsWith('magnet:') && t.magnetURI) {
                    const tXtMatch = t.magnetURI.match(/xt=urn:btih:([a-fA-F0-9]+)/);
                    if (tXtMatch && tXtMatch[1].toLowerCase() === searchHash) return t;
                }
            }
        } catch { /* ignore */ }

        return null;
    }

    // Get download path from settings or default
    getDownloadPath(): string {
        try {
            const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath') as { value: string } | undefined;
            if (setting?.value && fs.existsSync(setting.value)) {
                return setting.value;
            }
        } catch { /* ignore */ }

        const defaultPath = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(defaultPath)) {
            fs.mkdirSync(defaultPath, { recursive: true });
        }
        return defaultPath;
    }

    // Start a new download (auto-detects torrent vs HTTP)
    async addDownload(magnetUri: string, watchlistId?: number, customPath?: string): Promise<DownloadRecord> {
        console.log(`[DownloadManager] addDownload called for: ${magnetUri.substring(0, 30)}...`);
        // Detect HTTP direct download
        if (magnetUri.startsWith('http-direct:')) {
            const url = magnetUri.replace('http-direct:', '');
            const filename = decodeURIComponent(url.split('/').pop() || 'download');
            return this.addHttpDownload(url, filename, watchlistId, customPath);
        }

        const downloadPath = customPath || this.getDownloadPath();
        const client = await this.getClient();

        // Insert DB record
        const stmt = db.prepare(`
      INSERT INTO downloads (magnetUri, watchlistId, status, downloadPath)
      VALUES (?, ?, 'downloading', ?)
    `);
        const result = stmt.run(magnetUri, watchlistId || null, downloadPath);
        const downloadId = Number(result.lastInsertRowid);

        try {
            console.log(`[DownloadManager] Adding torrent to client: ${magnetUri.substring(0, 30)}...`);
            let torrent = this.findTorrent(magnetUri);
            if (torrent) {
                console.log(`[DownloadManager] Torrent already in client: ${torrent.infoHash}`);
                // Re-setup events for this download
                this.setupTorrentEvents(downloadId, torrent);
            } else {
                torrent = client.add(magnetUri, { path: downloadPath });
                this.setupTorrentEvents(downloadId, torrent);
            }
        } catch (err: any) {
            try {
                db.prepare('UPDATE downloads SET status = ?, errorMessage = ? WHERE id = ?')
                    .run('error', err.message || 'Unknown error', downloadId);
            } catch { /* ignore */ }
        }

        return this.getDownload(downloadId)!;
    }

    // Start an HTTP direct download
    private async addHttpDownload(url: string, filename: string, watchlistId?: number, customPath?: string): Promise<DownloadRecord> {
        const downloadPath = customPath || this.getDownloadPath();
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }

        const filePath = path.join(downloadPath, filename);
        const magnetUriStored = `http-direct:${url}`;

        // Insert DB record
        const stmt = db.prepare(`
      INSERT INTO downloads (magnetUri, name, watchlistId, status, downloadPath)
      VALUES (?, ?, ?, 'downloading', ?)
    `);
        const result = stmt.run(magnetUriStored, filename, watchlistId || null, downloadPath);
        const downloadId = Number(result.lastInsertRowid);

        const abortController = new AbortController();
        this.httpAbortControllers.set(downloadId, abortController);

        try {
            const httpModule = url.startsWith('https') ? https : http;
            const fileStream = fs.createWriteStream(filePath);
            let downloadedBytes = 0;
            let totalBytes = 0;
            let lastTime = Date.now();
            let lastBytes = 0;

            const request = httpModule.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            }, (response) => {
                // Handle redirects
                if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    request.destroy();
                    fileStream.close();
                    // Follow redirect
                    const redirectUrl = response.headers.location.startsWith('http')
                        ? response.headers.location
                        : new URL(response.headers.location, url).href;
                    this.httpAbortControllers.delete(downloadId);
                    db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
                    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
                    this.addHttpDownload(redirectUrl, filename, watchlistId, customPath);
                    return;
                }

                if (response.statusCode !== 200) {
                    fileStream.close();
                    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
                    db.prepare(`UPDATE downloads SET status = 'error', errorMessage = ? WHERE id = ?`)
                        .run(`HTTP error ${response.statusCode}`, downloadId);
                    return;
                }

                totalBytes = parseInt(response.headers['content-length'] || '0', 10);
                if (totalBytes > 0) {
                    db.prepare('UPDATE downloads SET totalSize = ? WHERE id = ?').run(totalBytes, downloadId);
                }

                // Progress timer
                const timer = setInterval(() => {
                    try {
                        const record = this.getDownload(downloadId);
                        if (!record || record.status !== 'downloading') {
                            clearInterval(timer);
                            this.progressTimers.delete(downloadId);
                            return;
                        }
                        const now = Date.now();
                        const elapsed = (now - lastTime) / 1000;
                        const speed = elapsed > 0 ? Math.round((downloadedBytes - lastBytes) / elapsed) : 0;
                        lastTime = now;
                        lastBytes = downloadedBytes;

                        const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 10000) / 100 : 0;
                        db.prepare(`
                            UPDATE downloads SET progress = ?, downloadSpeed = ?, downloadedSize = ?, totalSize = ?
                            WHERE id = ? AND status = 'downloading'
                        `).run(progress, speed, downloadedBytes, totalBytes, downloadId);
                    } catch { /* ignore */ }
                }, 2000);
                this.progressTimers.set(downloadId, timer);

                response.on('data', (chunk: Buffer) => {
                    downloadedBytes += chunk.length;
                });

                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    this.clearTimer(downloadId);
                    this.httpAbortControllers.delete(downloadId);
                    try {
                        db.prepare(`
                            UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
                            downloadedSize = ?, totalSize = ?, completedAt = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(downloadedBytes, totalBytes || downloadedBytes, downloadId);
                    } catch { /* ignore */ }
                    this.triggerRescan();
                });

                response.on('error', (err: Error) => {
                    this.clearTimer(downloadId);
                    this.httpAbortControllers.delete(downloadId);
                    fileStream.close();
                    try {
                        db.prepare(`UPDATE downloads SET status = 'error', errorMessage = ?, downloadSpeed = 0 WHERE id = ?`)
                            .run(err.message, downloadId);
                    } catch { /* ignore */ }
                });
            });

            request.on('error', (err: Error) => {
                this.clearTimer(downloadId);
                this.httpAbortControllers.delete(downloadId);
                fileStream.close();
                try {
                    db.prepare(`UPDATE downloads SET status = 'error', errorMessage = ?, downloadSpeed = 0 WHERE id = ?`)
                        .run(err.message, downloadId);
                } catch { /* ignore */ }
            });

            // Handle abort
            abortController.signal.addEventListener('abort', () => {
                request.destroy();
                fileStream.close();
                this.clearTimer(downloadId);
            });

        } catch (err: any) {
            this.httpAbortControllers.delete(downloadId);
            try {
                db.prepare('UPDATE downloads SET status = ?, errorMessage = ? WHERE id = ?')
                    .run('error', err.message || 'Unknown error', downloadId);
            } catch { /* ignore */ }
        }

        return this.getDownload(downloadId)!;
    }

    // Pause a download
    async pauseDownload(downloadId: number): Promise<boolean> {
        const record = this.getDownload(downloadId);
        if (!record || record.status !== 'downloading') return false;

        this.clearTimer(downloadId);

        // Handle HTTP downloads
        if (record.magnetUri.startsWith('http-direct:')) {
            const controller = this.httpAbortControllers.get(downloadId);
            if (controller) {
                controller.abort();
                this.httpAbortControllers.delete(downloadId);
            }
            db.prepare("UPDATE downloads SET status = 'paused', downloadSpeed = 0 WHERE id = ?").run(downloadId);
            return true;
        }

        // Pause in WebTorrent — try multiple lookup strategies
        if (this.client) {
            const torrent = this.findTorrent(record.infoHash || record.magnetUri);
            if (torrent) {
                try {
                    torrent.pause();
                    console.log(`[DownloadManager] Paused torrent: ${torrent.infoHash}`);
                } catch (err: any) {
                    console.error(`[DownloadManager] Error pausing torrent:`, err?.message);
                }
            } else {
                console.warn(`[DownloadManager] Could not find torrent to pause for download ${downloadId}`);
            }
        }

        db.prepare("UPDATE downloads SET status = 'paused', downloadSpeed = 0 WHERE id = ?").run(downloadId);
        return true;
    }

    // Resume a download
    async resumeDownload(downloadId: number): Promise<boolean> {
        const record = this.getDownload(downloadId);
        if (!record || (record.status !== 'paused' && record.status !== 'downloading' && record.status !== 'error')) {
            console.log(`[DownloadManager] Cannot resume #${downloadId}: status is ${record?.status}`);
            return false;
        }

        // Handle HTTP downloads — restart from scratch (no resume support)
        if (record.magnetUri.startsWith('http-direct:')) {
            const url = record.magnetUri.replace('http-direct:', '');
            const filename = record.name || decodeURIComponent(url.split('/').pop() || 'download');
            if (record.downloadPath && record.name) {
                const filePath = path.join(record.downloadPath, record.name);
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
            }
            db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
            await this.addHttpDownload(url, filename, record.watchlistId || undefined, record.downloadPath || undefined);
            return true;
        }

        const client = await this.getClient();
        const downloadPath = record.downloadPath || this.getDownloadPath();

        console.log(`[DownloadManager] Resume #${downloadId}: path=${downloadPath}, infoHash=${record.infoHash || 'null'}, name=${record.name || 'null'}`);

        // Try to find existing torrent in client
        let torrent = this.findTorrent(record.infoHash || record.magnetUri);

        if (torrent) {
            // Found existing torrent — just resume it
            try {
                torrent.resume();
                console.log(`[DownloadManager] Resumed existing torrent: ${torrent.infoHash}`);
                this.setupTorrentProgressTimer(downloadId, torrent);
                db.prepare("UPDATE downloads SET status = 'downloading' WHERE id = ?").run(downloadId);
                return true;
            } catch (err: any) {
                console.error(`[DownloadManager] Error resuming torrent:`, err?.message);
            }
        }

        // Torrent not found or resume failed — re-add it
        // WebTorrent will check for existing files in the download path
        try {
            // Destroy any existing torrent with same infoHash first
            if (record.infoHash) {
                const existing = this.findTorrent(record.infoHash);
                if (existing) {
                    await new Promise<void>((resolve) => {
                        try { existing.destroy({}, () => resolve()); } catch { resolve(); }
                    });
                }
            }

            console.log(`[DownloadManager] Re-adding torrent with path: ${downloadPath}`);
            const newTorrent = client.add(record.magnetUri, { 
                path: downloadPath,
            });

            // Log when metadata arrives so we can see if file detection works
            newTorrent.on('metadata', () => {
                console.log(`[DownloadManager] Metadata received: ${newTorrent.name}, ${newTorrent.files?.length} files, path: ${newTorrent.path}`);
            });

            newTorrent.on('ready', () => {
                console.log(`[DownloadManager] Torrent ready: ${newTorrent.name}, downloaded: ${newTorrent.downloaded}, length: ${newTorrent.length}`);
            });

            this.setupTorrentEvents(downloadId, newTorrent);
            db.prepare("UPDATE downloads SET status = 'downloading', infoHash = ? WHERE id = ?")
                .run(newTorrent.infoHash || record.infoHash, downloadId);
            return true;
        } catch (err: any) {
            console.error(`[DownloadManager] Failed to re-add torrent:`, err?.message);
            db.prepare("UPDATE downloads SET status = ?, errorMessage = ? WHERE id = ?")
                .run('error', err?.message || 'Failed to resume', downloadId);
            return false;
        }
    }

    // Delete downloaded files from disk
    private deleteFilesFromDisk(record: DownloadRecord): void {
        console.log('[Download] Attempting file deletion for:', {
            id: record.id,
            name: record.name,
            downloadPath: record.downloadPath,
            infoHash: record.infoHash,
        });

        // Build list of candidate paths to try
        const candidates: string[] = [];

        if (record.downloadPath && record.name) {
            candidates.push(path.join(record.downloadPath, record.name));
        }
        if (record.downloadPath && record.infoHash) {
            candidates.push(path.join(record.downloadPath, record.infoHash));
        }
        // Fallback: project downloads folder
        if (record.name) {
            candidates.push(path.join(process.cwd(), 'downloads', record.name));
        }

        for (const candidate of candidates) {
            try {
                if (fs.existsSync(candidate)) {
                    console.log('[Download] Deleting:', candidate);
                    fs.rmSync(candidate, { recursive: true, force: true });
                    console.log('[Download] Deleted successfully:', candidate);
                    return; // Done
                }
            } catch (e) {
                console.error('[Download] Failed to delete:', candidate, e);
            }
        }

        console.warn('[Download] No matching files found on disk. Candidates tried:', candidates);
    }

    // Remove/cancel a download
    async removeDownload(downloadId: number, deleteFiles = false): Promise<boolean> {
        const record = this.getDownload(downloadId);
        if (!record) {
            try { db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId); } catch { /* ignore */ }
            return true;
        }

        console.log('[Download] Removing download:', downloadId, 'deleteFiles:', deleteFiles);

        // Clear progress timer
        this.clearTimer(downloadId);

        // Handle HTTP downloads
        if (record.magnetUri.startsWith('http-direct:')) {
            const controller = this.httpAbortControllers.get(downloadId);
            if (controller) {
                controller.abort();
                this.httpAbortControllers.delete(downloadId);
            }
            if (deleteFiles) {
                this.deleteFilesFromDisk(record);
            }
            try {
                db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
            } catch (e) {
                console.error('[Download] Failed to delete from DB:', e);
                return false;
            }
            return true;
        }

        // Remove from WebTorrent if active
        if (this.client) {
            try {
                const torrent = record.infoHash
                    ? this.client.get(record.infoHash)
                    : this.client.get(record.magnetUri);

                if (torrent) {
                    await new Promise<void>((resolve) => {
                        try {
                            torrent.destroy({ destroyStore: deleteFiles }, () => resolve());
                        } catch {
                            resolve();
                        }
                    });
                    // If destroyStore was used, files should be gone. But double-check:
                    if (deleteFiles) {
                        this.deleteFilesFromDisk(record);
                    }
                } else if (deleteFiles) {
                    this.deleteFilesFromDisk(record);
                }
            } catch {
                if (deleteFiles) this.deleteFilesFromDisk(record);
            }
        } else if (deleteFiles) {
            this.deleteFilesFromDisk(record);
        }

        // Remove from DB
        try {
            db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
        } catch (e) {
            console.error('[Download] Failed to delete from DB:', e);
            return false;
        }

        return true;
    }

    // Get all downloads
    getAll(): DownloadRecord[] {
        try {
            return db.prepare('SELECT * FROM downloads ORDER BY startedAt DESC').all() as DownloadRecord[];
        } catch {
            return [];
        }
    }

    // Get single download
    getDownload(id: number): DownloadRecord | null {
        try {
            return (db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as DownloadRecord) || null;
        } catch {
            return null;
        }
    }

    // Get active download count
    getActiveCount(): number {
        try {
            const result = db.prepare("SELECT COUNT(*) as count FROM downloads WHERE status = 'downloading'").get() as { count: number };
            return result?.count || 0;
        } catch {
            return 0;
        }
    }

    private setupTorrentProgressTimer(downloadId: number, torrent: any) {
        this.clearTimer(downloadId);
        const timer = setInterval(() => {
            try {
                const record = this.getDownload(downloadId);
                if (!record || record.status !== 'downloading') {
                    clearInterval(timer);
                    this.progressTimers.delete(downloadId);
                    return;
                }
                db.prepare(`
            UPDATE downloads SET progress = ?, downloadSpeed = ?, downloadedSize = ?, totalSize = ?
            WHERE id = ? AND status = 'downloading'
          `).run(
                    Math.round(torrent.progress * 10000) / 100,
                    Math.round(torrent.downloadSpeed || 0),
                    torrent.downloaded || 0,
                    torrent.length || 0,
                    downloadId
                );
            } catch { /* ignore */ }
        }, 2000);
        this.progressTimers.set(downloadId, timer);
    }

    private setupTorrentEvents(downloadId: number, torrent: any) {
        torrent.on('metadata', () => {
            try {
                db.prepare('UPDATE downloads SET name = ?, infoHash = ?, totalSize = ? WHERE id = ?')
                    .run(torrent.name, torrent.infoHash, torrent.length || 0, downloadId);
            } catch { /* ignore */ }
        });

        this.setupTorrentProgressTimer(downloadId, torrent);

        torrent.on('done', () => {
            this.clearTimer(downloadId);
            try {
                db.prepare(`
            UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
            downloadedSize = totalSize, completedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(downloadId);
            } catch { /* ignore */ }
            this.triggerRescan();
        });

        torrent.on('error', (err: Error) => {
            this.clearTimer(downloadId);
            try {
                db.prepare(`UPDATE downloads SET status = 'error', errorMessage = ?, downloadSpeed = 0 WHERE id = ?`)
                    .run(err.message, downloadId);
            } catch { /* ignore */ }
        });
    }

    // Helper: clear progress timer
    private clearTimer(downloadId: number) {
        const timer = this.progressTimers.get(downloadId);
        if (timer) {
            clearInterval(timer);
            this.progressTimers.delete(downloadId);
        }
    }

    // Trigger library rescan
    private async triggerRescan(): Promise<void> {
        try {
            const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
            await fetch(`${baseUrl}/api/rescan`, { method: 'POST' }).catch(() => { });
        } catch { /* ignore */ }
    }
}

// Singleton
const downloadManager = new DownloadManager();

// Auto-recover on module load — only runs once
let startupDone = false;
setImmediate(async () => {
    if (startupDone) return;
    startupDone = true;
    try {
        await downloadManager.getClient();
        console.log('[DownloadManager] Running startup recovery...');
        setTimeout(async () => {
            try { await downloadManager.recoverAll(); } catch (e) { console.error('[DownloadManager] Recovery failed:', e); }
        }, 1500);
    } catch (e) {
        console.error('[DownloadManager] Startup init failed:', e);
    }
});

export default downloadManager;
