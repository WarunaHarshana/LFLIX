import { NextResponse } from 'next/server';
import downloadManager from '@/lib/downloader';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { apiErrorResponse, readJsonObject, rateLimit } from '@/lib/apiSecurity';
import {
    getSafeErrorMessage,
    parsePositiveInt,
    sanitizeFilename,
    isPathInside,
    validateHttpDownloadUrl,
    validateExistingDirectory,
    validateExistingFile,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

function getValidatedDownloadPath(downloadPath: unknown): string | undefined {
    if (!downloadPath) return undefined;

    const validated = validateExistingDirectory(downloadPath);
    if (validated.error !== null) {
        throw new Error(validated.error);
    }

    return validated.path;
}

function getDefaultDownloadPath(): string {
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

// GET — all downloads with status
export async function GET() {
    try {
        const downloads = downloadManager.getAll();
        const activeCount = downloadManager.getActiveCount();
        return NextResponse.json({ downloads, activeCount });
    } catch (e) {
        return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
    }
}

// POST — start a new download (torrent or HTTP direct)
export async function POST(req: Request) {
    try {
        const limited = rateLimit(req, 'downloads-write', { windowMs: 60 * 1000, max: 30 });
        if (limited) return limited;

        const { magnetUri, httpUrl, watchlistId, downloadPath, torrentBase64, filename } = await readJsonObject(req, 2 * 1024 * 1024);
        const validatedDownloadPath = getValidatedDownloadPath(downloadPath);
        const parsedWatchlistId = watchlistId ? parsePositiveInt(watchlistId) ?? undefined : undefined;

        let uri = typeof magnetUri === 'string' ? magnetUri.trim() : null;
        if (!uri && typeof httpUrl === 'string') {
            const validatedHttp = await validateHttpDownloadUrl(httpUrl);
            if (validatedHttp.error !== null) {
                return NextResponse.json({ error: validatedHttp.error }, { status: 400 });
            }
            uri = `http-direct:${validatedHttp.url}`;
        }

        if (typeof torrentBase64 === 'string' && typeof filename === 'string') {
            const resolvedDownloadPath = validatedDownloadPath || getDefaultDownloadPath();

            const torrentsDir = path.join(resolvedDownloadPath, '.torrents');
            if (!fs.existsSync(torrentsDir)) {
                fs.mkdirSync(torrentsDir, { recursive: true });
            }

            const uniqueFilename = `${Date.now()}_${sanitizeFilename(filename, 'download.torrent')}`;
            const torrentFilePath = path.join(torrentsDir, uniqueFilename);
            
            const base64Data = torrentBase64.includes(',') ? torrentBase64.split(',')[1] : torrentBase64;
            if (!/^[a-z0-9+/=\s]+$/i.test(base64Data)) {
                return NextResponse.json({ error: 'Invalid torrent file payload' }, { status: 400 });
            }
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(torrentFilePath, buffer);
            
            uri = torrentFilePath;
        }

        if (!uri) {
            return NextResponse.json({ error: 'Missing magnetUri, httpUrl, or torrent file' }, { status: 400 });
        }

        if (uri.length > 20000) {
            return NextResponse.json({ error: 'Download URI is too long' }, { status: 400 });
        }

        if (uri.startsWith('http-direct:')) {
            const validatedHttp = await validateHttpDownloadUrl(uri.replace(/^http-direct:/, ''));
            if (validatedHttp.error !== null) {
                return NextResponse.json({ error: validatedHttp.error }, { status: 400 });
            }
            uri = `http-direct:${validatedHttp.url}`;
        }

        if (!uri.startsWith('magnet:') && !uri.startsWith('http-direct:') && !uri.endsWith('.torrent')) {
            return NextResponse.json({ error: 'Invalid download URI' }, { status: 400 });
        }

        if (uri.endsWith('.torrent')) {
            const file = validateExistingFile(uri);
            if (file.error !== null) {
                return NextResponse.json({ error: file.error }, { status: 400 });
            }
            const resolvedDownloadPath = validatedDownloadPath || getDefaultDownloadPath();
            const torrentsDir = path.join(resolvedDownloadPath, '.torrents');
            if (!isPathInside(file.path, torrentsDir)) {
                return NextResponse.json({ error: 'Torrent file path is outside the managed torrent folder' }, { status: 400 });
            }
            uri = file.path;
        }

        const download = await downloadManager.addDownload(uri, parsedWatchlistId, validatedDownloadPath);
        return NextResponse.json({ success: true, download });
    } catch (e) {
        console.error('Download error:', e);
        return apiErrorResponse(e, getSafeErrorMessage(e));
    }
}

// PATCH — pause or resume a download
export async function PATCH(req: Request) {
    try {
        const limited = rateLimit(req, 'downloads-write', { windowMs: 60 * 1000, max: 60 });
        if (limited) return limited;

        const { id, action } = await readJsonObject(req, 4096);
        const downloadId = parsePositiveInt(id);

        if (!downloadId || !action) {
            return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
        }

        let success = false;
        if (action === 'pause') {
            success = await downloadManager.pauseDownload(downloadId);
        } else if (action === 'resume') {
            success = await downloadManager.resumeDownload(downloadId);
        } else {
            return NextResponse.json({ error: 'Invalid action. Use "pause" or "resume"' }, { status: 400 });
        }

        return NextResponse.json({ success });
    } catch (e) {
        return apiErrorResponse(e, getSafeErrorMessage(e));
    }
}

// DELETE — cancel/remove download
export async function DELETE(req: Request) {
    try {
        const limited = rateLimit(req, 'downloads-write', { windowMs: 60 * 1000, max: 60 });
        if (limited) return limited;

        const { searchParams } = new URL(req.url);
        const id = parsePositiveInt(searchParams.get('id'));
        const deleteFiles = searchParams.get('deleteFiles') === '1';

        if (!id) {
            return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }

        const success = await downloadManager.removeDownload(id, deleteFiles);
        return NextResponse.json({ success });
    } catch (e) {
        console.error('Delete download error:', e);
        return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
    }
}
