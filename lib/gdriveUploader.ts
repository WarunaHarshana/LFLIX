/**
 * Google Drive Uploader — wraps rclone commands for direct Google Drive uploads
 *
 * Supports:
 *   - Stream URL directly to GDrive (rclone copyurl) — zero local disk
 *   - Upload local file to GDrive (rclone moveto) — deletes local after
 *   - Create folders on GDrive (rclone mkdir)
 *   - Test connection (rclone lsd)
 *   - Mount/unmount Google Drive (rclone mount)
 *   - Progress tracking via rclone stats output
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from './db';
import { detectTvShow } from './mediaNaming';
import { extractYear, cleanFilename } from './metadata';

/**
 * Get available free space on a local directory path in bytes.
 */
export function getFreeSpaceBytes(dirPath: string): number {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        const stats = fs.statfsSync(dirPath);
        return Number(stats.bavail) * Number(stats.bsize);
    } catch {
        return 0;
    }
}

/**
 * Clean rclone stderr error message into a concise human-readable error.
 */
export function extractCleanErrorMessage(rawError: string): string {
    if (!rawError) return 'Google Drive upload failed';
    if (
        rawError.includes('RATE_LIMIT_EXCEEDED') ||
        rawError.includes('rateLimitExceeded') ||
        rawError.includes("quota metric 'Queries'") ||
        rawError.includes('Requests per minute') ||
        rawError.includes('403')
    ) {
        return 'Google Drive API rate limit exceeded (shared rclone client ID quota). Consider adding your own Google Drive Client ID in rclone.';
    }
    if (rawError.includes('storageQuotaExceeded') || rawError.includes('User rate limit exceeded')) {
        return 'Google Drive storage quota exceeded.';
    }
    if (rawError.includes('insufficientFilePermissions') || rawError.includes('Permission denied')) {
        return 'Google Drive permission denied. Please re-authenticate rclone.';
    }
    const lines = rawError
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.includes('INFO  :') && !l.includes('Transferred:') && !l.includes('ETA '));
    const errorLine = lines.find(l => l.includes('ERROR') || l.includes('Failed') || l.includes('Fatal') || l.includes('googleapi:'));
    if (errorLine) {
        return errorLine.replace(/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+(ERROR|NOTICE|Fatal):\s*/, '').trim();
    }
    return lines[lines.length - 1] || 'Google Drive upload failed';
}


// ── Types ───────────────────────────────────────────────────────────────────

export interface GdriveConfig {
    enabled: boolean;
    remote: string;       // rclone remote name (default: 'gdrive')
    basePath: string;     // base path on remote (default: 'Media')
    tempPath: string;     // local temp dir for torrent assembly
    mountPath: string;    // local mount point (e.g. 'Z:\Media')
    mountDrive: string;   // drive letter for rclone mount (e.g. 'Z:')
}

export interface GdriveStatus {
    configured: boolean;
    rcloneInstalled: boolean;
    remoteExists: boolean;
    connected: boolean;
    mounted: boolean;
    mountPath: string;
    remote: string;
    basePath: string;
}

export interface UploadProgress {
    percent: number;
    speed: string;
    eta: string;
    transferred: string;
}

type ProgressCallback = (progress: UploadProgress) => void;

// ── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: GdriveConfig = {
    enabled: false,
    remote: 'gdrive',
    basePath: 'Media',
    tempPath: 'D:\\LFLIX-Temp',
    mountPath: 'Z:\\Media',
    mountDrive: 'Z:',
};

export function getGdriveConfig(): GdriveConfig {
    const config = { ...DEFAULT_CONFIG };
    let explicitEnabled: boolean | null = null;
    try {
        const rows = db.prepare(
            `SELECT key, value FROM settings WHERE key IN ('gdriveEnabled', 'gdriveRemote', 'gdriveBasePath', 'gdriveTempPath', 'gdriveMountPath', 'gdriveMountDrive')`
        ).all() as { key: string; value: string }[];

        for (const row of rows) {
            switch (row.key) {
                case 'gdriveEnabled': explicitEnabled = row.value === 'true'; break;
                case 'gdriveRemote': config.remote = row.value; break;
                case 'gdriveBasePath': config.basePath = row.value; break;
                case 'gdriveTempPath': config.tempPath = row.value; break;
                case 'gdriveMountPath': config.mountPath = row.value; break;
                case 'gdriveMountDrive': config.mountDrive = row.value; break;
            }
        }
    } catch { /* ignore */ }

    if (explicitEnabled !== null) {
        config.enabled = explicitEnabled;
    } else {
        // Auto-enable if rclone remote exists
        config.enabled = isRcloneInstalled() && remoteExists(config.remote);
    }
    return config;
}

