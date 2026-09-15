/**
 * Aria2 Downloader — high-performance multi-connection download wrapper
 *
 * Supports:
 *   - Up to 16 parallel connections per download for maximum bandwidth
 *   - Native resume of interrupted downloads (-c)
 *   - Fast zero-allocation startup (--file-allocation=none)
 *   - Real-time progress, speed, and ETA tracking via summary output
 *   - Graceful fallback when aria2c is not available
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { probeDirectDownloadUrl } from './directDownloadHealth';

export interface Aria2Progress {
    percent: number;
    downloadedBytes: number;
    totalBytes: number;
    speedBytes: number;
    eta?: string;
}

export interface StartAria2Options {
    url: string;
    downloadDir: string;
    filename: string;
    maxConnections?: number;
    referer?: string;
    onProgress?: (progress: Aria2Progress) => void;
    onComplete?: (success: boolean, error?: string) => void;
}

/**
 * Locate the aria2c binary (checks bundled bin/aria2c.exe first, then system PATH).
 */
export function getAria2BinaryPath(): string | null {
    // 1. Check bundled bin folder
    const localBin = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'aria2c.exe' : 'aria2c');
    if (fs.existsSync(localBin)) {
        return localBin;
    }

    // 2. Check system PATH
    try {
        const cmd = process.platform === 'win32' ? 'where.exe aria2c' : 'which aria2c';
        const stdout = execSync(cmd, { stdio: 'pipe', timeout: 3000 }).toString().trim();
        const firstPath = stdout.split(/\r?\n/)[0]?.trim();
        if (firstPath && fs.existsSync(firstPath)) {
            return firstPath;
        }
    } catch { /* ignore */ }

    // 3. Fallback for Windows WinGet standard install path
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA;
        if (localAppData) {
            const wingetPath = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'aria2c.exe');
            if (fs.existsSync(wingetPath)) {
                return wingetPath;
            }
        }
    }

    return null;
}

/**
 * Check if aria2c is installed and operational.
 */
