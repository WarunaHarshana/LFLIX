import { NextResponse } from 'next/server';
import { getTmdbApiKey, rateLimitedTmdbCall } from '@/lib/metadata';
import { MovieDb } from 'moviedb-promise';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Server-side cache — populated once on first request after server start
let trendingCache: { movies: any[]; tv: any[]; fetchedAt: number } | null = null;

async function fetchTrendingData() {
    const apiKey = getTmdbApiKey();
    const moviedb = new MovieDb(apiKey);

    const [moviesRes, tvRes] = await Promise.allSettled([
        rateLimitedTmdbCall(() => moviedb.trending({ media_type: 'movie', time_window: 'day' })),
        rateLimitedTmdbCall(() => moviedb.trending({ media_type: 'tv', time_window: 'day' })),
    ]);

    const mapItem = (item: any, mediaType: string) => ({
        tmdbId: item.id,
        title: item.title || item.name || 'Unknown',
        posterPath: item.poster_path || null,
        backdropPath: item.backdrop_path || null,
        overview: item.overview || null,
        rating: item.vote_average || null,
        year: item.release_date?.substring(0, 4) || item.first_air_date?.substring(0, 4) || null,
        mediaType,
        popularity: item.popularity || 0,
    });

    const movies = moviesRes.status === 'fulfilled' && moviesRes.value.results
        ? moviesRes.value.results.slice(0, 20).map((m: any) => mapItem(m, 'movie'))
        : [];

    const tv = tvRes.status === 'fulfilled' && tvRes.value.results
        ? tvRes.value.results.slice(0, 20).map((t: any) => mapItem(t, 'tv'))
        : [];

    return { movies, tv, fetchedAt: Date.now() };
}

export async function GET() {
    try {
        // Only fetch once per server lifecycle (or if cache is somehow null)
        if (!trendingCache) {
            trendingCache = await fetchTrendingData();
        }

        return NextResponse.json({
            movies: trendingCache.movies,
            tv: trendingCache.tv,
            fetchedAt: trendingCache.fetchedAt,
        });
    } catch (e: any) {
        console.error('Trending fetch error:', e);
        return NextResponse.json({ error: e.message, movies: [], tv: [] }, { status: 500 });
    }
}