// ── Rclone Helpers ──────────────────────────────────────────────────────────

function isRcloneInstalled(): boolean {
    try {
        execSync('rclone version', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

function remoteExists(remoteName: string): boolean {
    try {
        const output = execSync('rclone listremotes', { stdio: 'pipe', timeout: 5000 }).toString();
        return output.includes(`${remoteName}:`);
    } catch {
        return false;
    }
}

function isMounted(mountDrive: string): boolean {
    try {
        const driveLetter = mountDrive.replace(/[:\\\/]+$/, '');
        execSync(`vol ${driveLetter}: 2>nul`, { stdio: 'pipe', timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}

function parseProgressLine(line: string): UploadProgress | null {
    // rclone --stats-one-line output format:
    // Transferred:   1.234 GiB / 4.567 GiB, 27%, 15.678 MiB/s, ETA 3m30s
    const statsMatch = line.match(
        /Transferred:\s*([\d.]+\s*\w+)\s*\/\s*([\d.]+\s*\w+),\s*([\d.]+)%,\s*([\d.]+\s*\w+\/s),\s*ETA\s*(.+)/i
    );
    if (statsMatch) {
        return {
            percent: parseFloat(statsMatch[3]),
            speed: statsMatch[4],
            eta: statsMatch[5].trim(),
            transferred: `${statsMatch[1]} / ${statsMatch[2]}`,
        };
    }

    // Individual file progress line: e.g. "* ...:  78% /10.040Gi, 3.842Mi/s, 5m10s"
    const fileMatch = line.match(
        /\*\s*.*?:\s*([\d.]+)%\s*\/([\d.]+\s*\w+),\s*([\d.]+\s*\w+\/s),\s*(.+)/i
    );
    if (fileMatch) {
        return {
            percent: parseFloat(fileMatch[1]),
            speed: fileMatch[3],
            eta: fileMatch[4].trim(),
            transferred: fileMatch[2],
        };
    }

    // Generic transferred percentage: e.g. "Transferred: ... 78%"
    const transferredMatch = line.match(/Transferred:.*?([\d.]+)%/i);
    if (transferredMatch) {
        return {
            percent: parseFloat(transferredMatch[1]),
            speed: '',
            eta: '',
            transferred: '',
        };
    }

    return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the current status of Google Drive integration.
 */
export async function getStatus(): Promise<GdriveStatus> {
    const config = getGdriveConfig();
    const rcloneOk = isRcloneInstalled();
    const remoteOk = rcloneOk ? remoteExists(config.remote) : false;
    const mounted = isMounted(config.mountDrive);

    let connected = mounted;
    if (!connected && remoteOk) {
        try {
            execSync(`rclone lsd "${config.remote}:" --max-depth 0`, { stdio: 'pipe', timeout: 25000 });
            connected = true;
        } catch { /* ignore */ }
    }

    return {
        configured: config.enabled && rcloneOk && remoteOk,
        rcloneInstalled: rcloneOk,
        remoteExists: remoteOk,
        connected,
        mounted,
        mountPath: config.mountPath,
        remote: config.remote,
        basePath: config.basePath,
    };
}

/**
 * Test connection to Google Drive remote.
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
    const config = getGdriveConfig();

    if (!isRcloneInstalled()) {
        return { success: false, message: 'rclone is not installed. Download from https://rclone.org/downloads/' };
    }
    if (!remoteExists(config.remote)) {
        return { success: false, message: `Rclone remote "${config.remote}" not found. Run "rclone config" to set up your Google Drive remote.` };
    }

    try {
        execSync(`rclone lsd "${config.remote}:" --max-depth 0`, { stdio: 'pipe', timeout: 15000 });
        return { success: true, message: `Connected to Google Drive via remote "${config.remote}"` };
    } catch (err: any) {
        return { success: false, message: `Connection failed: ${err.message || 'Unknown error'}` };
    }
}

/**
 * Create the base folder structure on Google Drive.
 */
export async function setupFolders(): Promise<{ success: boolean; message: string }> {
    const config = getGdriveConfig();
    const remotePath = (p: string) => `${config.remote}:${config.basePath}/${p}`;

    try {
        execSync(`rclone mkdir "${remotePath('Movies')}"`, { stdio: 'pipe', timeout: 15000 });
        execSync(`rclone mkdir "${remotePath('TV Shows')}"`, { stdio: 'pipe', timeout: 15000 });
        return { success: true, message: 'Created Movies and TV Shows folders on Google Drive' };
    } catch (err: any) {
        return { success: false, message: `Failed to create folders: ${err.message || 'Unknown error'}` };
    }
}

/**
 * Determine the organized remote path for a media file based on its filename.
 *
 * Returns a path like:
 *   Movies/Inception (2010)/Inception (2010).mkv
 *   TV Shows/Breaking Bad/Season 1/Breaking.Bad.S01E01.mkv
 */
export function getOrganizedRemotePath(filename: string, mediaType?: 'movie' | 'tv'): string {
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);

    // Try TV show detection
    const tvInfo = detectTvShow(filename);
    if (tvInfo || mediaType === 'tv') {
        if (tvInfo) {
            const showName = tvInfo.name.replace(/[._]/g, ' ').trim();
            const seasonPad = tvInfo.season.toString().padStart(2, '0');
            return `TV Shows/${showName}/Season ${seasonPad}/${filename}`;
        }
        // Fallback for TV without detected episode info
        return `TV Shows/${filename}`;
    }

    // Movie detection
    const year = extractYear(filename);
    const clean = cleanFilename(filename);
    if (clean) {
        const folderName = year ? `${clean} (${year})` : clean;
        const targetFilename = year ? `${clean} (${year})${ext}` : `${clean}${ext}`;
        return `Movies/${folderName}/${targetFilename}`;
    }

    // Fallback: just put in Movies root with original name
    const cleanTitle = baseName.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
    return `Movies/${cleanTitle}/${filename}`;
}

// Flags to optimize Google Drive transfers and prevent 403 API rate limit errors
const GDRIVE_TRANSFER_FLAGS = [
    '--drive-chunk-size', '64M',
    '--drive-upload-cutoff', '64M',
    '--drive-pacer-min-sleep', '100ms',
    '--drive-pacer-burst', '10',
    '--tpslimit', '8',
    '--retries', '8',
    '--retries-sleep', '10s',
    '--low-level-retries', '20',
];

/**
 * Stream a URL directly to Google Drive via rclone copyurl.
 * Zero local disk usage — the file goes straight from the source to GDrive.
 *
 * Returns a ChildProcess so the caller can track/kill the operation.
 */
export function uploadUrl(
    sourceUrl: string,
    destPath: string,
    onProgress?: ProgressCallback,
    onComplete?: (success: boolean, error?: string) => void,
): ChildProcess {
    const config = getGdriveConfig();
    const remoteDest = `${config.remote}:${config.basePath}/${destPath}`;

    // Ensure parent directory exists
    const parentDir = path.dirname(destPath);
    try {
        execSync(`rclone mkdir "${config.remote}:${config.basePath}/${parentDir}"`, { stdio: 'pipe', timeout: 10000 });
    } catch { /* ignore — rclone copyurl creates dirs */ }

    console.log(`[GDrive] Streaming URL to: ${remoteDest}`);
    console.log(`[GDrive] Source: ${sourceUrl.substring(0, 100)}...`);

    const proc = spawn('rclone', [
        'copyurl',
        sourceUrl,
        remoteDest,
        '--stats', '2s',
        '--stats-one-line',
        ...GDRIVE_TRANSFER_FLAGS,
        '-v',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let lastError = '';

    proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            const progress = parseProgressLine(line);
            if (progress && onProgress) {
                onProgress(progress);
            }
        }
    });

    proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (/error|failed|fatal|googleapi|ratelimit|quota|denied/i.test(text)) {
            lastError = text.trim();
        }
        // rclone outputs progress to stderr with -v
        const lines = text.split('\n');
        for (const line of lines) {
            const progress = parseProgressLine(line);
            if (progress && onProgress) {
                onProgress(progress);
            }
        }
    });

    proc.on('close', (code) => {
        if (onComplete) {
            if (code === 0) {
                console.log(`[GDrive] Upload complete: ${remoteDest}`);
                onComplete(true);
            } else {
                const cleanError = extractCleanErrorMessage(lastError) || `rclone exited with code ${code}`;
                console.error(`[GDrive] Upload failed (code ${code}): ${cleanError}`);
                onComplete(false, cleanError);
            }
        }
    });

    return proc;
}

/**
 * Upload a local file to Google Drive and delete the local copy.
 * Used after torrent downloads complete.
 */
export function uploadFile(
    localPath: string,
    destPath: string,
    onProgress?: ProgressCallback,
    onComplete?: (success: boolean, error?: string) => void,
): ChildProcess {
    const config = getGdriveConfig();
    const remoteDest = `${config.remote}:${config.basePath}/${destPath}`;

    // Ensure parent directory exists
    const parentDir = path.dirname(destPath);
    try {
        execSync(`rclone mkdir "${config.remote}:${config.basePath}/${parentDir}"`, { stdio: 'pipe', timeout: 10000 });
    } catch { /* ignore */ }

    console.log(`[GDrive] Uploading file: ${localPath}`);
    console.log(`[GDrive]   → ${remoteDest}`);

    const proc = spawn('rclone', [
        'moveto',
        localPath,
        remoteDest,
        '--stats', '2s',
        '--stats-one-line',
        ...GDRIVE_TRANSFER_FLAGS,
        '-P',
        '-v',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let lastError = '';

    proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            const progress = parseProgressLine(line);
            if (progress && onProgress) {
                onProgress(progress);
            }
        }
    });

    proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (/error|failed|fatal|googleapi|ratelimit|quota|denied/i.test(text)) {
            lastError = text.trim();
        }
        const lines = text.split('\n');
        for (const line of lines) {
            const progress = parseProgressLine(line);
            if (progress && onProgress) {
                onProgress(progress);
            }
        }
    });

    proc.on('close', (code) => {
        if (onComplete) {
            if (code === 0) {
                console.log(`[GDrive] Upload complete: ${remoteDest}`);
                onComplete(true);
            } else {
                const cleanError = extractCleanErrorMessage(lastError) || `rclone exited with code ${code}`;
                console.error(`[GDrive] Upload failed (code ${code}): ${cleanError}`);
                onComplete(false, cleanError);
            }
        }
    });

    return proc;
}