export function isAria2Available(): boolean {
    const bin = getAria2BinaryPath();
    if (!bin) return false;
    try {
        execSync(`"${bin}" -v`, { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Parse raw byte strings from aria2 (e.g. '176KiB', '10MiB', '1.5GiB', '0B') into numbers.
 */
export function parseAria2Bytes(str: string): number {
    if (!str || str === '0B' || str === '0') return 0;
    const match = str.match(/([\d.]+)\s*([A-Za-z]+)/);
    if (!match) return 0;

    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase().replace('IB', 'B');
    const mults: Record<string, number> = {
        B: 1,
        KB: 1024,
        MB: 1024 ** 2,
        GB: 1024 ** 3,
        TB: 1024 ** 4,
    };
    return Math.round(val * (mults[unit] || 1));
}

/**
 * Parse a summary progress line from aria2 output.
 * Format: [#420090 3.2MiB/10MiB(32%) CN:1 DL:1.5MiB ETA:4s]
 */
export function parseAria2ProgressLine(line: string): Aria2Progress | null {
    const regex = /\[#\w+\s+([\d.]+\w+)\/([\d.]+\w+)(?:\((\d+)%\))?\s+CN:\d+\s+DL:([\d.]+\w+)(?:\s+ETA:(\w+))?\]/;
    const match = line.match(regex);
    if (!match) return null;

    const downloadedBytes = parseAria2Bytes(match[1]);
    const totalBytes = parseAria2Bytes(match[2]);
    let percent = match[3] ? parseFloat(match[3]) : 0;
    if (!match[3] && totalBytes > 0) {
        percent = Math.round((downloadedBytes / totalBytes) * 1000) / 10;
    }
    const speedBytes = parseAria2Bytes(match[4]);
    const eta = match[5];

    return {
        percent,
        downloadedBytes,
        totalBytes,
        speedBytes,
        eta,
    };
}

/**
 * Start a high-speed download with aria2c.
 */
export function startAria2Download(options: StartAria2Options): ChildProcess {
    const bin = getAria2BinaryPath();
    if (!bin) {
        throw new Error('aria2c executable not found on system');
    }

    const {
        url,
        downloadDir,
        filename,
        maxConnections = 16,
        referer = 'https://cinejoy.to/',
        onProgress,
        onComplete,
    } = options;

    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    const connections = String(Math.min(Math.max(maxConnections, 1), 16));

    const args = [
        '--async-dns=false',
        '-x', connections,
        '-s', connections,
        '-j', connections,
        '-k', '1M',
        '-c',
        '--file-allocation=none',
        '--summary-interval=1',
        '-d', downloadDir,
        '-o', filename,
        '--auto-file-renaming=false',
        '--allow-overwrite=true',
        '--max-tries=5',
        '--retry-wait=2',
        '--timeout=30',
        '--connect-timeout=15',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        `--header=Referer: ${referer}`,
        url,
    ];

    console.log(`[Aria2] Starting fast multi-connection download: ${filename} (${connections} connections)`);

    const proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let lastError = '';

    const handleChunk = (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        for (const line of lines) {
            if (line.includes('[ERROR]') || line.includes('Exception:') || line.includes('errorCode=')) {
                lastError = line.replace(/^\S+\s+\S+\s+\[ERROR\]\s*/, '').trim();
            }
            const progress = parseAria2ProgressLine(line);
            if (progress && onProgress) {
                onProgress(progress);
            }
        }
    };

    proc.stdout?.on('data', handleChunk);
    proc.stderr?.on('data', handleChunk);

    proc.on('close', async (code) => {
        if (onComplete) {
            if (code === 0) {
                console.log(`[Aria2] Download completed successfully: ${filename}`);
                onComplete(true);
            } else {
                console.error(`[Aria2] Download failed with code ${code}: ${lastError}`);
                const formatted = await formatAria2Error(lastError || `aria2c exited with code ${code}`, url);
                onComplete(false, formatted);
            }
        }
    });

    return proc;
}

/**
 * Translate cryptic aria2c errors (especially C++ exception strings and HTTP errors)
 * into actionable, user-friendly messages.
 */
export async function formatAria2Error(rawError: string, url?: string): Promise<string> {
    if (!rawError) return 'Download failed';

    // Check for HTTP 403 Forbidden
    if ((/errorCode=22/i.test(rawError) && /status=403/i.test(rawError)) || /status=403/i.test(rawError)) {
        if (url) {
            try {
                const probe = await probeDirectDownloadUrl(url, 3000);
                if (probe.quotaExceeded || probe.error) {
                    return probe.error!;
                }
            } catch {
                // fall through
            }
            if (/workers\.dev|shegu\.st|cinejoy|4khdhub/i.test(url)) {
                return 'Google Drive download quota exceeded for this file. Please choose another quality link (e.g. 1080p) or download via torrent.';
            }
        }
        return 'Download access forbidden (HTTP 403). The file host or CDN blocked access. Try another link or torrent.';
    }

    if ((/errorCode=22/i.test(rawError) && /status=404/i.test(rawError)) || /status=404/i.test(rawError)) {
        return 'File not found on host (HTTP 404). The stream link may have expired.';
    }

    if ((/errorCode=22/i.test(rawError) && /status=410/i.test(rawError)) || /status=410/i.test(rawError)) {
        return 'Download link has expired (HTTP 410). Please search and choose a fresh link.';
    }

    if ((/errorCode=22/i.test(rawError) && /status=50[234]/i.test(rawError)) || /status=50[234]/i.test(rawError)) {
        return 'Host server is temporarily unavailable or overloaded (HTTP 502/503/504). Please try again later.';
    }

    if ((/errorCode=22/i.test(rawError) && /status=429/i.test(rawError)) || /status=429/i.test(rawError)) {
        return 'Download rate-limited by host (HTTP 429 Too Many Requests). The server is throttling requests; please try again later or choose a torrent source.';
    }

    if (/errorCode=9\b/i.test(rawError) || /not enough disk space/i.test(rawError)) {
        return 'Not enough disk space to save the file.';
    }

    if (/errorCode=19\b/i.test(rawError) || /Name resolution failed/i.test(rawError)) {
        return 'DNS lookup failed: could not resolve download host.';
    }

    if (/errorCode=2\b/i.test(rawError) || /time out/i.test(rawError)) {
        return 'Download timed out connecting to the file host.';
    }

    const statusMatch = rawError.match(/status=(\d+)/i);
    if (statusMatch) {
        const statusCode = statusMatch[1];
        return `Download server returned HTTP ${statusCode}. The host may be blocking automated requests or requiring a browser challenge; please choose another source or torrent.`;
    }

    // Clean up raw C++ file pointers like -> [HttpSkipResponseCommand.cc:239]
    const cleaned = rawError
        .replace(/->\s*\[[\w.]+:\d+\]\s*/g, '')
        .replace(/Exception:\s*\[[\w.]+:\d+\]\s*/g, '')
        .replace(/^errorCode=\d+\s*/g, '')
        .trim();

    return cleaned || 'Download failed';
}
