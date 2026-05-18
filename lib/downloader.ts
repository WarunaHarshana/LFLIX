/**
 * Download Manager — wraps WebTorrent for torrent downloading + HTTP direct downloads
 * Supports: add, remove, pause, resume downloads (torrent & HTTP)
 */

import db from './db';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { isPathInsideAny } from './security';

type DownloadStatus = 'metadata' | 'downloading' | 'stalled' | 'completed' | 'error' | 'paused';

// Download record type
export interface DownloadRecord {
    id: number;
    magnetUri: string;
    infoHash: string | null;
    name: string | null;
    watchlistId: number | null;
    status: DownloadStatus;
    progress: number;
    downloadSpeed: number;
    totalSize: number;
    downloadedSize: number;
    downloadPath: string | null;
    errorMessage: string | null;
    retryCount: number;
    lastProgressAt: string | null;
    stateUpdatedAt: string | null;
    startedAt: string;
    completedAt: string | null;
}

class DownloadManager {
    private client: any = null;
    private progressTimers: Map<number, NodeJS.Timeout> = new Map();
    private metadataTimers: Map<number, NodeJS.Timeout> = new Map();
    private httpAbortControllers: Map<number, AbortController> = new Map();
    private readonly maxHttpRetries = 3;
    private readonly maxTorrentMetadataRetries = 3;
    private readonly metadataTimeoutMs = 45 * 1000;
    private readonly stalledTimeoutMs = 2 * 60 * 1000;

    public async getClient(): Promise<any> {
        if (this.client) return this.client;
        const WebTorrent = (await import('webtorrent')).default;
        this.client = new (WebTorrent as any)();
        return this.client;
    }

    private isTorrentActiveStatus(status: DownloadStatus): boolean {
        return status === 'metadata' || status === 'downloading' || status === 'stalled';
    }

    private hasTorrentMetadata(torrent: any): boolean {
        return Boolean(torrent?.name || torrent?.length || (Array.isArray(torrent?.files) && torrent.files.length > 0));
    }

    private getMagnetInfoHash(input: string): string | null {
        if (!input.startsWith('magnet:')) return null;
        const match = input.match(/[?&]xt=urn:btih:([^&]+)/i);
        if (!match) return null;

        try {
            return decodeURIComponent(match[1]).toLowerCase();
        } catch {
            return match[1].toLowerCase();
        }
    }

    private normalizeTorrentIdentifier(input?: string | null): string {
        if (!input) return '';
        return input.toLowerCase().replace(/^urn:btih:/, '').replace(/[^a-z0-9]/g, '');
    }

