import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { fetchEpisodeMetadata, fetchMovieMetadata, fetchShowMetadata, isPlaceholderEpisodeTitle, MIN_EPISODE_VOTES } from '@/lib/metadata';
import { apiErrorResponse, getSqliteErrorCode, isSqliteConstraintError, readJsonObject } from '@/lib/apiSecurity';
import { parsePositiveInt } from '@/lib/security';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await readJsonObject(req).catch(() => ({} as Record<string, unknown>));
        const id = parsePositiveInt(body.id);
        const type = body.type;

        // If specific ID provided, refresh just that one
        if (id && (type === 'movie' || type === 'show')) {
            return await refreshSingle(id, type);
        }

        // Otherwise refresh items missing posters or IMDb ratings.
        const moviesWithoutPoster = db.prepare('SELECT id, title, year, fileName FROM movies WHERE posterPath IS NULL OR imdbRating IS NULL').all() as any[];
        const showsWithoutPoster = db.prepare('SELECT id, title FROM shows WHERE posterPath IS NULL OR imdbRating IS NULL').all() as any[];

        let refreshed = 0;
        const errors: string[] = [];

        // Refresh movies
        for (const movie of moviesWithoutPoster) {
            try {
                // Use fileName if available as it's the source of truth, otherwise title
                const source = movie.fileName || movie.title;
                const metadata = await fetchMovieMetadata(source);

                if (metadata.tmdbId || metadata.posterPath || metadata.overview) {
                    db.prepare(`
                        UPDATE movies SET 
                          title = @title,
                          tmdbId = @tmdbId,
                          posterPath = @posterPath,
                          backdropPath = @backdropPath,
                          overview = @overview,
                          rating = @rating,
                          imdbRating = @imdbRating,
                          genres = @genres,
                          year = COALESCE(@year, year)
                        WHERE id = @id
                    `).run({
                        ...metadata,
                        id: movie.id
                    });
                    refreshed++;
                } else {
                    errors.push(`Movie metadata not found: ${movie.title}`);
                }
            } catch (e) {
                console.error(`Error refreshing movie ${movie.title}:`, e);
                errors.push(`Movie error: ${movie.title}`);
            }

            // Allow event loop to breathe
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Refresh shows
        for (const show of showsWithoutPoster) {
            try {
                const metadata = await fetchShowMetadata(show.title);

                if (metadata.tmdbId) {
                    // Check for duplicate show with same TMDB ID
                    const existing = db.prepare('SELECT id FROM shows WHERE tmdbId = ? AND id != ?').get(metadata.tmdbId, show.id) as { id: number } | undefined;

                    if (existing) {
                        // MERGE: Move episodes to existing show and delete this one
                        console.log(`Merging duplicate show "${show.title}" (${show.id}) into "${metadata.title}" (${existing.id})`);

                        db.transaction(() => {
                            // Move episodes
                            db.prepare('UPDATE episodes SET showId = ? WHERE showId = ?').run(existing.id, show.id);
                            db.prepare('UPDATE OR IGNORE auto_track SET showId = ? WHERE showId = ?').run(existing.id, show.id);
                            db.prepare('DELETE FROM auto_track WHERE showId = ?').run(show.id);
                            // Delete duplicate show
                            db.prepare('DELETE FROM shows WHERE id = ?').run(show.id);
                        })();

                        refreshed++;
                        continue;
                    }

                    // UPDATE
                    db.prepare(`
                        UPDATE shows SET 
                          title = @title,
                          tmdbId = @tmdbId,
                          posterPath = @posterPath,
                          backdropPath = @backdropPath,
                          overview = @overview,
                          rating = @rating,
                          imdbRating = @imdbRating,
                          genres = @genres
                        WHERE id = @id
                    `).run({
                        ...metadata,
                        id: show.id
                    });
                    refreshed++;
                } else {
                    errors.push(`Show not found: ${show.title}`);
                }
            } catch (e) {
                // Handle uniqueness constraint if title update conflicts
                if (isSqliteConstraintError(e)) {
                    errors.push(`Duplicate title conflict for show: ${show.title}`);
                } else {
                    console.error(`Error refreshing show ${show.title}:`, e);
                    errors.push(`Show error: ${show.title}`);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Refresh episodes whose metadata is missing or provisional.
        //
        // The old filter only caught our own `S3 E6` fallback, so an episode
        // scanned just after airing kept TMDB's *own* "Episode 6" placeholder
        // and its three-vote rating forever. Recently-aired episodes are also
        // re-fetched: TMDB fills in the title and the score settles over the
        // following days, and nothing else ever revisits them.
        const episodesNeedingMeta = db.prepare(`
            SELECT e.id, e.showId, e.seasonNumber, e.episodeNumber, e.title, e.rating, e.voteCount, e.stillPath, s.tmdbId
            FROM episodes e
            JOIN shows s ON s.id = e.showId
            WHERE s.tmdbId IS NOT NULL AND s.tmdbId > 0
            AND (
                e.stillPath IS NULL
                OR e.overview IS NULL
                OR e.rating IS NULL
                OR e.title IS NULL
                OR e.title LIKE 'S% E%'
                OR e.title LIKE 'Episode %'
                OR e.voteCount IS NULL
                OR e.voteCount < ${MIN_EPISODE_VOTES}
            )
        `).all() as { id: number; showId: number; seasonNumber: number; episodeNumber: number; title: string; rating: number | null; voteCount: number | null; stillPath: string | null; tmdbId: number }[];

        let episodesRefreshed = 0;
        for (const ep of episodesNeedingMeta) {
            try {
                const epMeta = await fetchEpisodeMetadata(ep.tmdbId, ep.seasonNumber, ep.episodeNumber);

                // Never overwrite a real title with a placeholder: TMDB can be
                // briefly inconsistent, and losing a good title is worse than
                // keeping it one refresh longer.
                const keepExistingTitle =
                    isPlaceholderEpisodeTitle(epMeta.title) && !isPlaceholderEpisodeTitle(ep.title);
                const nextTitle = keepExistingTitle ? ep.title : epMeta.title;

                const gotSomething =
                    epMeta.stillPath || epMeta.rating !== null || !isPlaceholderEpisodeTitle(epMeta.title);

                if (gotSomething) {
                    db.prepare(`UPDATE episodes SET title = ?, overview = COALESCE(?, overview), stillPath = COALESCE(?, stillPath), rating = ?, voteCount = ? WHERE id = ?`)
                        .run(nextTitle, epMeta.overview, epMeta.stillPath, epMeta.rating, epMeta.voteCount, ep.id);
                    episodesRefreshed++;
                }
            } catch (e) {
                errors.push(`Episode error: S${ep.seasonNumber}E${ep.episodeNumber} of show ${ep.showId}`);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return NextResponse.json({
            refreshed: refreshed + episodesRefreshed,
            total: moviesWithoutPoster.length + showsWithoutPoster.length + episodesNeedingMeta.length,
            episodes: episodesRefreshed,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (e) {
        return apiErrorResponse(e);
    }
}

// Refresh a single item
async function refreshSingle(id: number, type: 'movie' | 'show') {
    try {
        if (type === 'movie') {
            const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(id) as any;
            if (!movie) return NextResponse.json({ error: 'Movie not found' }, { status: 404 });

            const source = movie.fileName || movie.title;
            const metadata = await fetchMovieMetadata(source);

            if (metadata.tmdbId || metadata.posterPath || metadata.overview) {
                db.prepare(`
                    UPDATE movies SET 
                      title = @title,
                      tmdbId = @tmdbId,
                      posterPath = @posterPath,
                      backdropPath = @backdropPath,
                      overview = @overview,
                      rating = @rating,
                      imdbRating = @imdbRating,
                      genres = @genres,
                      year = COALESCE(@year, year)
                    WHERE id = @id
                `).run({ ...metadata, id });
                return NextResponse.json({ success: true, title: metadata.title });
            }
            return NextResponse.json({ error: 'No movie metadata match found' }, { status: 404 });

        } else {
            const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(id) as any;
            if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 });

            const metadata = await fetchShowMetadata(show.title);

            if (metadata.tmdbId) {
                // Check duplicates
                const existing = db.prepare('SELECT id FROM shows WHERE tmdbId = ? AND id != ?').get(metadata.tmdbId, id) as { id: number } | undefined;

                if (existing) {
                    db.transaction(() => {
                        db.prepare('UPDATE episodes SET showId = ? WHERE showId = ?').run(existing.id, id);
                        db.prepare('UPDATE OR IGNORE auto_track SET showId = ? WHERE showId = ?').run(existing.id, id);
                        db.prepare('DELETE FROM auto_track WHERE showId = ?').run(id);
                        db.prepare('DELETE FROM shows WHERE id = ?').run(id);
                    })();
                    return NextResponse.json({ success: true, title: metadata.title, merged: true });
                }

                db.prepare(`
                    UPDATE shows SET 
                      title = @title,
                      tmdbId = @tmdbId,
                      posterPath = @posterPath,
                      backdropPath = @backdropPath,
                      overview = @overview,
                      rating = @rating,
                      imdbRating = @imdbRating,
                      genres = @genres
                    WHERE id = @id
                `).run({ ...metadata, id });
                return NextResponse.json({ success: true, title: metadata.title });
            }
            return NextResponse.json({ error: 'No TMDB match found' }, { status: 404 });
        }
    } catch (e) {
        if (getSqliteErrorCode(e) === 'SQLITE_CONSTRAINT_UNIQUE') {
            return NextResponse.json({ error: 'Title conflict detected' }, { status: 409 });
        }
        return apiErrorResponse(e);
    }
}
