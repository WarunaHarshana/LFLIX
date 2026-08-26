import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getTmdbClient, fetchImdbRatingById, fetchEpisodeMetadata } from '@/lib/metadata';
import { apiErrorResponse, readJsonObject } from '@/lib/apiSecurity';
import { parsePositiveInt } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await readJsonObject(req);
        const id = parsePositiveInt(body.id);
        const tmdbId = parsePositiveInt(body.tmdbId);
        const type = body.type === 'show' ? 'show' : body.type === 'movie' ? 'movie' : null;

        if (!id || !tmdbId || !type) {
            return NextResponse.json({ error: 'Valid id, tmdbId, and type (movie/show) are required' }, { status: 400 });
        }

        const moviedb = getTmdbClient();

        if (type === 'movie') {
            const movie = db.prepare('SELECT id, filePath, fileName FROM movies WHERE id = ?').get(id) as { id: number; filePath: string; fileName: string } | undefined;
            if (!movie) {
                return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
            }

            const tmdbData = await moviedb.movieInfo({ id: tmdbId }) as any;
            const externalIds = await moviedb.movieExternalIds({ id: tmdbId }).catch(() => ({} as any));
            const imdbRating = externalIds.imdb_id ? await fetchImdbRatingById(externalIds.imdb_id) : null;
            const genres = tmdbData.genres?.map((g: any) => g.name).filter(Boolean).join(', ') || null;
            const year = tmdbData.release_date ? parseInt(tmdbData.release_date.substring(0, 4), 10) : null;

            db.prepare(`
                UPDATE movies SET
                    title = @title,
                    year = @year,
                    tmdbId = @tmdbId,
                    posterPath = @posterPath,
                    backdropPath = @backdropPath,
                    overview = @overview,
                    rating = @rating,
                    imdbRating = @imdbRating,
                    genres = @genres
                WHERE id = @id
            `).run({
                id,
                title: tmdbData.title || movie.fileName,
                year,
                tmdbId,
                posterPath: tmdbData.poster_path || null,
                backdropPath: tmdbData.backdrop_path || null,
                overview: tmdbData.overview || null,
                rating: tmdbData.vote_average || null,
                imdbRating,
                genres,
            });

            const updated = db.prepare('SELECT * FROM movies WHERE id = ?').get(id);
            return NextResponse.json({ success: true, item: updated });
        } else {
            const show = db.prepare('SELECT id, title FROM shows WHERE id = ?').get(id) as { id: number; title: string } | undefined;
            if (!show) {
                return NextResponse.json({ error: 'Show not found' }, { status: 404 });
            }

            const tmdbData = await moviedb.tvInfo({ id: tmdbId }) as any;
            const externalIds = await moviedb.tvExternalIds({ id: tmdbId }).catch(() => ({} as any));
            const imdbRating = externalIds.imdb_id ? await fetchImdbRatingById(externalIds.imdb_id) : null;
            const genres = tmdbData.genres?.map((g: any) => g.name).filter(Boolean).join(', ') || null;

            db.prepare(`
                UPDATE shows SET
                    title = @title,
                    tmdbId = @tmdbId,
                    posterPath = @posterPath,
                    backdropPath = @backdropPath,
                    overview = @overview,
                    rating = @rating,
                    imdbRating = @imdbRating,
                    genres = @genres,
                    firstAirDate = @firstAirDate
                WHERE id = @id
            `).run({
                id,
                title: tmdbData.name || show.title,
                tmdbId,
                posterPath: tmdbData.poster_path || null,
                backdropPath: tmdbData.backdrop_path || null,
                overview: tmdbData.overview || null,
                rating: tmdbData.vote_average || null,
                imdbRating,
                genres,
                firstAirDate: tmdbData.first_air_date || null,
            });

            // Update all episodes for this show from TMDB
            const episodes = db.prepare('SELECT id, seasonNumber, episodeNumber FROM episodes WHERE showId = ?').all(id) as { id: number; seasonNumber: number; episodeNumber: number }[];
            for (const ep of episodes) {
                try {
                    const epMeta = await fetchEpisodeMetadata(tmdbId, ep.seasonNumber, ep.episodeNumber);
                    if (epMeta.stillPath || epMeta.rating !== null || epMeta.title) {
                        db.prepare(`UPDATE episodes SET title = ?, overview = ?, stillPath = ?, rating = ?, voteCount = ? WHERE id = ?`)
                            .run(epMeta.title, epMeta.overview, epMeta.stillPath, epMeta.rating, epMeta.voteCount, ep.id);
                    }
                } catch {
                    // ignore individual episode failures
                }
            }

            const updated = db.prepare('SELECT * FROM shows WHERE id = ?').get(id);
            return NextResponse.json({ success: true, item: updated });
        }
    } catch (e) {
        return apiErrorResponse(e);
    }
}
