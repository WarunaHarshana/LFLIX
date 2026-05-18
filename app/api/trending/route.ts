import { NextResponse } from 'next/server';
import { cachedTmdbCall, getTmdbClient } from '@/lib/metadata';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

const TRENDING_CACHE_KEY = 'tmdb-trending-day';
const TRENDING_TTL_MINUTES = 30;

async function fetchTrendingData() {
    const moviedb = getTmdbClient();

    const [moviesRes, tvRes] = await Promise.allSettled([
        cachedTmdbCall('tmdb-trending-movie-day', () => moviedb.trending({ media_type: 'movie', time_window: 'day' }), TRENDING_TTL_MINUTES),
        cachedTmdbCall('tmdb-trending-tv-day', () => moviedb.trending({ media_type: 'tv', time_window: 'day' }), TRENDING_TTL_MINUTES),
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
        const trendingData = await cachedTmdbCall(TRENDING_CACHE_KEY, fetchTrendingData, TRENDING_TTL_MINUTES);

        return NextResponse.json({
            movies: trendingData.movies,
            tv: trendingData.tv,
            fetchedAt: trendingData.fetchedAt,
        });
    } catch (e: any) {
        console.error('Trending fetch error:', e);
        return NextResponse.json({ error: e.message, movies: [], tv: [] }, { status: 500 });
    }
}
