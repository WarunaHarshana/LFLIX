import { NextResponse } from 'next/server';
import { searchTorrents } from '@/lib/torrentSearch';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');
        const year = searchParams.get('year') || undefined;
        const type = searchParams.get('type') as 'movie' | 'tv' | undefined;

        if (!query || query.trim().length < 2) {
            return NextResponse.json({ results: [] });
        }

        const results = await searchTorrents(query, { year, type });

        return NextResponse.json({ results });
    } catch (e: any) {
        console.error('Torrent search error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
