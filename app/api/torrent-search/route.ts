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
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('Torrent search error:', message);
        // Return partial/empty results instead of error so UI doesn't break
        return NextResponse.json({ results: [], error: message });
    }
}
