/**
 * Download Manager — wraps WebTorrent for torrent downloading
 */

import db from './db';
import path from 'path';
import fs from 'fs';

// WebTorrent types (minimal)
interface WTorrent {
    infoHash: string;
    name: string;
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    length: number;
    downloaded: number;
    done: boolean;
    paused: boolean;
    path: string;
    on(event: string, cb: (...args: any[]) => void): void;
    pause(): void;
    resume(): void;
    destroy(opts?: { destroyStore?: boolean }, cb?: (err?: Error) => void): void;
}

interface WTClient {
    add(magnetUri: string, opts?: any, cb?: (torrent: WTorrent) => void): WTorrent;
    remove(torrentId: string, opts?: { destroyStore?: boolean }, cb?: (err?: Error) => void): void;
    get(torrentId: string): WTorrent | null;
    torrents: WTorrent[];
    destroy(cb?: (err?: Error) => void): void;
}

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
    private client: WTClient | null = null;
    private initialized = false;
    private progressTimers: Map<string, NodeJS.Timeout> = new Map();

    private async getClient(): Promise<WTClient> {
        if (this.client) return this.client;

        // Dynamic import to avoid SSR issues
        const WebTorrent = (await import('webtorrent')).default;
        this.client = new (WebTorrent as any)() as WTClient;
        this.initialized = true;
        return this.client;
    }

    // Get download path from settings or default
    getDownloadPath(): string {
        try {
            const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath') as { value: string } | undefined;
            if (setting?.value && fs.existsSync(setting.value)) {
                return setting.value;
            }
        } catch { /* ignore */ }

        // Default to ./downloads
        const defaultPath = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(defaultPath)) {
            fs.mkdirSync(defaultPath, { recursive: true });
        }
        return defaultPath;
    }

    // Start a new download
    async addDownload(magnetUri: string, watchlistId?: number): Promise<DownloadRecord> {
        const downloadPath = this.getDownloadPath();
        const client = await this.getClient();

        // Insert DB record
        const stmt = db.prepare(`
      INSERT INTO downloads (magnetUri, watchlistId, status, downloadPath)
      VALUES (?, ?, 'downloading', ?)
    `);
        const result = stmt.run(magnetUri, watchlistId || null, downloadPath);
        const downloadId = Number(result.lastInsertRowid);

        try {
            const torrent = client.add(magnetUri, { path: downloadPath });

            torrent.on('metadata', () => {
                db.prepare('UPDATE downloads SET name = ?, infoHash = ?, totalSize = ? WHERE id = ?')
                    .run(torrent.name, torrent.infoHash, torrent.length, downloadId);
            });

            // Update progress every 2 seconds
            const timer = setInterval(() => {
                try {
                    db.prepare(`
            UPDATE downloads SET progress = ?, downloadSpeed = ?, downloadedSize = ?, totalSize = ?
            WHERE id = ? AND status = 'downloading'
          `).run(
                        Math.round(torrent.progress * 10000) / 100, // 2 decimal places
                        Math.round(torrent.downloadSpeed),
                        torrent.downloaded,
                        torrent.length,
                        downloadId
                    );
                } catch { /* ignore */ }
            }, 2000);
            this.progressTimers.set(String(downloadId), timer);

            torrent.on('done', () => {
                clearInterval(timer);
                this.progressTimers.delete(String(downloadId));

                db.prepare(`
          UPDATE downloads SET status = 'completed', progress = 100, downloadSpeed = 0,
          downloadedSize = totalSize, completedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(downloadId);

                // Trigger library rescan after download completes
                this.triggerRescan();
            });

            torrent.on('error', (err: Error) => {
                clearInterval(timer);
                this.progressTimers.delete(String(downloadId));

                db.prepare(`
          UPDATE downloads SET status = 'error', errorMessage = ?, downloadSpeed = 0
          WHERE id = ?
        `).run(err.message, downloadId);
            });

        } catch (err: any) {
            db.prepare('UPDATE downloads SET status = ?, errorMessage = ? WHERE id = ?')
                .run('error', err.message, downloadId);
        }

        return this.getDownload(downloadId)!;
    }

    // Remove/cancel a download
    async removeDownload(downloadId: number, deleteFiles = false): Promise<void> {
        const record = this.getDownload(downloadId);
        if (!record) return;

        // Clear progress timer
        const timer = this.progressTimers.get(String(downloadId));
        if (timer) {
            clearInterval(timer);
            this.progressTimers.delete(String(downloadId));
        }

        // Remove from WebTorrent if active
        if (record.infoHash && this.client) {
            const torrent = this.client.get(record.infoHash);
            if (torrent) {
                await new Promise<void>((resolve) => {
                    torrent.destroy({ destroyStore: deleteFiles }, () => resolve());
                });
            }
        }

        // Remove from DB
        db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
    }

    // Get all downloads
    getAll(): DownloadRecord[] {
        return db.prepare('SELECT * FROM downloads ORDER BY startedAt DESC').all() as DownloadRecord[];
    }

    // Get single download
    getDownload(id: number): DownloadRecord | null {
        return (db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as DownloadRecord) || null;
    }

    // Get active download count
    getActiveCount(): number {
        const result = db.prepare("SELECT COUNT(*) as count FROM downloads WHERE status = 'downloading'").get() as { count: number };
        return result?.count || 0;
    }

    // Trigger library rescan
    private async triggerRescan(): Promise<void> {
        try {
            // Use internal fetch to trigger rescan
            const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
            await fetch(`${baseUrl}/api/rescan`, { method: 'POST' }).catch(() => { });
        } catch {
            // Ignore — rescan is best-effort
        }
    }
}

// Singleton instance
const downloadManager = new DownloadManager();
export default downloadManager;
