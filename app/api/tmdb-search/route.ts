import { NextResponse } from 'next/server';
import { MovieDb } from 'moviedb-promise';
import { getTmdbApiKey, rateLimitedTmdbCall } from '@/lib/metadata';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');
        const type = searchParams.get('type') || 'multi'; // movie, tv, multi

        if (!query || query.trim().length < 2) {
            return NextResponse.json({ results: [] });
        }

        const apiKey = getTmdbApiKey();
        const moviedb = new MovieDb(apiKey);
        const searchQuery = query.trim();

        let results: any[] = [];

        if (type === 'movie') {
            const res = await rateLimitedTmdbCall(() => moviedb.searchMovie({ query: searchQuery }));
            results = (res.results || []).map((m: any) => ({
                tmdbId: m.id,
                mediaType: 'movie',
                title: m.title || m.original_title || 'Unknown',
                posterPath: m.poster_path || null,
                backdropPath: m.backdrop_path || null,
                overview: m.overview || null,
                rating: m.vote_average || null,
                year: m.release_date ? m.release_date.substring(0, 4) : null,
                popularity: m.popularity || 0
            }));
        } else if (type === 'tv') {
            const res = await rateLimitedTmdbCall(() => moviedb.searchTv({ query: searchQuery }));
            results = (res.results || []).map((s: any) => ({
                tmdbId: s.id,
                mediaType: 'tv',
                title: s.name || s.original_name || 'Unknown',
                posterPath: s.poster_path || null,
                backdropPath: s.backdrop_path || null,
                overview: s.overview || null,
                rating: s.vote_average || null,
                year: s.first_air_date ? s.first_air_date.substring(0, 4) : null,
                popularity: s.popularity || 0
            }));
        } else {
            // Multi search (movies + tv)
            const res = await rateLimitedTmdbCall(() => moviedb.searchMulti({ query: searchQuery }));
            results = (res.results || [])
                .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
                .map((r: any) => ({
                    tmdbId: r.id,
                    mediaType: r.media_type,
                    title: r.title || r.name || r.original_title || r.original_name || 'Unknown',
                    posterPath: r.poster_path || null,
                    backdropPath: r.backdrop_path || null,
                    overview: r.overview || null,
                    rating: r.vote_average || null,
                    year: r.release_date
                        ? r.release_date.substring(0, 4)
                        : r.first_air_date
                            ? r.first_air_date.substring(0, 4)
                            : null,
                    popularity: r.popularity || 0
                }));
        }

        // Sort by popularity descending
        results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

        return NextResponse.json({ results: results.slice(0, 20) });
    } catch (e: any) {
        console.error('TMDB search error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
