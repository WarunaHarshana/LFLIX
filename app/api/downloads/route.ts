import { NextResponse } from 'next/server';
import downloadManager from '@/lib/downloader';

export const dynamic = 'force-dynamic';

// GET — all downloads with status
export async function GET() {
    try {
        const downloads = downloadManager.getAll();
        const activeCount = downloadManager.getActiveCount();
        return NextResponse.json({ downloads, activeCount });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST — start a new download (torrent or HTTP direct)
export async function POST(req: Request) {
    try {
        const { magnetUri, httpUrl, watchlistId, downloadPath, torrentBase64, filename } = await req.json();

        let uri = magnetUri || (httpUrl ? `http-direct:${httpUrl}` : null);

        if (torrentBase64 && filename) {
            const fs = require('fs');
            const path = require('path');
            
            let resolvedDownloadPath = downloadPath;
            if (!resolvedDownloadPath) {
                const db = require('@/lib/db').default;
                try {
                    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath');
                    if (setting?.value && fs.existsSync(setting.value)) {
                        resolvedDownloadPath = setting.value;
                    }
                } catch { /* ignore */ }
                if (!resolvedDownloadPath) {
                    resolvedDownloadPath = path.join(process.cwd(), 'downloads');
                }
            }

            const torrentsDir = path.join(resolvedDownloadPath, '.torrents');
            if (!fs.existsSync(torrentsDir)) {
                fs.mkdirSync(torrentsDir, { recursive: true });
            }

            const uniqueFilename = `${Date.now()}_${filename.replace(/[^a-z0-9.]/gi, '_')}`;
            const torrentFilePath = path.join(torrentsDir, uniqueFilename);
            
            const base64Data = torrentBase64.includes(',') ? torrentBase64.split(',')[1] : torrentBase64;
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(torrentFilePath, buffer);
            
            uri = torrentFilePath;
        }

        if (!uri) {
            return NextResponse.json({ error: 'Missing magnetUri, httpUrl, or torrent file' }, { status: 400 });
        }

        if (!uri.startsWith('magnet:') && !uri.startsWith('http-direct:') && !uri.endsWith('.torrent')) {
            return NextResponse.json({ error: 'Invalid download URI' }, { status: 400 });
        }

        const download = await downloadManager.addDownload(uri, watchlistId, downloadPath);
        return NextResponse.json({ success: true, download });
    } catch (e: any) {
        console.error('Download error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// PATCH — pause or resume a download
export async function PATCH(req: Request) {
    try {
        const { id, action } = await req.json();

        if (!id || !action) {
            return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
        }

        let success = false;
        if (action === 'pause') {
            success = await downloadManager.pauseDownload(id);
        } else if (action === 'resume') {
            success = await downloadManager.resumeDownload(id);
        } else {
            return NextResponse.json({ error: 'Invalid action. Use "pause" or "resume"' }, { status: 400 });
        }

        return NextResponse.json({ success });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// DELETE — cancel/remove download
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const deleteFiles = searchParams.get('deleteFiles') === '1';

        if (!id) {
            return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }

        const success = await downloadManager.removeDownload(parseInt(id), deleteFiles);
        return NextResponse.json({ success });
    } catch (e: any) {
        console.error('Delete download error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