    // Public recovery method — re-attaches in-progress torrents after a server restart
    async recoverAll(): Promise<void> {
        try {
            // Only recover downloads that have been stale for more than 30 seconds
            // (fresh downloads that are still initializing shouldn't be touched).
            const staleDownloads = db.prepare(
                `SELECT id, magnetUri, status, infoHash, name, downloadPath, startedAt 
                 FROM downloads 
                 WHERE status IN ('metadata', 'downloading', 'stalled') 
                 AND magnetUri NOT LIKE 'http-direct:%'
                 AND datetime(COALESCE(stateUpdatedAt, startedAt)) < datetime('now', '-15 seconds')`
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
                    const resumed = await this.resumeDownload(dl.id);
                    if (resumed) {
                        console.log(`[DownloadManager] Recovery: #${dl.id} "${dl.name || 'unknown'}" re-attached`);
                        recovered++;
                    }
                }
            }

            if (recovered > 0) {
                console.log(`[DownloadManager] Recovery: ${recovered} downloads re-attached`);
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
        const magnetInfoHash = this.getMagnetInfoHash(identifier);
        if (identifier.startsWith('magnet:')) {
            try {
                if (magnetInfoHash) {
                    const torrent = this.client.get(magnetInfoHash);
                    if (torrent && typeof torrent.on === 'function') return torrent;
                }
            } catch { /* ignore */ }
        }

        // Strategy 3: Linear search through all torrents in client
        try {
            const searchHash = this.normalizeTorrentIdentifier(magnetInfoHash || identifier);
            for (const t of this.client.torrents) {
                if (!t || typeof t.on !== 'function') continue;
                if (t.infoHash && this.normalizeTorrentIdentifier(t.infoHash) === searchHash) return t;
                // Also try partial match on magnet URI
                if (identifier.startsWith('magnet:') && t.magnetURI) {
                    const torrentMagnetHash = this.getMagnetInfoHash(t.magnetURI);
                    if (torrentMagnetHash && this.normalizeTorrentIdentifier(torrentMagnetHash) === searchHash) return t;
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

    private async destroyTorrent(torrent: any): Promise<void> {
        await new Promise<void>((resolve) => {
            try {
                torrent.destroy({}, () => resolve());
            } catch {
                resolve();
            }
        });
    }

    private markTorrentHasMetadata(downloadId: number, torrent: any): void {
        try {
            this.clearMetadataTimer(downloadId);
            db.prepare(`
                UPDATE downloads
                SET name = COALESCE(?, name),
                    infoHash = COALESCE(?, infoHash),
                    totalSize = ?,
                    status = CASE WHEN status IN ('metadata', 'stalled') THEN 'downloading' ELSE status END,
                    errorMessage = NULL,
                    stateUpdatedAt = CURRENT_TIMESTAMP,
                    lastProgressAt = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status IN ('metadata', 'downloading', 'stalled')
            `).run(torrent.name || null, torrent.infoHash || null, torrent.length || 0, downloadId);
        } catch { /* ignore */ }
    }

    private async startTorrentDownload(
        downloadId: number,
        magnetUri: string,
        downloadPath: string,
        preserveRetryCount = false
    ): Promise<boolean> {
        const client = await this.getClient();
        this.clearTimer(downloadId);

        try {
            db.prepare(`
                UPDATE downloads
                SET status = 'metadata',
                    errorMessage = NULL,
                    downloadSpeed = 0,
                    stateUpdatedAt = CURRENT_TIMESTAMP,
                    lastProgressAt = COALESCE(lastProgressAt, CURRENT_TIMESTAMP)
                    ${preserveRetryCount ? '' : ', retryCount = 0'}
                WHERE id = ?
            `).run(downloadId);
        } catch { /* ignore */ }

        try {
            let torrent = this.findTorrent(magnetUri);
            if (torrent) {
                console.log(`[DownloadManager] Reusing torrent in client: ${torrent.infoHash || 'metadata pending'}`);
                try { torrent.resume(); } catch { /* ignore */ }
            } else {
                console.log(`[DownloadManager] Adding torrent to client: ${magnetUri.substring(0, 30)}...`);
                torrent = client.add(magnetUri, { path: downloadPath });
            }

            if (torrent.infoHash) {
                try {
                    db.prepare('UPDATE downloads SET infoHash = COALESCE(?, infoHash) WHERE id = ?')
                        .run(torrent.infoHash, downloadId);
                } catch { /* ignore */ }
            }

            this.setupTorrentEvents(downloadId, torrent);
            this.scheduleMetadataRetry(downloadId, magnetUri, downloadPath);

            if (this.hasTorrentMetadata(torrent)) {
                this.markTorrentHasMetadata(downloadId, torrent);
            }

            return true;
        } catch (err: any) {
            console.error(`[DownloadManager] Failed to start torrent:`, err?.message);
            try {
                db.prepare(`
                    UPDATE downloads
                    SET status = 'error',
                        errorMessage = ?,
                        downloadSpeed = 0,
                        stateUpdatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(err?.message || 'Failed to start torrent', downloadId);
            } catch { /* ignore */ }
            return false;
        }
    }

    private scheduleMetadataRetry(downloadId: number, magnetUri: string, downloadPath: string): void {
        this.clearMetadataTimer(downloadId);

        const timer = setTimeout(() => {
            void this.retryTorrentMetadata(downloadId, magnetUri, downloadPath);
        }, this.metadataTimeoutMs);

        this.metadataTimers.set(downloadId, timer);
    }

    private async retryTorrentMetadata(downloadId: number, magnetUri: string, downloadPath: string): Promise<void> {
        const record = this.getDownload(downloadId);
        if (!record || !this.isTorrentActiveStatus(record.status)) return;
        if (record.name || record.totalSize > 0) return;

        const nextRetry = (record.retryCount || 0) + 1;
        if (nextRetry > this.maxTorrentMetadataRetries) {
            const existing = this.findTorrent(record.infoHash || magnetUri);
            if (existing) {
                await this.destroyTorrent(existing);
            }
            try {
                db.prepare(`
                    UPDATE downloads
                    SET status = 'error',
                        errorMessage = 'Metadata timed out after multiple retries. Try a different torrent or retry later.',
                        downloadSpeed = 0,
                        stateUpdatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                      AND status IN ('metadata', 'downloading', 'stalled')
                `).run(downloadId);
            } catch { /* ignore */ }
            this.clearTimer(downloadId);
            return;
        }

        const delayMs = Math.min(30000, 3000 * nextRetry);
        console.warn(`[DownloadManager] Metadata timeout for #${downloadId}; retry ${nextRetry}/${this.maxTorrentMetadataRetries} in ${delayMs}ms`);

        try {
            db.prepare(`
                UPDATE downloads
                SET status = 'metadata',
                    retryCount = ?,
                    errorMessage = ?,
                    downloadSpeed = 0,
                    stateUpdatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status IN ('metadata', 'downloading', 'stalled')
            `).run(nextRetry, `Metadata timed out. Retrying ${nextRetry}/${this.maxTorrentMetadataRetries}...`, downloadId);
        } catch { /* ignore */ }

        const existing = this.findTorrent(record.infoHash || magnetUri);
        if (existing) {
            await this.destroyTorrent(existing);
        }

        setTimeout(() => {
            const latest = this.getDownload(downloadId);
            if (!latest || !this.isTorrentActiveStatus(latest.status)) return;
            void this.startTorrentDownload(downloadId, latest.magnetUri, latest.downloadPath || downloadPath, true);
        }, delayMs);
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

        // Insert DB record
        const stmt = db.prepare(`
      INSERT INTO downloads (magnetUri, watchlistId, status, downloadPath, retryCount, lastProgressAt, stateUpdatedAt)
      VALUES (?, ?, 'metadata', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
        const result = stmt.run(magnetUri, watchlistId || null, downloadPath);
        const downloadId = Number(result.lastInsertRowid);

        await this.startTorrentDownload(downloadId, magnetUri, downloadPath);

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
      INSERT INTO downloads (magnetUri, name, watchlistId, status, downloadPath, retryCount, lastProgressAt, stateUpdatedAt)
      VALUES (?, ?, ?, 'downloading', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
        const result = stmt.run(magnetUriStored, filename, watchlistId || null, downloadPath);
        const downloadId = Number(result.lastInsertRowid);

        const abortController = new AbortController();
        this.httpAbortControllers.set(downloadId, abortController);

        try {
            let activeUrl = url;
            let downloadedBytes = 0;
            let totalBytes = 0;
            let lastTime = Date.now();
            let lastBytes = 0;
            let retryTimer: NodeJS.Timeout | null = null;
            let activeRequest: http.ClientRequest | null = null;
            let activeFileStream: fs.WriteStream | null = null;
            let startRequest: (attempt?: number, resumeExisting?: boolean) => void = () => { };

            const updateProgress = (speed = 0) => {
                const progress = totalBytes > 0 ? Math.min(Math.round((downloadedBytes / totalBytes) * 10000) / 100, 99.99) : 0;
                db.prepare(`
                    UPDATE downloads
                    SET progress = ?,
                        downloadSpeed = ?,
                        downloadedSize = ?,
                        totalSize = ?,
                        lastProgressAt = CASE WHEN ? > 0 THEN CURRENT_TIMESTAMP ELSE lastProgressAt END
                    WHERE id = ? AND status = 'downloading'
                `).run(progress, speed, downloadedBytes, totalBytes, speed, downloadId);
            };

            const markHttpError = (message: string) => {
                this.clearTimer(downloadId);
                this.httpAbortControllers.delete(downloadId);
                if (retryTimer) clearTimeout(retryTimer);
                try {
                    db.prepare(`UPDATE downloads SET status = 'error', errorMessage = ?, downloadSpeed = 0,
                        downloadedSize = ?, totalSize = ?,
                        stateUpdatedAt = CURRENT_TIMESTAMP
                        WHERE id = ? AND status = 'downloading'`)
                        .run(message, downloadedBytes, totalBytes, downloadId);
                } catch { /* ignore */ }
            };

            const scheduleRetry = (attempt: number, reason: string) => {
                if (abortController.signal.aborted) return;
                if (retryTimer) return;
                if (attempt >= this.maxHttpRetries) {
                    const sizeText = totalBytes > 0 ? `${downloadedBytes} of ${totalBytes} bytes` : `${downloadedBytes} bytes`;
                    markHttpError(`${reason}. Download incomplete (${sizeText}).`);
                    return;
                }

                try { updateProgress(0); } catch { /* ignore */ }
                const delayMs = 1500 * (attempt + 1);
                retryTimer = setTimeout(() => {
                    retryTimer = null;
                    if (!abortController.signal.aborted) {
                        startRequest(attempt + 1, true);
                    }
                }, delayMs);
            };

            const parseTotalSize = (response: http.IncomingMessage, startByte: number): number => {
                const contentRange = response.headers['content-range'];
                if (typeof contentRange === 'string') {
                    const match = contentRange.match(/\/(\d+)$/);
                    if (match) return parseInt(match[1], 10);
                }

                const contentLength = parseInt(response.headers['content-length'] || '0', 10);
                if (contentLength > 0) {
                    return startByte > 0 && response.statusCode === 206 ? startByte + contentLength : contentLength;
                }

                return totalBytes;
            };

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
                    updateProgress(speed);
                } catch { /* ignore */ }
            }, 2000);
            this.progressTimers.set(downloadId, timer);

            startRequest = (attempt = 0, resumeExisting = false) => {
                if (abortController.signal.aborted) return;

                const existingBytes = resumeExisting && fs.existsSync(filePath)
                    ? fs.statSync(filePath).size
                    : 0;
                const requestUrl = activeUrl;
                const headers: Record<string, string> = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                };
                if (existingBytes > 0) {
                    headers.Range = `bytes=${existingBytes}-`;
                }

                const httpModule = requestUrl.startsWith('https') ? https : http;
                activeRequest = httpModule.get(requestUrl, { headers }, (response) => {
                    if (abortController.signal.aborted) {
                        response.resume();
                        return;
                    }

                    // Handle redirects without creating a second DB row.
                    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        response.resume();
                        activeUrl = response.headers.location.startsWith('http')
                            ? response.headers.location
                            : new URL(response.headers.location, requestUrl).href;
                        startRequest(attempt, resumeExisting);
                        return;
                    }

                    if (response.statusCode !== 200 && response.statusCode !== 206) {
                        response.resume();
                        markHttpError(`HTTP error ${response.statusCode}`);
                        return;
                    }

                    const canAppend = existingBytes > 0 && response.statusCode === 206;
                    downloadedBytes = canAppend ? existingBytes : 0;
                    totalBytes = parseTotalSize(response, downloadedBytes);
                    if (totalBytes > 0) {
                        db.prepare('UPDATE downloads SET totalSize = ?, downloadedSize = ? WHERE id = ?')
                            .run(totalBytes, downloadedBytes, downloadId);
                    }

                    let settled = false;
                    activeFileStream = fs.createWriteStream(filePath, { flags: canAppend ? 'a' : 'w' });

                    const retryFromPartial = (reason: string) => {
                        if (settled) return;
                        settled = true;
                        activeFileStream?.destroy();
                        activeFileStream = null;
                        scheduleRetry(attempt, reason);
                    };

                    response.on('data', (chunk: Buffer) => {
                        downloadedBytes += chunk.length;
                    });

                    response.on('aborted', () => {
                        retryFromPartial('Connection was interrupted');
                    });

                    response.on('error', (err: Error) => {
                        retryFromPartial(err.message || 'Connection failed');
                    });

                    activeFileStream.on('error', (err: Error) => {
                        if (settled) return;
                        settled = true;
                        activeFileStream = null;
                        markHttpError(err.message || 'File write failed');
                    });

                    activeFileStream.on('finish', () => {
                        if (settled) return;
                        settled = true;
                        activeFileStream = null;

                        if (totalBytes > 0 && downloadedBytes < totalBytes) {
                            scheduleRetry(attempt, 'Connection closed before all bytes were received');
                            return;
                        }

                        this.clearTimer(downloadId);
                        this.httpAbortControllers.delete(downloadId);
                        try {
                            db.prepare(`
                                UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
                                downloadedSize = ?, totalSize = ?, completedAt = CURRENT_TIMESTAMP,
                                stateUpdatedAt = CURRENT_TIMESTAMP
                                WHERE id = ? AND status = 'downloading'
                            `).run(downloadedBytes, totalBytes || downloadedBytes, downloadId);
                        } catch { /* ignore */ }
                        this.triggerRescan();
                    });

                    response.pipe(activeFileStream);
                });

                activeRequest.on('error', (err: Error) => {
                    if (abortController.signal.aborted) return;
                    scheduleRetry(attempt, err.message || 'Request failed');
                });
            };

            abortController.signal.addEventListener('abort', () => {
                if (retryTimer) clearTimeout(retryTimer);
                activeRequest?.destroy();
                activeFileStream?.destroy();
                this.clearTimer(downloadId);
            });

            startRequest();

        } catch (err: any) {
            this.httpAbortControllers.delete(downloadId);
            try {
                db.prepare('UPDATE downloads SET status = ?, errorMessage = ?, stateUpdatedAt = CURRENT_TIMESTAMP WHERE id = ?')
                    .run('error', err.message || 'Unknown error', downloadId);
            } catch { /* ignore */ }
        }

        return this.getDownload(downloadId)!;
    }

    // Pause a download
    async pauseDownload(downloadId: number): Promise<boolean> {
        const record = this.getDownload(downloadId);
        if (!record || (!this.isTorrentActiveStatus(record.status) && record.status !== 'downloading')) return false;

        this.clearTimer(downloadId);

        // Handle HTTP downloads
        if (record.magnetUri.startsWith('http-direct:')) {
            const controller = this.httpAbortControllers.get(downloadId);
            if (controller) {
                controller.abort();
                this.httpAbortControllers.delete(downloadId);
            }
            db.prepare("UPDATE downloads SET status = 'paused', downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(downloadId);
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

        db.prepare("UPDATE downloads SET status = 'paused', downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(downloadId);
        return true;
    }

    // Resume a download
    async resumeDownload(downloadId: number): Promise<boolean> {
        const record = this.getDownload(downloadId);
        if (!record || (record.status !== 'paused' && record.status !== 'downloading' && record.status !== 'metadata' && record.status !== 'stalled' && record.status !== 'error')) {
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

        const downloadPath = record.downloadPath || this.getDownloadPath();

        console.log(`[DownloadManager] Resume #${downloadId}: path=${downloadPath}, infoHash=${record.infoHash || 'null'}, name=${record.name || 'null'}`);
        if (record.status === 'error') {
            try {
                db.prepare(`
                    UPDATE downloads
                    SET retryCount = 0,
                        errorMessage = NULL,
                        stateUpdatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(downloadId);
            } catch { /* ignore */ }
        }

        // Try to find existing torrent in client
        const torrent = this.findTorrent(record.infoHash || record.magnetUri);

        if (torrent) {
            // Found existing torrent — just resume it
            try {
                torrent.resume();
                console.log(`[DownloadManager] Resumed existing torrent: ${torrent.infoHash}`);
                this.setupTorrentEvents(downloadId, torrent);
                if (this.hasTorrentMetadata(torrent)) {
                    this.markTorrentHasMetadata(downloadId, torrent);
                } else {
                    db.prepare(`
                        UPDATE downloads
                        SET status = 'metadata',
                            errorMessage = NULL,
                            downloadSpeed = 0,
                            stateUpdatedAt = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(downloadId);
                    this.scheduleMetadataRetry(downloadId, record.magnetUri, downloadPath);
                }
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
            return await this.startTorrentDownload(downloadId, record.magnetUri, downloadPath, record.status !== 'error');
        } catch (err: any) {
            console.error(`[DownloadManager] Failed to re-add torrent:`, err?.message);
            db.prepare("UPDATE downloads SET status = ?, errorMessage = ?, stateUpdatedAt = CURRENT_TIMESTAMP WHERE id = ?")
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

        const allowedRoots = [path.join(process.cwd(), 'downloads')];
        try {
            const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath') as { value: string } | undefined;
            if (setting?.value) allowedRoots.push(setting.value);
        } catch { /* ignore */ }
        try {
            const folders = db.prepare('SELECT folderPath FROM scanned_folders').all() as { folderPath: string }[];
            allowedRoots.push(...folders.map((folder) => folder.folderPath));
        } catch { /* ignore */ }

        for (const candidate of candidates) {
            try {
                if (fs.existsSync(candidate)) {
                    if (!isPathInsideAny(candidate, allowedRoots)) {
                        console.warn('[Download] Refusing to delete outside configured download/library folders:', candidate);
                        continue;
                    }
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
                const torrent = this.findTorrent(record.infoHash || record.magnetUri);

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
            this.repairIncompleteHttpCompletions();
            return db.prepare('SELECT * FROM downloads ORDER BY startedAt DESC').all() as DownloadRecord[];
        } catch {
            return [];
        }
    }

    // Get single download
    getDownload(id: number): DownloadRecord | null {
        try {
            this.repairIncompleteHttpCompletions();
            return (db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as DownloadRecord) || null;
        } catch {
            return null;
        }
    }

    // Get active download count
    getActiveCount(): number {
        try {
            const result = db.prepare("SELECT COUNT(*) as count FROM downloads WHERE status IN ('metadata', 'downloading', 'stalled')").get() as { count: number };
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
                if (!record || !this.isTorrentActiveStatus(record.status)) {
                    clearInterval(timer);
                    this.progressTimers.delete(downloadId);
                    return;
                }

                const hasMetadata = this.hasTorrentMetadata(torrent);
                const progress = hasMetadata ? Math.round((torrent.progress || 0) * 10000) / 100 : 0;
                const downloadSpeed = Math.round(torrent.downloadSpeed || 0);
                const downloadedSize = torrent.downloaded || 0;
                const totalSize = torrent.length || record.totalSize || 0;
                const madeProgress = downloadedSize > (record.downloadedSize || 0) || downloadSpeed > 0;
                const lastProgressAt = record.lastProgressAt ? new Date(record.lastProgressAt).getTime() : Date.now();
                const stalled = hasMetadata
                    && progress < 100
                    && !madeProgress
                    && Date.now() - lastProgressAt > this.stalledTimeoutMs;
                const nextStatus: DownloadStatus = !hasMetadata ? 'metadata' : stalled ? 'stalled' : 'downloading';

                db.prepare(`
            UPDATE downloads
            SET progress = ?,
                downloadSpeed = ?,
                downloadedSize = ?,
                totalSize = ?,
                status = ?,
                errorMessage = CASE
                    WHEN ? = 'stalled' THEN 'No download progress recently. Waiting for peers or retry manually.'
                    WHEN status = 'stalled' AND ? = 'downloading' THEN NULL
                    ELSE errorMessage
                END,
                lastProgressAt = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE lastProgressAt END,
                stateUpdatedAt = CASE WHEN status != ? THEN CURRENT_TIMESTAMP ELSE stateUpdatedAt END
            WHERE id = ?
              AND status IN ('metadata', 'downloading', 'stalled')
          `).run(
                    progress,
                    downloadSpeed,
                    downloadedSize,
                    totalSize,
                    nextStatus,
                    nextStatus,
                    nextStatus,
                    madeProgress ? 1 : 0,
                    nextStatus,
                    downloadId
                );
            } catch { /* ignore */ }
        }, 2000);
        this.progressTimers.set(downloadId, timer);
    }

    private setupTorrentEvents(downloadId: number, torrent: any) {
        if (!torrent.__lflixDownloadEventIds) {
            torrent.__lflixDownloadEventIds = new Set<number>();
        }
        const alreadyBound = torrent.__lflixDownloadEventIds.has(downloadId);

        if (!alreadyBound) {
            torrent.__lflixDownloadEventIds.add(downloadId);

            torrent.on('metadata', () => {
                console.log(`[DownloadManager] Metadata received: ${torrent.name}, ${torrent.files?.length || 0} files, path: ${torrent.path}`);
                this.markTorrentHasMetadata(downloadId, torrent);
            });

            torrent.on('ready', () => {
                console.log(`[DownloadManager] Torrent ready: ${torrent.name}, downloaded: ${torrent.downloaded}, length: ${torrent.length}`);
                this.markTorrentHasMetadata(downloadId, torrent);
            });
        }

        if (!alreadyBound && this.hasTorrentMetadata(torrent)) {
            setImmediate(() => this.markTorrentHasMetadata(downloadId, torrent));
        }

        this.setupTorrentProgressTimer(downloadId, torrent);

        if (alreadyBound) return;

        torrent.on('done', () => {
            this.clearTimer(downloadId);
            try {
                db.prepare(`
            UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
            downloadedSize = totalSize, completedAt = CURRENT_TIMESTAMP, stateUpdatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(downloadId);
            } catch { /* ignore */ }
            this.triggerRescan();
        });

        torrent.on('error', (err: Error) => {
            this.clearTimer(downloadId);
            try {
                db.prepare(`UPDATE downloads SET status = 'error', errorMessage = ?, downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP WHERE id = ?`)
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
        this.clearMetadataTimer(downloadId);
    }

    private clearMetadataTimer(downloadId: number) {
        const timer = this.metadataTimers.get(downloadId);
        if (timer) {
            clearTimeout(timer);
            this.metadataTimers.delete(downloadId);
        }
    }

    private repairIncompleteHttpCompletions(): void {
        try {
            db.prepare(`
                UPDATE downloads
                SET status = 'error',
                    progress = ROUND((downloadedSize * 100.0) / totalSize, 2),
                    downloadSpeed = 0,
                    errorMessage = 'Download incomplete. Retry to download the full file.',
                    stateUpdatedAt = CURRENT_TIMESTAMP,
                    completedAt = NULL
                WHERE status = 'completed'
                    AND magnetUri LIKE 'http-direct:%'
                    AND totalSize > 0
                    AND downloadedSize >= 0
                    AND downloadedSize < totalSize
            `).run();
        } catch { /* ignore */ }
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

        // Start Release Monitor & Auto Downloader after a delay to let the server fully boot
        setTimeout(async () => {
            try {
                const { default: releaseMonitor } = await import('./releaseMonitor');
                const { default: autoDownloader } = await import('./autoDownloader');

                // Start the release monitor (checks every 30 minutes)
                releaseMonitor.start(30 * 60 * 1000);
                console.log('[Startup] Release monitor started');

                // Retry any pending episode downloads from previous sessions
                autoDownloader.retryPendingEpisodes().catch(e =>
                    console.error('[Startup] Auto-download retry failed:', e)
                );
                console.log('[Startup] Auto-downloader initialized');

                // Hook: when release monitor finds new episodes, auto-download them
                const originalCheckAll = releaseMonitor.checkAllTrackedShows.bind(releaseMonitor);
                releaseMonitor.checkAllTrackedShows = async () => {
                    const newEpisodes = await originalCheckAll();
                    if (newEpisodes.length > 0) {
                        autoDownloader.processNewEpisodes(newEpisodes).catch(e =>
                            console.error('[Startup] Auto-download processing failed:', e)
                        );
                    }
                    return newEpisodes;
                };

                // Start Movie Release Monitor (checks watchlist movies for availability, notify only)
                const { default: movieReleaseMonitor } = await import('./movieReleaseMonitor');
                movieReleaseMonitor.start(60 * 60 * 1000); // Every 60 minutes
                console.log('[Startup] Movie release monitor started');
            } catch (e) {
                console.error('[Startup] Release monitor / auto-downloader init failed:', e);
            }
        }, 5000);
    } catch (e) {
        console.error('[DownloadManager] Startup init failed:', e);
    }
});

export default downloadManager;
