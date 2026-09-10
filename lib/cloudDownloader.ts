/**
 * Cloud Downloader — Manages remote server-to-server downloads into Google Drive
 *
 * Transfers direct video links and torrents via a Headless Cloud Container
 * (e.g. Hugging Face Spaces Docker worker) straight into Google Drive.
 * Client PC uses 0 bytes of disk space and 0 bytes of download/upload bandwidth.
 */

import path from 'path';
import fs from 'fs';
import db from './db';
import { getOrganizedRemotePath, getGdriveConfig } from './gdriveUploader';

export interface CloudConfig {
    enabled: boolean;
    provider: 'headless';
    workerUrl: string;
    workerToken: string;
}

export interface CloudStatus {
    configured: boolean;
    online: boolean;
    workerType: string;
    driveMounted: boolean;
    rcloneConfigured: boolean;
    freeSpaceBytes: number;
    workerUrl: string;
    message?: string;
}

export interface CloudJobProgress {
    id: string;
    status: 'queued' | 'downloading' | 'completed' | 'error' | 'cancelled';
    progress: number;
    downloadSpeed: number;
    speedStr: string;
    transferredStr: string;
    etaStr: string;
    errorMessage?: string;
}

export function getCloudConfig(): CloudConfig {
    const keys = ['cloudEnabled', 'cloudWorkerUrl', 'cloudWorkerToken'];
    const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys) as { key: string; value: string }[];
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return {
        enabled: map.cloudEnabled === 'true',
        provider: 'headless',
        workerUrl: (map.cloudWorkerUrl || '').replace(/\/+$/, ''),
        workerToken: map.cloudWorkerToken || '',
    };
}

export function isCloudDownloaderConfigured(): boolean {
    const config = getCloudConfig();
    return Boolean(config.enabled && config.workerUrl);
}

let syncTimer: NodeJS.Timeout | null = null;
const cloudJobMap = new Map<number, string>(); // downloadId -> remoteJobId

/**
 * Check if the remote cloud worker or service is online and healthy.
 */
/**
 * Read the local rclone.conf file and return base64 encoded string for Space Secret setup.
 */
export function getLocalRcloneConfig(): { found: boolean; configText?: string; base64?: string; path?: string } {
    const candidates = [
        path.join(process.env.APPDATA || '', 'rclone', 'rclone.conf'),
        path.join(process.env.USERPROFILE || '', '.config', 'rclone', 'rclone.conf'),
        path.join(process.env.HOME || '', '.config', 'rclone', 'rclone.conf'),
    ];

    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            try {
                const text = fs.readFileSync(c, 'utf8');
                const base64 = Buffer.from(text, 'utf8').toString('base64');
                return { found: true, configText: text, base64, path: c };
            } catch { /* ignore */ }
        }
    }
    return { found: false };
}

export async function checkCloudStatus(overrideUrl?: string): Promise<CloudStatus> {
    const config = getCloudConfig();
    const url = (overrideUrl || config.workerUrl).replace(/\/+$/, '');

    if (!url) {
        return {
            configured: false,
            online: false,
            workerType: config.provider,
            driveMounted: false,
            rcloneConfigured: false,
            freeSpaceBytes: 0,
            workerUrl: '',
            message: 'Cloud Worker URL is not configured. Deploy your Space and paste the URL in Settings.',
        };
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35000);

        const headers: Record<string, string> = {};
        if (config.workerToken) {
            headers['Authorization'] = `Bearer ${config.workerToken}`;
            headers['X-API-Key'] = config.workerToken;
        }

        const res = await fetch(`${url}/api/health`, {
            headers,
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
            return {
                configured: true,
                online: false,
                workerType: config.provider,
                driveMounted: false,
                rcloneConfigured: false,
                freeSpaceBytes: 0,
                workerUrl: url,
                message: `Cloud Worker returned HTTP ${res.status}`,
            };
        }

        const data = await res.json();
        const rcloneOk = Boolean(data.rclone_configured || data.drive_mounted);
        let msg = 'Cloud Worker is online and connected.';
        if (data.rclone_configured) {
            msg = `Cloud Worker is online. Google Drive remote "${data.remote || 'gdrive'}" is authenticated.`;
        } else if (data.status === 'online' && !rcloneOk) {
            msg = 'Cloud Worker is online, but RCLONE_CONFIG_BASE64 secret is missing in Space settings.';
        }

        return {
            configured: true,
            online: data.status === 'online',
            workerType: data.worker || config.provider,
            driveMounted: Boolean(data.drive_mounted),
            rcloneConfigured: rcloneOk,
            freeSpaceBytes: Number(data.free_space_bytes || 0),
            workerUrl: url,
            message: msg,
        };
    } catch (err: any) {
        return {
            configured: true,
            online: false,
            workerType: config.provider,
            driveMounted: false,
            rcloneConfigured: false,
            freeSpaceBytes: 0,
            workerUrl: url,
            message: err.name === 'AbortError' ? 'Connection timed out' : `Connection failed: ${err.message}`,
        };
    }
}

/**
 * Send a download request (torrent or direct HTTP URL) to the cloud worker.
 */
