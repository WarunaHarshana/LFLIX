/**
 * Download Manager — wraps WebTorrent for torrent downloading + HTTP direct downloads
 * Supports: add, remove, pause, resume downloads (torrent & HTTP)
 */

import db from './db';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { isPathInsideAny, sanitizeFilename } from './security';

const downloadHttpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 15000,
    maxSockets: 64,
});

const downloadHttpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 15000,
    maxSockets: 64,
});

type DownloadStatus = 'metadata' | 'downloading' | 'stalled' | 'uploading' | 'completed' | 'error' | 'paused';

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
    target?: 'local' | 'gdrive' | 'cloud';
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
    private gdriveProcesses: Map<number, any> = new Map();
    private aria2Processes: Map<number, any> = new Map();
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
            // Pause any in-progress local/gdrive HTTP downloads from previous session since local processes do not survive restart
            db.prepare(`
                UPDATE downloads
                SET status = 'paused', downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP
                WHERE status IN ('downloading', 'uploading') 
                  AND magnetUri LIKE 'http-direct:%'
                  AND (target IS NULL OR target != 'cloud')
            `).run();

            // If there are active cloud downloads, start cloud sync
            try {
                const activeCloud = db.prepare(
                    `SELECT COUNT(*) as count FROM downloads 
                     WHERE status IN ('metadata', 'downloading', 'uploading') 
                       AND target = 'cloud'`
                ).get() as { count: number };
                if (activeCloud?.count > 0) {
                    const { ensureCloudSyncRunning } = await import('./cloudDownloader');
                    ensureCloudSyncRunning();
                }
            } catch { /* ignore */ }

            // Re-attach all in-progress local torrent downloads on server start that aren't currently active
            const staleDownloads = db.prepare(
                `SELECT id, magnetUri, status, infoHash, name, downloadPath, startedAt 
                 FROM downloads 
                 WHERE status IN ('metadata', 'downloading', 'stalled') 
                 AND magnetUri NOT LIKE 'http-direct:%'
                 AND (target IS NULL OR target != 'cloud')`
            ).all() as any[];

            if (staleDownloads.length === 0) {
                console.log('[DownloadManager] Recovery: no stuck local downloads');
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

    // Start a new download (auto-detects torrent vs HTTP, supports gdrive & cloud targets)
    async addDownload(magnetUri: string, watchlistId?: number, customPath?: string, customFilename?: string, target: 'local' | 'gdrive' | 'cloud' = 'local'): Promise<DownloadRecord> {
        console.log(`[DownloadManager] addDownload called for: ${magnetUri.substring(0, 30)}... target=${target}`);

        // Cloud target: transfer directly cloud-to-cloud to Google Drive (zero local disk/bandwidth)
        if (target === 'cloud') {
            const isHttp = magnetUri.startsWith('http-direct:');
            const rawUrl = isHttp ? magnetUri.replace('http-direct:', '') : magnetUri;
            const type = isHttp ? 'direct' : 'torrent';
            const { addCloudDownload } = await import('./cloudDownloader');
            const res = await addCloudDownload({
                url: rawUrl,
                type,
                filename: customFilename,
                watchlistId,
            });
            if (!res.success || !res.downloadId) {
                throw new Error(res.error || 'Failed to dispatch cloud download');
            }
            const record = this.getDownload(res.downloadId);
            if (!record) throw new Error('Download record could not be retrieved');
            return record;
        }

        // Google Drive DDL: stream directly from URL to GDrive via rclone copyurl
        if (target === 'gdrive' && magnetUri.startsWith('http-direct:')) {
            return this.addGdriveHttpDownload(magnetUri.replace('http-direct:', ''), customFilename, watchlistId);
        }

        // Detect HTTP direct download
        if (magnetUri.startsWith('http-direct:')) {
            const url = magnetUri.replace('http-direct:', '');
            let filename = customFilename ? sanitizeFilename(customFilename) : '';
            const hasProviderJunk = Boolean(
                filename && (
                    /cinejoy/i.test(filename) ||
                    /fsl_server/i.test(filename) ||
                    /^4k_/i.test(filename) ||
                    /download_\d+/i.test(filename)
                )
            );

            if (!filename || hasProviderJunk) {
                try {
                    const parsedUrl = new URL(url);
                    const disposition = parsedUrl.searchParams.get('response-content-disposition');
                    if (disposition) {
                        const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
                        if (match && match[1]) {
                            const extracted = sanitizeFilename(decodeURIComponent(match[1]));
                            if (extracted && !/^(?:download|video|file)\.[a-z0-9]+$/i.test(extracted)) {
                                filename = extracted;
                            }
                        }
                    }
                    if (!filename || (hasProviderJunk && /cinejoy|fsl_server/i.test(filename))) {
                        const pathName = parsedUrl.pathname.split('/').filter(Boolean).pop();
                        if (pathName && pathName.includes('.')) {
                            const extracted = sanitizeFilename(decodeURIComponent(pathName));
                            if (extracted && !/^(?:download|video|file)\.[a-z0-9]+$/i.test(extracted)) {
                                filename = extracted;
                            }
                        }
                    }
                } catch {
                    if (!filename || (hasProviderJunk && /cinejoy|fsl_server/i.test(filename))) {
                        const fallback = sanitizeFilename(decodeURIComponent(url.split('/').pop()?.split('?')[0] || ''));
                        if (fallback && !/^(?:download|video|file)\.[a-z0-9]+$/i.test(fallback)) {
                            filename = fallback;
                        }
                    }
                }
            }
            if (!filename || filename === 'download' || (hasProviderJunk && /cinejoy|fsl_server/i.test(filename))) {
                filename = `download_${Date.now()}.mkv`;
            }
            return this.addHttpDownload(url, filename, watchlistId, customPath, target);
        }

        // For GDrive torrent downloads, use temp path
        let downloadPath = customPath || this.getDownloadPath();
        if (target === 'gdrive') {
            try {
                const { getGdriveConfig } = await import('./gdriveUploader');
                const config = getGdriveConfig();
                downloadPath = config.tempPath;
                if (!fs.existsSync(downloadPath)) {
                    fs.mkdirSync(downloadPath, { recursive: true });
                }
            } catch { /* fallback to default download path */ }
        }

        // Insert DB record
        const stmt = db.prepare(`
      INSERT INTO downloads (magnetUri, watchlistId, status, downloadPath, retryCount, lastProgressAt, stateUpdatedAt, target)
      VALUES (?, ?, 'metadata', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `);
        const result = stmt.run(magnetUri, watchlistId || null, downloadPath, target);
        const downloadId = Number(result.lastInsertRowid);

        await this.startTorrentDownload(downloadId, magnetUri, downloadPath);

        return this.getDownload(downloadId)!;
    }

    // Start an HTTP direct download
    private async addHttpDownload(url: string, filename: string, watchlistId?: number, customPath?: string, target: 'local' | 'gdrive' = 'local'): Promise<DownloadRecord> {
        const downloadPath = customPath || this.getDownloadPath();
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }

        const filePath = path.join(downloadPath, filename);
        const magnetUriStored = `http-direct:${url}`;

        // Insert DB record
        const stmt = db.prepare(`
      INSERT INTO downloads (magnetUri, name, watchlistId, status, downloadPath, retryCount, lastProgressAt, stateUpdatedAt, target)
      VALUES (?, ?, ?, 'downloading', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `);
        const result = stmt.run(magnetUriStored, filename, watchlistId || null, downloadPath, target);
        const downloadId = Number(result.lastInsertRowid);

        try {
            const { isAria2Available } = await import('./aria2Downloader');
            if (isAria2Available()) {
                await this.startAria2HttpDownload(downloadId, url, filename, downloadPath, target);
                return this.getDownload(downloadId)!;
            }
        } catch (aria2Err) {
            console.warn('[DownloadManager] Aria2 check failed, falling back to HTTP stream:', aria2Err);
        }

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
                let referer = 'https://cinejoy.to/';
                try {
                    const parsed = new URL(requestUrl);
                    if (!parsed.hostname.includes('shegu.st') && !parsed.hostname.includes('workers.dev') && !parsed.hostname.includes('cloudflarestorage.com')) {
                        referer = `${parsed.origin}/`;
                    }
                } catch { /* ignore */ }

                const headers: Record<string, string> = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
                    'Referer': referer,
                };
                if (existingBytes > 0) {
                    headers.Range = `bytes=${existingBytes}-`;
                }

                const isHttps = requestUrl.startsWith('https');
                const httpModule = isHttps ? https : http;
                const agent = isHttps ? downloadHttpsAgent : downloadHttpAgent;
                activeRequest = httpModule.get(requestUrl, { headers, agent }, (response) => {
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
                        let errorMsg = `HTTP error ${response.statusCode}`;
                        if (response.statusCode === 403) {
                            errorMsg = 'Google Drive download quota exceeded for this file. Please choose another quality link (e.g. 1080p) or download via torrent.';
                        } else if (response.statusCode === 404) {
                            errorMsg = 'File not found on host (HTTP 404). The stream link may have expired.';
                        } else if (response.statusCode === 410) {
                            errorMsg = 'Download link has expired (HTTP 410). Please search and choose a fresh link.';
                        }
                        markHttpError(errorMsg);
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
                    activeFileStream = fs.createWriteStream(filePath, {
                        flags: canAppend ? 'a' : 'w',
                        highWaterMark: 4 * 1024 * 1024, // 4MB buffer for maximum throughput
                    });

                    const retryFromPartial = (reason: string) => {
                        if (settled) return;
                        settled = true;
                        activeFileStream?.destroy();
                        activeFileStream = null;
                        scheduleRetry(attempt, reason);
                    };

                    // Inactivity timeout: if no data received for 30s, automatically retry and resume
                    response.setTimeout(30000, () => {
                        retryFromPartial('Connection stalled (no data for 30s)');
                    });

                    response.on('data', (chunk: Buffer) => {
                        downloadedBytes += chunk.length;
                        response.setTimeout(30000);
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

                        if (target === 'gdrive') {
                            // Upload to Google Drive and delete local temp copy
                            (async () => {
                                try {
                                    db.prepare(`
                                        UPDATE downloads SET status = 'uploading', progress = 0, downloadSpeed = 0,
                                        downloadedSize = ?, totalSize = ?, stateUpdatedAt = CURRENT_TIMESTAMP
                                        WHERE id = ?
                                    `).run(downloadedBytes, totalBytes || downloadedBytes, downloadId);

                                    const { getOrganizedRemotePath, uploadFile, getGdriveConfig } = await import('./gdriveUploader');
                                    const gdriveConfig = getGdriveConfig();
                                    const remoteDest = getOrganizedRemotePath(filename);
                                    const mountedPath = path.join(gdriveConfig.mountPath, remoteDest);

                                    console.log(`[DownloadManager] Staged download complete. Uploading to Google Drive: ${remoteDest}`);

                                    const proc = uploadFile(
                                        filePath,
                                        remoteDest,
                                        (progress) => {
                                            try {
                                                db.prepare(`
                                                    UPDATE downloads
                                                    SET progress = ?, lastProgressAt = CURRENT_TIMESTAMP
                                                    WHERE id = ? AND (status = 'uploading' OR status = 'downloading')
                                                `).run(progress.percent, downloadId);
                                            } catch { /* ignore */ }
                                        },
                                        (success, error) => {
                                            this.gdriveProcesses.delete(downloadId);
                                            if (success) {
                                                try {
                                                    db.prepare(`
                                                        UPDATE downloads
                                                        SET status = 'completed', progress = 100, downloadSpeed = 0,
                                                            downloadPath = ?, completedAt = CURRENT_TIMESTAMP, stateUpdatedAt = CURRENT_TIMESTAMP
                                                        WHERE id = ?
                                                    `).run(mountedPath, downloadId);
                                                } catch { /* ignore */ }
                                                this.triggerRescan();
                                            } else {
                                                try {
                                                    db.prepare(`
                                                        UPDATE downloads
                                                        SET status = 'error', errorMessage = ?, downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP
                                                        WHERE id = ?
                                                    `).run(error || 'Google Drive upload failed', downloadId);
                                                } catch { /* ignore */ }
                                            }
                                        }
                                    );
                                    this.gdriveProcesses.set(downloadId, proc);
                                } catch (uploadErr: any) {
                                    db.prepare(`
                                        UPDATE downloads
                                        SET status = 'error', errorMessage = ?, downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP
                                        WHERE id = ?
                                    `).run(uploadErr?.message || 'Failed to start Google Drive upload', downloadId);
                                }
                            })();
                        } else {
                            try {
                                db.prepare(`
                                    UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
                                    downloadedSize = ?, totalSize = ?, completedAt = CURRENT_TIMESTAMP,
                                    stateUpdatedAt = CURRENT_TIMESTAMP
                                    WHERE id = ? AND status = 'downloading'
                                `).run(downloadedBytes, totalBytes || downloadedBytes, downloadId);
                            } catch { /* ignore */ }

                            // Automatically organize TV show episode into TV Shows/<Show Name>/Season <N>/
                            (async () => {
                                try {
                                    const { organizeDownloadedItem } = await import('./mediaOrganizer');
                                    await organizeDownloadedItem(downloadPath, filename);
                                } catch (orgErr) {
                                    console.warn('[DownloadManager] Auto-organize failed for HTTP download:', orgErr);
                                }
                                this.triggerRescan();
                            })();
                        }
                    });

                    response.pipe(activeFileStream);
                });

                activeRequest.setTimeout(30000, () => {
                    if (abortController.signal.aborted) return;
                    activeRequest?.destroy(new Error('Connection timed out'));
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

    // Start an aria2 high-performance multi-connection HTTP download
    private async startAria2HttpDownload(
        downloadId: number,
        url: string,
        filename: string,
        downloadPath: string,
        target: 'local' | 'gdrive' = 'local'
    ): Promise<void> {
        const { startAria2Download } = await import('./aria2Downloader');
        const filePath = path.join(downloadPath, filename);

        let referer = 'https://cinejoy.to/';
        try {
            const parsed = new URL(url);
            if (!parsed.hostname.includes('shegu.st') && !parsed.hostname.includes('workers.dev') && !parsed.hostname.includes('cloudflarestorage.com')) {
                referer = `${parsed.origin}/`;
            }
        } catch { /* ignore */ }

        try {
            const proc = startAria2Download({
                url,
                downloadDir: downloadPath,
                filename,
                maxConnections: 16,
                referer,
                onProgress: (prog) => {
                    try {
                        db.prepare(`
                            UPDATE downloads
                            SET progress = ?,
                                downloadSpeed = ?,
                                downloadedSize = ?,
                                totalSize = CASE WHEN ? > 0 THEN ? ELSE totalSize END,
                                lastProgressAt = CASE WHEN ? > 0 THEN CURRENT_TIMESTAMP ELSE lastProgressAt END
                            WHERE id = ? AND status = 'downloading'
                        `).run(
                            prog.percent,
                            prog.speedBytes,
                            prog.downloadedBytes,
                            prog.totalBytes,
                            prog.totalBytes,
                            prog.speedBytes,
                            downloadId
                        );
                    } catch { /* ignore */ }
                },
                onComplete: async (success, error) => {
                    this.aria2Processes.delete(downloadId);
                    const current = this.getDownload(downloadId);
                    if (!current || current.status === 'paused') {
                        return;
                    }

                    if (success) {
                        if (target === 'gdrive') {
                            try {
                                let downloadedBytes = 0;
                                try {
                                    if (fs.existsSync(filePath)) {
                                        downloadedBytes = fs.statSync(filePath).size;
                                    }
                                } catch { /* ignore */ }

                                db.prepare(`
                                    UPDATE downloads SET status = 'uploading', progress = 0, downloadSpeed = 0,
                                    downloadedSize = COALESCE(NULLIF(downloadedSize, 0), ?),
                                    totalSize = COALESCE(NULLIF(totalSize, 0), ?),
                                    stateUpdatedAt = CURRENT_TIMESTAMP
                                    WHERE id = ?
                                `).run(downloadedBytes, downloadedBytes, downloadId);

                                const { getOrganizedRemotePath, uploadFile, getGdriveConfig } = await import('./gdriveUploader');
                                const gdriveConfig = getGdriveConfig();
                                const remoteDest = getOrganizedRemotePath(filename);
                                const mountedPath = path.join(gdriveConfig.mountPath, remoteDest);

                                console.log(`[DownloadManager] Aria2 staged download complete. Uploading to Google Drive: ${remoteDest}`);

                                const uploadProc = uploadFile(
                                    filePath,
                                    remoteDest,
                                    (progress) => {
                                        try {
                                            db.prepare(`
                                                UPDATE downloads
                                                SET progress = ?, lastProgressAt = CURRENT_TIMESTAMP
                                                WHERE id = ? AND (status = 'uploading' OR status = 'downloading')
                                            `).run(progress.percent, downloadId);
                                        } catch { /* ignore */ }
                                    },
                                    (upSuccess, upError) => {
                                        this.gdriveProcesses.delete(downloadId);
                                        if (upSuccess) {
                                            try {
                                                db.prepare(`
                                                    UPDATE downloads
                                                    SET status = 'completed', progress = 100, downloadSpeed = 0,
                                                        downloadPath = ?, completedAt = CURRENT_TIMESTAMP, stateUpdatedAt = CURRENT_TIMESTAMP
                                                    WHERE id = ?
                                                `).run(mountedPath, downloadId);
                                            } catch { /* ignore */ }
                                            this.triggerRescan();
                                        } else {
                                            try {
                                                db.prepare(`
                                                    UPDATE downloads
                                                    SET status = 'error', errorMessage = ?, downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP
                                                    WHERE id = ?
                                                `).run(upError || 'Google Drive upload failed', downloadId);
                                            } catch { /* ignore */ }
                                        }
                                    }
                                );
                                this.gdriveProcesses.set(downloadId, uploadProc);
                            } catch (uploadErr: any) {
                                db.prepare(`
                                    UPDATE downloads
                                    SET status = 'error', errorMessage = ?, downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP
                                    WHERE id = ?
                                `).run(uploadErr?.message || 'Failed to start Google Drive upload', downloadId);
                            }
                        } else {
                            let fileSize = 0;
                            try {
                                if (fs.existsSync(filePath)) {
                                    fileSize = fs.statSync(filePath).size;
                                }
                            } catch { /* ignore */ }

                            try {
                                db.prepare(`
                                    UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
                                    downloadedSize = COALESCE(NULLIF(downloadedSize, 0), ?),
                                    totalSize = COALESCE(NULLIF(totalSize, 0), ?),
                                    completedAt = CURRENT_TIMESTAMP,
                                    stateUpdatedAt = CURRENT_TIMESTAMP
                                    WHERE id = ? AND status = 'downloading'
                                `).run(fileSize, fileSize, downloadId);
                            } catch { /* ignore */ }

                            try {
                                const { organizeDownloadedItem } = await import('./mediaOrganizer');
                                await organizeDownloadedItem(downloadPath, filename);
                            } catch (orgErr) {
                                console.warn('[DownloadManager] Auto-organize failed for Aria2 download:', orgErr);
                            }
                            this.triggerRescan();
                        }
                    } else {
                        try {
                            db.prepare(`
                                UPDATE downloads SET status = 'error', errorMessage = ?, downloadSpeed = 0,
                                stateUpdatedAt = CURRENT_TIMESTAMP
                                WHERE id = ? AND status = 'downloading'
                            `).run(error || 'Aria2 download failed', downloadId);
                        } catch { /* ignore */ }
                    }
                },
            });

            this.aria2Processes.set(downloadId, proc);
        } catch (err: any) {
            console.error('[DownloadManager] Failed to spawn Aria2 process:', err);
            db.prepare(`
                UPDATE downloads SET status = 'error', errorMessage = ?, downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(err?.message || 'Failed to start aria2c', downloadId);
        }
    }

    // Start a Google Drive HTTP direct download (streams directly to Google Drive via rclone copyurl)
    private async addGdriveHttpDownload(url: string, customFilename?: string, watchlistId?: number): Promise<DownloadRecord> {
        let filename = customFilename ? sanitizeFilename(customFilename) : '';
        if (!filename) {
            try {
                const parsed = new URL(url);
                const pathName = parsed.pathname.split('/').filter(Boolean).pop();
                if (pathName && pathName.includes('.')) {
                    filename = sanitizeFilename(decodeURIComponent(pathName));
                }
            } catch { /* ignore */ }
        }
        if (!filename || filename === 'download') {
            filename = `download_${Date.now()}.mkv`;
        }

        const { getOrganizedRemotePath, uploadUrl, getGdriveConfig, getFreeSpaceBytes } = await import('./gdriveUploader');
        const config = getGdriveConfig();
        const tempPath = config.tempPath;
        const canUseTemp = Boolean(tempPath && getFreeSpaceBytes(tempPath) > 5 * 1024 * 1024 * 1024); // at least 5GB free

        if (canUseTemp) {
            console.log(`[GDrive] Staging HTTP direct download via local temp: ${tempPath}`);
            return this.addHttpDownload(url, filename, watchlistId, tempPath, 'gdrive');
        }

        const remoteDest = getOrganizedRemotePath(filename);
        const mountedPath = path.join(config.mountPath, remoteDest);
        const magnetUriStored = `http-direct:${url}`;

        const stmt = db.prepare(`
            INSERT INTO downloads (magnetUri, name, watchlistId, status, downloadPath, retryCount, lastProgressAt, stateUpdatedAt, target)
            VALUES (?, ?, ?, 'downloading', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'gdrive')
        `);
        const result = stmt.run(magnetUriStored, filename, watchlistId || null, mountedPath);
        const downloadId = Number(result.lastInsertRowid);

        const proc = uploadUrl(
            url,
            remoteDest,
            (progress) => {
                try {
                    let speedBytes = 0;
                    let downloaded = 0;
                    let total = 0;
                    if (progress.speed) {
                        const sm = progress.speed.match(/([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB)/i);
                        if (sm) {
                            const val = parseFloat(sm[1]);
                            const unit = sm[2].toUpperCase().replace('IB', 'B');
                            const mults: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
                            speedBytes = Math.round(val * (mults[unit] || 1));
                        }
                    }
                    if (progress.transferred && progress.transferred.includes('/')) {
                        const [dStr, tStr] = progress.transferred.split('/');
                        const dm = dStr.match(/([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB)/i);
                        const tm = tStr.match(/([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB)/i);
                        const mults: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
                        if (dm) downloaded = Math.round(parseFloat(dm[1]) * (mults[dm[2].toUpperCase().replace('IB', 'B')] || 1));
                        if (tm) total = Math.round(parseFloat(tm[1]) * (mults[tm[2].toUpperCase().replace('IB', 'B')] || 1));
                    }

                    db.prepare(`
                        UPDATE downloads
                        SET progress = ?,
                            downloadSpeed = CASE WHEN ? > 0 THEN ? ELSE downloadSpeed END,
                            downloadedSize = CASE WHEN ? > 0 THEN ? ELSE downloadedSize END,
                            totalSize = CASE WHEN ? > 0 THEN ? ELSE totalSize END,
                            lastProgressAt = CURRENT_TIMESTAMP
                        WHERE id = ? AND status = 'downloading'
                    `).run(progress.percent, speedBytes, speedBytes, downloaded, downloaded, total, total, downloadId);
                } catch { /* ignore */ }
            },
            (success, error) => {
                this.gdriveProcesses.delete(downloadId);
                if (success) {
                    try {
                        db.prepare(`
                            UPDATE downloads
                            SET status = 'completed', progress = 100, downloadSpeed = 0,
                                completedAt = CURRENT_TIMESTAMP, stateUpdatedAt = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(downloadId);
                    } catch { /* ignore */ }
                    this.triggerRescan();
                } else {
                    try {
                        db.prepare(`
                            UPDATE downloads
                            SET status = 'error', errorMessage = ?, downloadSpeed = 0,
                                stateUpdatedAt = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(error || 'Google Drive upload failed', downloadId);
                    } catch { /* ignore */ }
                }
            }
        );

        this.gdriveProcesses.set(downloadId, proc);
        return this.getDownload(downloadId)!;
    }

    // Pause a download
    async pauseDownload(downloadId: number): Promise<boolean> {
        const record = this.getDownload(downloadId);
        if (!record || (!this.isTorrentActiveStatus(record.status) && record.status !== 'downloading' && record.status !== 'uploading')) return false;

        this.clearTimer(downloadId);

        // Handle active GDrive processes (rclone copyurl / moveto)
        const gdriveProc = this.gdriveProcesses.get(downloadId);
        if (gdriveProc) {
            try { gdriveProc.kill(); } catch { /* ignore */ }
            this.gdriveProcesses.delete(downloadId);
            db.prepare("UPDATE downloads SET status = 'paused', downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(downloadId);
            return true;
        }

        // Handle active Aria2 processes
        const aria2Proc = this.aria2Processes.get(downloadId);
        if (aria2Proc) {
            try { aria2Proc.kill(); } catch { /* ignore */ }
            this.aria2Processes.delete(downloadId);
            db.prepare("UPDATE downloads SET status = 'paused', downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(downloadId);
            return true;
        }

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

        // Handle Cloud downloads
        if (record.target === 'cloud') {
            const isDirect = record.magnetUri.startsWith('http-direct:');
            const url = isDirect ? record.magnetUri.replace('http-direct:', '') : record.magnetUri;
            try {
                const { addCloudDownload } = await import('./cloudDownloader');
                db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
                const res = await addCloudDownload({
                    url,
                    type: isDirect ? 'direct' : 'torrent',
                    filename: record.name || undefined,
                    watchlistId: record.watchlistId || undefined,
                });
                return res.success;
            } catch (err: any) {
                console.error('[DownloadManager] Error resuming cloud download:', err);
                return false;
            }
        }

        // Handle HTTP downloads
        if (record.magnetUri.startsWith('http-direct:')) {
            const url = record.magnetUri.replace('http-direct:', '');
            const filename = record.name || decodeURIComponent(url.split('/').pop() || 'download');
            const target: 'local' | 'gdrive' = record.target === 'gdrive' ? 'gdrive' : 'local';
            const downloadPath = record.downloadPath || (target === 'gdrive' ? (await import('./gdriveUploader')).getGdriveConfig().tempPath : this.getDownloadPath());

            try {
                const { isAria2Available } = await import('./aria2Downloader');
                if (isAria2Available()) {
                    db.prepare(`
                        UPDATE downloads
                        SET status = 'downloading', downloadSpeed = 0, errorMessage = NULL, stateUpdatedAt = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(downloadId);
                    await this.startAria2HttpDownload(downloadId, url, filename, downloadPath, target);
                    return true;
                }
            } catch (aria2Err) {
                console.warn('[DownloadManager] Aria2 resume check failed:', aria2Err);
            }

            // Fallback when aria2 is not available: restart from scratch (no resume support)
            if (record.downloadPath && record.name) {
                const filePath = path.join(record.downloadPath, record.name);
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
            }
            db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
            if (record.target === 'gdrive') {
                await this.addGdriveHttpDownload(url, filename, record.watchlistId || undefined);
            } else {
                await this.addHttpDownload(url, filename, record.watchlistId || undefined, record.downloadPath || undefined, target);
            }
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
    private async deleteFilesFromDisk(record: DownloadRecord, extraCandidatePaths: string[] = []): Promise<void> {
        console.log('[Download] Attempting file deletion for:', {
            id: record.id,
            name: record.name,
            downloadPath: record.downloadPath,
            infoHash: record.infoHash,
            extraCandidatePaths,
        });

        // Build list of candidate paths to try
        const candidates: string[] = [...extraCandidatePaths];

        if (record.downloadPath && record.name) {
            candidates.push(path.join(record.downloadPath, record.name));
            candidates.push(path.join(record.downloadPath, `${record.name}.aria2`));
        }
        if (record.downloadPath && record.infoHash) {
            candidates.push(path.join(record.downloadPath, record.infoHash));
        }
        // Fallback: project downloads folder
        if (record.name) {
            candidates.push(path.join(process.cwd(), 'downloads', record.name));
            candidates.push(path.join(process.cwd(), 'downloads', `${record.name}.aria2`));
        }
        if (record.infoHash) {
            candidates.push(path.join(process.cwd(), 'downloads', record.infoHash));
        }

        // Also check if any files were organized into TV Shows
        const rootDownload = record.downloadPath || path.join(process.cwd(), 'downloads');
        if (record.name && fs.existsSync(path.join(rootDownload, 'TV Shows'))) {
            const tvShowsRoot = path.join(rootDownload, 'TV Shows');
            try {
                const shows = fs.readdirSync(tvShowsRoot);
                for (const show of shows) {
                    const showDir = path.join(tvShowsRoot, show);
                    if (fs.statSync(showDir).isDirectory()) {
                        const seasons = fs.readdirSync(showDir);
                        for (const season of seasons) {
                            const seasonDir = path.join(showDir, season);
                            if (fs.statSync(seasonDir).isDirectory()) {
                                const files = fs.readdirSync(seasonDir);
                                for (const file of files) {
                                    if (file === record.name || file.toLowerCase().includes(record.name.toLowerCase())) {
                                        candidates.push(path.join(seasonDir, file));
                                    }
                                }
                            }
                        }
                    }
                }
            } catch { /* ignore */ }
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

        let deletedAny = false;

        for (const candidate of candidates) {
            if (!candidate) continue;
            try {
                if (fs.existsSync(candidate)) {
                    if (!isPathInsideAny(candidate, allowedRoots)) {
                        console.warn('[Download] Refusing to delete outside configured download/library folders:', candidate);
                        continue;
                    }
                    console.log('[Download] Deleting:', candidate);

                    // Try removing with retry if Windows holds a lock
                    let attempts = 0;
                    while (attempts < 3) {
                        try {
                            fs.rmSync(candidate, { recursive: true, force: true });
                            deletedAny = true;
                            console.log('[Download] Deleted successfully:', candidate);

                            // Clean up empty parent directories if it was inside TV Shows or Movie folders
                            try {
                                const { cleanupEmptyMediaDirectories } = require('./mediaOrganizer');
                                cleanupEmptyMediaDirectories(candidate);
                            } catch { /* ignore */ }

                            break;
                        } catch (err: any) {
                            attempts++;
                            if (attempts >= 3) {
                                console.error(`[Download] Failed to delete ${candidate} after 3 attempts:`, err?.message);
                            } else {
                                await new Promise(r => setTimeout(r, 150));
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('[Download] Failed to inspect candidate:', candidate, e);
            }
        }

        if (!deletedAny) {
            console.warn('[Download] No matching files deleted on disk. Candidates tried:', candidates);
        }
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

        // Cancel active Aria2 process if running
        const aria2Proc = this.aria2Processes.get(downloadId);
        if (aria2Proc) {
            try { aria2Proc.kill(); } catch { /* ignore */ }
            this.aria2Processes.delete(downloadId);
        }

        // Cancel active GDrive process if running
        const gdriveProc = this.gdriveProcesses.get(downloadId);
        if (gdriveProc) {
            try { gdriveProc.kill(); } catch { /* ignore */ }
            this.gdriveProcesses.delete(downloadId);
        }

        // Handle cloud downloads
        if (record.target === 'cloud') {
            try {
                const { cancelCloudDownload } = await import('./cloudDownloader');
                await cancelCloudDownload(downloadId);
            } catch { /* ignore */ }
            try {
                db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
            } catch (e) {
                console.error('[Download] Failed to delete cloud download from DB:', e);
                return false;
            }
            return true;
        }

        // Handle HTTP downloads
        if (record.magnetUri.startsWith('http-direct:')) {
            const controller = this.httpAbortControllers.get(downloadId);
            if (controller) {
                controller.abort();
                this.httpAbortControllers.delete(downloadId);
            }
            if (deleteFiles) {
                await this.deleteFilesFromDisk(record);
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
        const extraCandidatePaths: string[] = [];

        if (this.client) {
            try {
                const torrent = this.findTorrent(record.infoHash || record.magnetUri);

                if (torrent) {
                    // Extract file paths from torrent before destroying it
                    if (torrent.path && torrent.name) {
                        extraCandidatePaths.push(path.join(torrent.path, torrent.name));
                    }
                    if (torrent.files && Array.isArray(torrent.files)) {
                        for (const file of torrent.files) {
                            if (file.path && torrent.path) {
                                extraCandidatePaths.push(path.join(torrent.path, file.path));
                            }
                        }
                    }

                    await new Promise<void>((resolve) => {
                        try {
                            torrent.destroy({ destroyStore: false }, () => resolve());
                        } catch {
                            resolve();
                        }
                    });

                    // Give Windows a brief moment to release open file handles
                    await new Promise(r => setTimeout(r, 100));
                }
            } catch (e) {
                console.warn('[Download] Error destroying torrent handle:', e);
            }
        }

        if (deleteFiles) {
            await this.deleteFilesFromDisk(record, extraCandidatePaths);
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
            const result = db.prepare("SELECT COUNT(*) as count FROM downloads WHERE status IN ('metadata', 'downloading', 'stalled', 'uploading')").get() as { count: number };
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
                const isReady = Boolean(torrent.ready);
                const rawProgress = hasMetadata ? Math.round((torrent.progress || 0) * 10000) / 100 : 0;
                // While WebTorrent is verifying pieces on disk (before 'ready'), preserve known progress
                const progress = isReady ? rawProgress : Math.max(rawProgress, record.progress || 0);
                const downloadSpeed = Math.round(torrent.downloadSpeed || 0);
                const downloadedSize = isReady ? (torrent.downloaded || 0) : Math.max(torrent.downloaded || 0, record.downloadedSize || 0);
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

        torrent.on('done', async () => {
            this.clearTimer(downloadId);
            const record = this.getDownload(downloadId);
            const isGdriveTarget = record?.target === 'gdrive';

            const torrentName = torrent.name;
            const torrentPath = torrent.path || this.getDownloadPath();

            // Destroy WebTorrent handle cleanly so Windows doesn't keep file locks on the downloaded files
            try {
                await new Promise<void>((resolve) => {
                    torrent.destroy({ destroyStore: false }, () => resolve());
                });
            } catch { /* ignore */ }

            if (isGdriveTarget) {
                try {
                    db.prepare(`
                        UPDATE downloads SET status = 'uploading', progress = 0, downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(downloadId);

                    const { organizeDownloadedItem, getFilesRecursive } = await import('./mediaOrganizer');
                    const { isVideoFile } = await import('./mediaNaming');
                    const orgResult = await organizeDownloadedItem(torrentPath, torrentName, { disableAutoOrganizeCheck: false });

                    const { uploadFile, getOrganizedRemotePath } = await import('./gdriveUploader');

                    let filesToUpload: string[] = [];
                    if (orgResult.organizedFiles && orgResult.organizedFiles.length > 0) {
                        filesToUpload = orgResult.organizedFiles;
                    } else {
                        const targetDir = torrentName ? path.join(torrentPath, torrentName) : torrentPath;
                        if (fs.existsSync(targetDir)) {
                            if (fs.statSync(targetDir).isFile()) {
                                filesToUpload = [targetDir];
                            } else {
                                filesToUpload = getFilesRecursive(targetDir).filter(f => isVideoFile(f));
                            }
                        }
                    }

                    if (filesToUpload.length === 0) {
                        db.prepare(`
                            UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
                            downloadedSize = totalSize, completedAt = CURRENT_TIMESTAMP, stateUpdatedAt = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(downloadId);
                        this.triggerRescan();
                        return;
                    }

                    for (let i = 0; i < filesToUpload.length; i++) {
                        const file = filesToUpload[i];
                        let remoteRel = path.relative(torrentPath, file).replace(/\\/g, '/');
                        if (!remoteRel.startsWith('Movies/') && !remoteRel.startsWith('TV Shows/')) {
                            remoteRel = getOrganizedRemotePath(path.basename(file));
                        }

                        await new Promise<void>((resolve) => {
                            const proc = uploadFile(
                                file,
                                remoteRel,
                                (prog) => {
                                    const overallProgress = Math.round(((i + (prog.percent / 100)) / filesToUpload.length) * 100);
                                    try {
                                        db.prepare(`
                                            UPDATE downloads SET progress = ?, lastProgressAt = CURRENT_TIMESTAMP
                                            WHERE id = ? AND status = 'uploading'
                                        `).run(overallProgress, downloadId);
                                    } catch { /* ignore */ }
                                },
                                (success, err) => {
                                    this.gdriveProcesses.delete(downloadId);
                                    if (!success) {
                                        console.error(`[DownloadManager] GDrive upload error for ${file}:`, err);
                                    }
                                    resolve();
                                }
                            );
                            this.gdriveProcesses.set(downloadId, proc);
                        });
                    }

                    // Clean up any remaining empty folders in temp
                    try {
                        const targetDir = torrentName ? path.join(torrentPath, torrentName) : torrentPath;
                        if (fs.existsSync(targetDir) && targetDir !== torrentPath) {
                            fs.rmSync(targetDir, { recursive: true, force: true });
                        }
                    } catch { /* ignore */ }

                    db.prepare(`
                        UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
                        downloadedSize = totalSize, completedAt = CURRENT_TIMESTAMP, stateUpdatedAt = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(downloadId);

                    this.triggerRescan();
                } catch (gdriveErr: any) {
                    console.error('[DownloadManager] GDrive upload processing failed:', gdriveErr);
                    db.prepare(`
                        UPDATE downloads SET status = 'error', errorMessage = ?, stateUpdatedAt = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(gdriveErr?.message || 'Failed to upload to Google Drive', downloadId);
                }
                return;
            }

            try {
                db.prepare(`
            UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
            downloadedSize = totalSize, completedAt = CURRENT_TIMESTAMP, stateUpdatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(downloadId);
            } catch { /* ignore */ }

            // Automatically move TV show video files into TV Shows/<Show Name>/Season <N>/
            // and delete the extra directory that came with torrent download
            try {
                const { organizeDownloadedItem } = await import('./mediaOrganizer');
                await organizeDownloadedItem(torrentPath, torrentName);
            } catch (orgErr) {
                console.warn('[DownloadManager] Auto-organize failed for torrent download:', orgErr);
            }

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
    public async triggerRescan(): Promise<void> {
        try {
            const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
            await fetch(`${baseUrl}/api/rescan`, { method: 'POST' }).catch(() => { });
        } catch { /* ignore */ }
    }
}

// Singleton with globalThis preservation across dev server reloads
const globalForDownloader = globalThis as unknown as {
    downloadManagerInstance?: DownloadManager;
    downloaderStartupDone?: boolean;
};
const downloadManager = globalForDownloader.downloadManagerInstance || new DownloadManager();
if (process.env.NODE_ENV !== 'production') {
    globalForDownloader.downloadManagerInstance = downloadManager;
}

// Auto-recover on module load — only runs once
if (!globalForDownloader.downloaderStartupDone) {
    globalForDownloader.downloaderStartupDone = true;
    setImmediate(async () => {
    try {
        await downloadManager.getClient();
        console.log('[DownloadManager] Running startup recovery...');
        setTimeout(async () => {
            try { await downloadManager.recoverAll(); } catch (e) { console.error('[DownloadManager] Recovery failed:', e); }
            try {
                const { organizeLooseMediaInDownloads } = await import('./mediaOrganizer');
                await organizeLooseMediaInDownloads();
            } catch (e) {
                console.error('[DownloadManager] Startup media organization error:', e);
            }
            try {
                db.prepare('DELETE FROM shows WHERE id NOT IN (SELECT DISTINCT showId FROM episodes)').run();
                const { cleanupOrphanedAutoTracks } = await import('./db');
                cleanupOrphanedAutoTracks();
            } catch (e) {
                console.warn('[DownloadManager] Startup orphan shows cleanup error:', e);
            }
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
}

export default downloadManager;