/**
 * Mount Google Drive using rclone with optimized streaming flags.
 * Returns the child process (long-running daemon).
 */
export function mountDrive(
    onReady?: () => void,
    onError?: (error: string) => void,
): ChildProcess | null {
    const config = getGdriveConfig();

    if (!isRcloneInstalled()) {
        onError?.('rclone is not installed');
        return null;
    }
    if (!remoteExists(config.remote)) {
        onError?.(`Remote "${config.remote}" not found`);
        return null;
    }
    if (isMounted(config.mountDrive)) {
        onReady?.();
        return null;
    }

    console.log(`[GDrive] Mounting ${config.remote}: → ${config.mountDrive}`);

    const proc = spawn('rclone', [
        'mount',
        `${config.remote}:`,
        config.mountDrive,
        '--vfs-cache-mode', 'full',
        '--vfs-cache-max-size', '20G',
        '--vfs-cache-max-age', '24h',
        '--vfs-read-chunk-size', '64M',
        '--vfs-read-chunk-size-limit', '2G',
        '--buffer-size', '64M',
        '--dir-cache-time', '72h',
        '--poll-interval', '15s',
        '--log-level', 'NOTICE',
        '--volname', 'Google Drive',
    ], { stdio: ['pipe', 'pipe', 'pipe'], detached: true });

    let started = false;

    proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (!started && (text.includes('vfs cache') || text.includes('Mounting'))) {
            started = true;
            // Give mount a moment to be ready
            setTimeout(() => onReady?.(), 2000);
        }
        if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fatal')) {
            onError?.(text.trim());
        }
    });

    proc.on('error', (err) => {
        onError?.(err.message);
    });

    // Check if mount is ready after a few seconds
    setTimeout(() => {
        if (!started && isMounted(config.mountDrive)) {
            started = true;
            onReady?.();
        } else if (!started) {
            // Still check once more after a delay
            setTimeout(() => {
                if (isMounted(config.mountDrive)) {
                    onReady?.();
                }
            }, 3000);
        }
    }, 3000);

    proc.unref();
    return proc;
}