export async function addCloudDownload(params: {
    url: string;
    type: 'direct' | 'torrent';
    filename?: string;
    mediaType?: 'movie' | 'tv';
    watchlistId?: number;
}): Promise<{ success: boolean; downloadId?: number; error?: string }> {
    const config = getCloudConfig();
    if (!config.workerUrl) {
        return { success: false, error: 'Cloud Worker URL not configured in Settings' };
    }

    const filename = params.filename || `download_${Date.now()}.mkv`;
    const remoteDest = getOrganizedRemotePath(filename, params.mediaType);
    const destFolder = path.dirname(remoteDest).replace(/\\/g, '/');
    const destFilename = path.basename(remoteDest);

    const gdriveConfig = getGdriveConfig();
    const mountedPath = path.join(gdriveConfig.mountPath, remoteDest);
    const magnetUriStored = params.type === 'direct' ? `http-direct:${params.url}` : params.url;

    // Create DB download record with target = 'cloud'
    const stmt = db.prepare(`
        INSERT INTO downloads (magnetUri, name, watchlistId, status, downloadPath, retryCount, lastProgressAt, stateUpdatedAt, target)
        VALUES (?, ?, ?, 'downloading', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'cloud')
    `);
    const result = stmt.run(magnetUriStored, destFilename, params.watchlistId || null, mountedPath);
    const downloadId = Number(result.lastInsertRowid);

    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.workerToken) {
            headers['Authorization'] = `Bearer ${config.workerToken}`;
            headers['X-API-Key'] = config.workerToken;
        }

        const res = await fetch(`${config.workerUrl}/api/download`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                url: params.url,
                type: params.type,
                dest_path: `Media/${destFolder}`,
                filename: destFilename,
                media_type: params.mediaType || 'movie',
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Worker returned HTTP ${res.status}: ${errText}`);
        }

        const data = await res.json();
        if (data.job_id) {
            cloudJobMap.set(downloadId, data.job_id);
        }

        // Start progress polling loop if not running
        ensureCloudSyncRunning();

        return { success: true, downloadId };
    } catch (err: any) {
        db.prepare(`
            UPDATE downloads
            SET status = 'error', errorMessage = ?, downloadSpeed = 0, stateUpdatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(err.message || 'Failed to dispatch to Cloud Worker', downloadId);

        return { success: false, downloadId, error: err.message };
    }
}

/**
 * Poll cloud worker for all active downloads and synchronize status to SQLite.
 */
export async function syncCloudDownloads(): Promise<void> {
    const config = getCloudConfig();
    if (!config.workerUrl) return;

    // Find all in-flight cloud downloads
    const activeDownloads = db.prepare(`
        SELECT id, name, magnetUri, target
        FROM downloads
        WHERE target = 'cloud' AND status IN ('downloading', 'metadata')
    `).all() as { id: number; name: string; magnetUri: string; target: string }[];

    if (activeDownloads.length === 0) {
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
        return;
    }

    try {
        const headers: Record<string, string> = {};
        if (config.workerToken) {
            headers['Authorization'] = `Bearer ${config.workerToken}`;
            headers['X-API-Key'] = config.workerToken;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${config.workerUrl}/api/downloads`, { headers, signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) return;
        const data = await res.json();
        const remoteJobs: any[] = data.downloads || [];

        for (const dl of activeDownloads) {
            // Find remote job by mapped ID or URL/filename match
            const mappedJobId = cloudJobMap.get(dl.id);
            const rawUrl = dl.magnetUri.replace('http-direct:', '');
            const job = remoteJobs.find(j => j.id === mappedJobId || j.url === rawUrl || j.filename === dl.name);

            if (!job) continue;

            if (job.status === 'completed') {
                db.prepare(`
                    UPDATE downloads
                    SET status = 'completed', progress = 100, downloadSpeed = 0,
                        completedAt = CURRENT_TIMESTAMP, stateUpdatedAt = CURRENT_TIMESTAMP,
                        lastProgressAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(dl.id);
                cloudJobMap.delete(dl.id);

                // Trigger library rescan
                try {
                    const { default: downloadManager } = await import('./downloader');
                    downloadManager.triggerRescan();
                } catch { /* ignore */ }
            } else if (job.status === 'error') {
                db.prepare(`
                    UPDATE downloads
                    SET status = 'error', errorMessage = ?, downloadSpeed = 0,
                        stateUpdatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(job.error_message || 'Cloud download failed', dl.id);
                cloudJobMap.delete(dl.id);
            } else if (job.status === 'cancelled') {
                db.prepare(`
                    UPDATE downloads
                    SET status = 'error', errorMessage = 'Cancelled by user', downloadSpeed = 0,
                        stateUpdatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(dl.id);
                cloudJobMap.delete(dl.id);
            } else {
                // In progress
                db.prepare(`
                    UPDATE downloads
                    SET progress = ?,
                        downloadSpeed = ?,
                        lastProgressAt = CURRENT_TIMESTAMP
                    WHERE id = ? AND status = 'downloading'
                `).run(job.progress || 0, job.download_speed || 0, dl.id);
            }
        }
    } catch {
        // Worker might be temporarily busy or unreachable; skip cycle
    }
}

/**
 * Ensure the periodic sync timer is running.
 */
export function ensureCloudSyncRunning(): void {
    if (syncTimer) return;
    syncTimer = setInterval(() => {
        syncCloudDownloads().catch(() => {});
    }, 2500);
}

/**
 * Cancel an active cloud download on the worker.
 */
export async function cancelCloudDownload(downloadId: number): Promise<boolean> {
    const config = getCloudConfig();
    const mappedJobId = cloudJobMap.get(downloadId);

    if (config.workerUrl && mappedJobId) {
        try {
            await fetch(`${config.workerUrl}/api/downloads/${mappedJobId}`, {
                method: 'DELETE',
            });
        } catch { /* ignore */ }
    }
    cloudJobMap.delete(downloadId);
    return true;
}
