import { NextResponse } from 'next/server';
import { MovieDb, DiscoverMovieRequest, DiscoverTvRequest } from 'moviedb-promise';
import { getTmdbApiKey, rateLimitedTmdbCall } from '@/lib/metadata';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'movie';
        const page = parseInt(searchParams.get('page') || '1', 10);
        
        const with_genres = searchParams.get('with_genres');
        const with_original_language = searchParams.get('with_original_language');
        const sort_by = searchParams.get('sort_by');
        const with_companies = searchParams.get('with_companies');

        const apiKey = getTmdbApiKey();
        const moviedb = new MovieDb(apiKey);

        const queryParams: any = { page };
        if (with_genres) queryParams.with_genres = with_genres;
        if (with_original_language) queryParams.with_original_language = with_original_language;
        if (sort_by) {
            queryParams.sort_by = sort_by;
            // When sorting by vote average, ensure there's a minimum number of votes, otherwise obscure 1-vote movies top the list
            if (sort_by.includes('vote_average')) {
                queryParams['vote_count.gte'] = 200;
            }
        }
        if (with_companies) queryParams.with_companies = with_companies;

        // Ensure we fetch enough data if we filter out adult content
        queryParams.include_adult = false;

        let res: any;
        let results: any[] = [];
        
        if (type === 'movie') {
            res = await rateLimitedTmdbCall(() => moviedb.discoverMovie(queryParams as DiscoverMovieRequest));
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
        } else {
            res = await rateLimitedTmdbCall(() => moviedb.discoverTv(queryParams as DiscoverTvRequest));
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
        }

        return NextResponse.json({ 
            results,
            page: res.page || 1,
            totalPages: res.total_pages || 1,
            totalResults: res.total_results || 0
        });
    } catch (e: any) {
        console.error('TMDB discover error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
