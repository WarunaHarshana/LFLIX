import { NextResponse } from 'next/server';
import downloadManager from '@/lib/downloader';

// Mark as dynamic for static export compatibility
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
        const { magnetUri, watchlistId } = await req.json();

        if (!magnetUri) {
            return NextResponse.json({ error: 'Missing magnetUri' }, { status: 400 });
        }

        if (!magnetUri.startsWith('magnet:')) {
            return NextResponse.json({ error: 'Invalid magnet URI' }, { status: 400 });
        }

        const download = await downloadManager.addDownload(magnetUri, watchlistId);
        return NextResponse.json({ success: true, download });
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

        await downloadManager.removeDownload(parseInt(id), deleteFiles);
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
