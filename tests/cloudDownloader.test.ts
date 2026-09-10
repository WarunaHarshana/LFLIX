import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getCloudConfig,
    getLocalRcloneConfig,
    isCloudDownloaderConfigured,
    checkCloudStatus,
    addCloudDownload,
    syncCloudDownloads,
    cancelCloudDownload,
} from '../lib/cloudDownloader';
import db from '../lib/db';

describe('Cloud Downloader', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('getCloudConfig', () => {
        it('returns structured config with provider and workerUrl', () => {
            const config = getCloudConfig();
            expect(typeof config.enabled).toBe('boolean');
            expect(config.provider).toBe('headless');
            expect(typeof config.workerUrl).toBe('string');
            expect(typeof config.workerToken).toBe('string');
        });
    });

    describe('getLocalRcloneConfig', () => {
        it('reads local rclone config if present or reports found boolean', () => {
            const rclone = getLocalRcloneConfig();
            expect(typeof rclone.found).toBe('boolean');
            if (rclone.found && rclone.base64) {
                expect(rclone.base64.length).toBeGreaterThan(0);
                const decoded = Buffer.from(rclone.base64, 'base64').toString('utf-8');
                expect(decoded).toContain('[');
            }
        });
    });

    describe('isCloudDownloaderConfigured', () => {
        it('returns true only when enabled and workerUrl is set', () => {
            const origEnabled = db.prepare("SELECT value FROM settings WHERE key = 'cloudEnabled'").get() as any;
            const origUrl = db.prepare("SELECT value FROM settings WHERE key = 'cloudWorkerUrl'").get() as any;

            try {
                // Disabled
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudEnabled', 'false')").run();
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', '')").run();
                expect(isCloudDownloaderConfigured()).toBe(false);

                // Enabled with workerUrl
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudEnabled', 'true')").run();
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', 'https://example-worker.hf.space')").run();
                expect(isCloudDownloaderConfigured()).toBe(true);
            } finally {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudEnabled', ?)").run(origEnabled?.value || 'false');
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', ?)").run(origUrl?.value || '');
            }
        });
    });

    describe('checkCloudStatus', () => {
        it('reports not configured if workerUrl is empty', async () => {
            const origUrl = db.prepare("SELECT value FROM settings WHERE key = 'cloudWorkerUrl'").get() as any;
            try {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', '')").run();
                const status = await checkCloudStatus();
                expect(status.online).toBe(false);
                expect(status.message).toContain('not configured');
            } finally {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', ?)").run(origUrl?.value || '');
            }
        });

        it('queries worker health check endpoint when configured', async () => {
            const origUrl = db.prepare("SELECT value FROM settings WHERE key = 'cloudWorkerUrl'").get() as any;
            try {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', 'https://mock-hf-worker.space')").run();

                const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        status: 'online',
                        rclone_configured: true,
                        drive_mounted: true,
                        remote: 'gdrive',
                    }),
                } as any);

                const status = await checkCloudStatus();
                expect(mockFetch).toHaveBeenCalledWith(
                    'https://mock-hf-worker.space/api/health',
                    expect.anything()
                );
                expect(status.online).toBe(true);
                expect(status.rcloneConfigured).toBe(true);
            } finally {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', ?)").run(origUrl?.value || '');
            }
        });
    });

    describe('addCloudDownload', () => {
        it('creates a download record with target = cloud and dispatches to worker', async () => {
            const origUrl = db.prepare("SELECT value FROM settings WHERE key = 'cloudWorkerUrl'").get() as any;
            try {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', 'https://mock-hf-worker.space')").run();

                vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        success: true,
                        job_id: 'hf-job-12345',
                        destination: 'Media/Movies/Inception (2010)/Inception (2010).mkv',
                    }),
                } as any);

                const res = await addCloudDownload({
                    url: 'https://cdn.example.com/inception.mkv',
                    type: 'direct',
                    filename: 'Inception.2010.mkv',
                });

                expect(res.success).toBe(true);
                expect(typeof res.downloadId).toBe('number');
                const dlId = res.downloadId;
                const row = db.prepare('SELECT * FROM downloads WHERE id = ?').get(dlId) as any;
                expect(row).toBeDefined();
                expect(row.target).toBe('cloud');
                expect(row.name).toBe('Inception (2010).mkv');
                expect(row.status).toBe('downloading');

                // Cleanup DB
                db.prepare('DELETE FROM downloads WHERE id = ?').run(dlId);
            } finally {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', ?)").run(origUrl?.value || '');
            }
        });
    });

    describe('syncCloudDownloads', () => {
        it('updates progress and speed for active cloud downloads', async () => {
            const origUrl = db.prepare("SELECT value FROM settings WHERE key = 'cloudWorkerUrl'").get() as any;
            try {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', 'https://mock-hf-worker.space')").run();

                // Create a test cloud download in DB
                const info = db.prepare(`
                    INSERT INTO downloads (magnetUri, name, status, progress, totalSize, downloadedSize, downloadSpeed, target, startedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `).run('http-direct:https://example.com/film.mkv', 'film.mkv', 'downloading', 10, 1000000, 100000, 50000, 'cloud');
                const testId = Number(info.lastInsertRowid);

                vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        downloads: [
                            {
                                id: `job-${testId}`,
                                url: 'https://example.com/film.mkv',
                                filename: 'film.mkv',
                                status: 'downloading',
                                progress: 75.5,
                                download_speed: 10485760, // 10 MB/s
                                total_size: 1000000,
                                downloaded_size: 755000,
                            }
                        ]
                    }),
                } as any);

                await syncCloudDownloads();

                const updated = db.prepare('SELECT * FROM downloads WHERE id = ?').get(testId) as any;
                expect(updated.progress).toBe(75.5);
                expect(updated.downloadSpeed).toBe(10485760);

                // Cleanup
                db.prepare('DELETE FROM downloads WHERE id = ?').run(testId);
            } finally {
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('cloudWorkerUrl', ?)").run(origUrl?.value || '');
            }
        });
    });

    describe('cancelCloudDownload', () => {
        it('sends DELETE to worker when job is mapped or cleans up state', async () => {
            const success = await cancelCloudDownload(999999);
            expect(success).toBe(true);
        });
    });
});
