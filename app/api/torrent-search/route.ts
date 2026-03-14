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

        // Add overall timeout to prevent hanging when downloads are active
        const timeoutMs = 20000; // 20 seconds max
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Search timed out')), timeoutMs);
        });

        const results = await Promise.race([
            searchTorrents(query, { year, type }),
            timeoutPromise
        ]);

        return NextResponse.json({ results });
    } catch (e: any) {
        console.error('Torrent search error:', e.message);
        // Return partial/empty results instead of error so UI doesn't break
        return NextResponse.json({ results: [], error: e.message });
    }
}
