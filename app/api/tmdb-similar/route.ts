import { NextResponse } from 'next/server';
import { MovieDb } from 'moviedb-promise';
import { getTmdbApiKey, rateLimitedTmdbCall } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

type SimilarResult = {
    id: number;
    title?: string;
    original_title?: string;
    name?: string;
    original_name?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    overview?: string | null;
    vote_average?: number | null;
    release_date?: string;
    first_air_date?: string;
    popularity?: number;
};

type SimilarResponse = {
    results?: SimilarResult[];
    page?: number;
    total_pages?: number;
    total_results?: number;
};

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const type = searchParams.get('type') as 'movie' | 'tv' | null;
        const page = parseInt(searchParams.get('page') || '1', 10);

        if (!id || !type || !['movie', 'tv'].includes(type)) {
            return NextResponse.json({ error: 'Missing or invalid id/type' }, { status: 400 });
        }

        const tmdbId = parseInt(id, 10);
        if (Number.isNaN(tmdbId)) {
            return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
        }

        const apiKey = getTmdbApiKey();
        const moviedb = new MovieDb(apiKey);

        const res = type === 'movie'
            ? await rateLimitedTmdbCall(() => moviedb.movieRecommendations({ id: `${tmdbId}`, page: `${page}` }))
            : await rateLimitedTmdbCall(() => moviedb.tvRecommendations({ id: tmdbId, page }));

        const normalized = res as SimilarResponse;
        const results = (normalized.results || []).map((item) => ({
            tmdbId: item.id,
            mediaType: type,
            title: type === 'movie'
                ? (item.title || item.original_title || 'Unknown')
                : (item.name || item.original_name || 'Unknown'),
            posterPath: item.poster_path || null,
            backdropPath: item.backdrop_path || null,
            overview: item.overview || null,
            rating: item.vote_average || null,
            year: type === 'movie'
                ? (item.release_date ? item.release_date.substring(0, 4) : null)
                : (item.first_air_date ? item.first_air_date.substring(0, 4) : null),
            popularity: item.popularity || 0,
        }));

        return NextResponse.json({
            results,
            page: normalized.page || 1,
            totalPages: normalized.total_pages || 1,
            totalResults: normalized.total_results || 0,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('TMDB similar error:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
