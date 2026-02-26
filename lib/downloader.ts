/**
 * Download Manager — wraps WebTorrent for torrent downloading
 * Supports: add, remove, pause, resume downloads
 */

import db from './db';
import path from 'path';
import fs from 'fs';

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

    private async getClient(): Promise<any> {
        if (this.client) return this.client;
        const WebTorrent = (await import('webtorrent')).default;
        this.client = new (WebTorrent as any)();
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

        const defaultPath = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(defaultPath)) {
            fs.mkdirSync(defaultPath, { recursive: true });
        }
        return defaultPath;
    }

    // Start a new download
    async addDownload(magnetUri: string, watchlistId?: number, customPath?: string): Promise<DownloadRecord> {
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
            const torrent = client.add(magnetUri, { path: downloadPath });

            torrent.on('metadata', () => {
                try {
                    db.prepare('UPDATE downloads SET name = ?, infoHash = ?, totalSize = ? WHERE id = ?')
                        .run(torrent.name, torrent.infoHash, torrent.length || 0, downloadId);
                } catch { /* ignore */ }
            });

            // Update progress every 2 seconds
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

        } catch (err: any) {
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

        // Pause in WebTorrent
        if (record.infoHash && this.client) {
            const torrent = this.client.get(record.infoHash);
            if (torrent) {
                torrent.pause();
            }
        }

        db.prepare("UPDATE downloads SET status = 'paused', downloadSpeed = 0 WHERE id = ?").run(downloadId);
        return true;
    }

    // Resume a download
    async resumeDownload(downloadId: number): Promise<boolean> {
        const record = this.getDownload(downloadId);
        if (!record || record.status !== 'paused') return false;

        // Check if torrent still exists in client
        if (record.infoHash && this.client) {
            const torrent = this.client.get(record.infoHash);
            if (torrent) {
                torrent.resume();
                // Restart progress timer
                const timer = setInterval(() => {
                    try {
                        const r = this.getDownload(downloadId);
                        if (!r || r.status !== 'downloading') {
                            clearInterval(timer);
                            this.progressTimers.delete(downloadId);
                            return;
                        }
                        db.prepare(`
              UPDATE downloads SET progress = ?, downloadSpeed = ?, downloadedSize = ?
              WHERE id = ? AND status = 'downloading'
            `).run(
                            Math.round(torrent.progress * 10000) / 100,
                            Math.round(torrent.downloadSpeed || 0),
                            torrent.downloaded || 0,
                            downloadId
                        );
                    } catch { /* ignore */ }
                }, 2000);
                this.progressTimers.set(downloadId, timer);
            } else {
                // Torrent was lost, re-add it
                const client = await this.getClient();
                const downloadPath = record.downloadPath || this.getDownloadPath();
                client.add(record.magnetUri, { path: downloadPath });
            }
        }

        db.prepare("UPDATE downloads SET status = 'downloading' WHERE id = ?").run(downloadId);
        return true;
    }

    // Remove/cancel a download
    async removeDownload(downloadId: number, deleteFiles = false): Promise<boolean> {
        const record = this.getDownload(downloadId);
        if (!record) {
            // Even if no record, try to delete from DB
            try { db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId); } catch { /* ignore */ }
            return true;
        }

        // Clear progress timer
        this.clearTimer(downloadId);

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
                } else if (deleteFiles && record.downloadPath && record.name) {
                    // Torrent not in WebTorrent (completed/lost) — manually delete files
                    const filePath = path.join(record.downloadPath, record.name);
                    try {
                        if (fs.existsSync(filePath)) {
                            fs.rmSync(filePath, { recursive: true, force: true });
                        }
                    } catch (e) {
                        console.error('Failed to delete files:', e);
                    }
                }
            } catch {
                // Ignore WebTorrent errors during removal
            }
        } else if (deleteFiles && record.downloadPath && record.name) {
            // No WebTorrent client at all — manually delete
            const filePath = path.join(record.downloadPath, record.name);
            try {
                if (fs.existsSync(filePath)) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                }
            } catch (e) {
                console.error('Failed to delete files:', e);
            }
        }

        // Remove from DB
        try {
            db.prepare('DELETE FROM downloads WHERE id = ?').run(downloadId);
        } catch (e) {
            console.error('Failed to delete download from DB:', e);
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
export default downloadManager;
