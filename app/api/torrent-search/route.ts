import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/apiSecurity';
import { isGoodMovieReleaseQuality, searchTorrentsWithDiagnostics } from '@/lib/torrentSearch';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const limited = rateLimit(req, 'torrent-search', { windowMs: 60 * 1000, max: 50 });
        if (limited) return limited;

        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q')?.trim();
        const yearParam = searchParams.get('year')?.trim() || undefined;
        const typeParam = searchParams.get('type')?.trim() || undefined;
        const goodOnly = searchParams.get('goodOnly') === '1';

        if (!query || query.trim().length < 2) {
            return NextResponse.json({ results: [] });
        }
        if (query.length > 180) {
            return NextResponse.json({ results: [], error: 'Search query is too long' }, { status: 400 });
        }

        if (typeParam && typeParam !== 'movie' && typeParam !== 'tv') {
            return NextResponse.json({ results: [], error: 'Invalid media type' }, { status: 400 });
        }

        if (yearParam && !/^(19|20)\d{2}$/.test(yearParam)) {
            return NextResponse.json({ results: [], error: 'Invalid year' }, { status: 400 });
        }

        const type = typeParam as 'movie' | 'tv' | undefined;
        const diagnostics = await searchTorrentsWithDiagnostics(query, { year: yearParam, type });
        const filteredResults = goodOnly && type === 'movie'
            ? diagnostics.results.filter(isGoodMovieReleaseQuality)
            : diagnostics.results;

        return NextResponse.json({
            results: filteredResults,
            sources: diagnostics.sources,
            cached: diagnostics.cached,
            tookMs: diagnostics.tookMs,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('Torrent search error:', message);
        // Return partial/empty results instead of error so UI doesn't break
        return NextResponse.json({ results: [], error: message });
    }
}
