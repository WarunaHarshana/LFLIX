import { NextResponse } from 'next/server';
import { MovieDb } from 'moviedb-promise';
import { getTmdbApiKey, rateLimitedTmdbCall } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const type = searchParams.get('type') as 'movie' | 'tv' | null;
        const seasonNum = searchParams.get('season');

        if (!id || !type) {
            return NextResponse.json({ error: 'Missing id or type' }, { status: 400 });
        }

        const apiKey = getTmdbApiKey();
        const moviedb = new MovieDb(apiKey);
        const tmdbId = parseInt(id, 10);

        if (type === 'movie') {
            const movie = await rateLimitedTmdbCall(() =>
                moviedb.movieInfo({ id: tmdbId, append_to_response: 'credits' })
            );

            return NextResponse.json({
                id: movie.id,
                title: movie.title || 'Unknown',
                overview: movie.overview || null,
                posterPath: movie.poster_path || null,
                backdropPath: movie.backdrop_path || null,
                rating: movie.vote_average || null,
                year: movie.release_date?.substring(0, 4) || null,
                runtime: movie.runtime || null,
                tagline: movie.tagline || null,
                genres: (movie.genres || []).map((g: any) => g.name).join(', '),
                cast: ((movie as any).credits?.cast || []).slice(0, 8).map((c: any) => ({
                    name: c.name,
                    character: c.character,
                    profilePath: c.profile_path
                })),
            });
        } else if (type === 'tv') {
            // If season specified, fetch that season's episodes
            if (seasonNum) {
                const season = await rateLimitedTmdbCall(() =>
                    moviedb.seasonInfo({ id: tmdbId, season_number: parseInt(seasonNum, 10) })
                );

                return NextResponse.json({
                    seasonNumber: season.season_number,
                    episodes: (season.episodes || []).map((ep: any) => ({
                        episodeNumber: ep.episode_number,
                        title: ep.name || `Episode ${ep.episode_number}`,
                        overview: ep.overview || null,
                        stillPath: ep.still_path || null,
                        airDate: ep.air_date || null,
                        rating: ep.vote_average || null,
                        runtime: ep.runtime || null,
                    })),
                });
            }

            // Otherwise fetch show info with seasons
            const show = await rateLimitedTmdbCall(() =>
                moviedb.tvInfo({ id: tmdbId, append_to_response: 'credits' })
            );

            return NextResponse.json({
                id: show.id,
                title: show.name || 'Unknown',
                overview: show.overview || null,
                posterPath: show.poster_path || null,
                backdropPath: show.backdrop_path || null,
                rating: show.vote_average || null,
                year: show.first_air_date?.substring(0, 4) || null,
                status: show.status || null,
                tagline: show.tagline || null,
                genres: (show.genres || []).map((g: any) => g.name).join(', '),
                numberOfSeasons: show.number_of_seasons || 0,
                seasons: (show.seasons || [])
                    .filter((s: any) => s.season_number > 0) // exclude specials
                    .map((s: any) => ({
                        seasonNumber: s.season_number,
                        name: s.name,
                        episodeCount: s.episode_count,
                        posterPath: s.poster_path || null,
                        airDate: s.air_date || null,
                    })),
                cast: ((show as any).credits?.cast || []).slice(0, 8).map((c: any) => ({
                    name: c.name,
                    character: c.character,
                    profilePath: c.profile_path
                })),
            });
        }

        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    } catch (e: any) {
        console.error('TMDB details error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