/**
 * Unmount Google Drive.
 */
export function unmountDrive(): { success: boolean; message: string } {
    const config = getGdriveConfig();

    try {
        // On Windows, use taskkill to stop the rclone mount process
        execSync(`taskkill /f /im rclone.exe /fi "WINDOWTITLE eq ${config.mountDrive}"`, {
            stdio: 'pipe',
            timeout: 5000,
        });
    } catch { /* ignore — process might not exist */ }

    // Also try the rclone rc method
    try {
        execSync('rclone rc mount/unmountall', { stdio: 'pipe', timeout: 5000 });
    } catch { /* ignore */ }

    // Verify
    setTimeout(() => { /* give it a moment */ }, 1000);

    return { success: true, message: `Unmounting ${config.mountDrive}` };
}

/**
 * Get Google Drive usage/quota info.
 */
export async function getDriveUsage(): Promise<{ used: string; total: string; free: string } | null> {
    const config = getGdriveConfig();
    try {
        const output = execSync(`rclone about "${config.remote}:" --json`, { stdio: 'pipe', timeout: 15000 }).toString();
        const info = JSON.parse(output);
        const format = (bytes: number) => {
            if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
            if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
            return `${(bytes / 1e6).toFixed(1)} MB`;
        };
        return {
            used: format(info.used || 0),
            total: format(info.total || 0),
            free: format(info.free || 0),
        };
    } catch {
        return null;
    }
}
