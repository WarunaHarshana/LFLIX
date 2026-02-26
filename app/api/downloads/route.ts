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

// POST — start a new download
export async function POST(req: Request) {
    try {
        const { magnetUri, watchlistId, downloadPath } = await req.json();

        if (!magnetUri) {
            return NextResponse.json({ error: 'Missing magnetUri' }, { status: 400 });
        }

        if (!magnetUri.startsWith('magnet:')) {
            return NextResponse.json({ error: 'Invalid magnet URI' }, { status: 400 });
        }

        const download = await downloadManager.addDownload(magnetUri, watchlistId, downloadPath);
        return NextResponse.json({ success: true, download });
    } catch (e: any) {
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
