import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { MovieDb } from 'moviedb-promise';
import { getTmdbApiKey, rateLimitedTmdbCall, cleanFilename, MediaMetadata, fetchMovieMetadata, fetchShowMetadata } from '@/lib/metadata';

export async function POST(req: Request) {
    const TMDB_API_KEY = getTmdbApiKey();
    const moviedb = new MovieDb(TMDB_API_KEY);

    try {
        const body = await req.json().catch(() => ({}));
        const { id, type } = body;

        // If specific ID provided, refresh just that one
        if (id && type) {
            return await refreshSingle(id, type);
        }

        // Otherwise refresh all items missing posters
        const moviesWithoutPoster = db.prepare('SELECT id, title, year, fileName FROM movies WHERE posterPath IS NULL').all() as any[];
        const showsWithoutPoster = db.prepare('SELECT id, title FROM shows WHERE posterPath IS NULL').all() as any[];

        let refreshed = 0;
        const errors: string[] = [];

        // Refresh movies
        for (const movie of moviesWithoutPoster) {
            try {
                // Use fileName if available as it's the source of truth, otherwise title
                const source = movie.fileName || movie.title;
                const metadata = await fetchMovieMetadata(source);

                if (metadata.tmdbId) {
                    db.prepare(`
                        UPDATE movies SET 
                          title = @title,
                          tmdbId = @tmdbId,
                          posterPath = @posterPath,
                          backdropPath = @backdropPath,
                          overview = @overview,
                          rating = @rating,
                          genres = @genres,
                          year = COALESCE(@year, year)
                        WHERE id = @id
                    `).run({
                        ...metadata,
                        id: movie.id
                    });
                    refreshed++;
                } else {
                    errors.push(`Movie not found: ${movie.title}`);
                }
            } catch (e: any) {
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
            } catch (e: any) {
                // Handle uniqueness constraint if title update conflicts
                if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') {
                    errors.push(`Duplicate title conflict for show: ${show.title}`);
                } else {
                    console.error(`Error refreshing show ${show.title}:`, e);
                    errors.push(`Show error: ${show.title}`);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return NextResponse.json({
            refreshed,
            total: moviesWithoutPoster.length + showsWithoutPoster.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
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

            if (metadata.tmdbId) {
                db.prepare(`
                    UPDATE movies SET 
                      title = @title,
                      tmdbId = @tmdbId,
                      posterPath = @posterPath,
                      backdropPath = @backdropPath,
                      overview = @overview,
                      rating = @rating,
                      genres = @genres,
                      year = COALESCE(@year, year)
                    WHERE id = @id
                `).run({ ...metadata, id });
                return NextResponse.json({ success: true, title: metadata.title });
            }
            return NextResponse.json({ error: 'No TMDB match found' }, { status: 404 });

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
                      genres = @genres
                    WHERE id = @id
                `).run({ ...metadata, id });
                return NextResponse.json({ success: true, title: metadata.title });
            }
            return NextResponse.json({ error: 'No TMDB match found' }, { status: 404 });
        }
    } catch (e: any) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return NextResponse.json({ error: 'Title conflict detected' }, { status: 409 });
        }
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
