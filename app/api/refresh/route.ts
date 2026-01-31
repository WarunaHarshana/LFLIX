import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { MovieDb } from 'moviedb-promise';

// Get TMDB API key from settings or env
function getTmdbApiKey(): string {
    try {
        const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdbApiKey') as { value: string } | undefined;
        return setting?.value || process.env.TMDB_API_KEY || '3d8c8476371d0730fb5bd7ae67241879';
    } catch {
        return process.env.TMDB_API_KEY || '3d8c8476371d0730fb5bd7ae67241879';
    }
}

// Clean title for TMDB search - remove year and junk
function cleanTitleForSearch(title: string): string {
    let clean = title;

    // Remove trailing year
    clean = clean.replace(/\s+(19|20)\d{2}\s*$/g, "");

    // Remove A.K.A and everything after
    clean = clean.replace(/\bA\.?K\.?A\.?\b.*/i, "");

    // Remove scene tags
    clean = clean.replace(/\b(1080p|720p|480p|2160p|4k|BluRay|WEBRip|WEB-DL|HDRip|HEVC|x264|x265|AAC|DTS|10bit|PSA|YTS|YIFY)\b.*/i, "");

    // Replace dots/underscores
    clean = clean.replace(/[._]/g, " ");

    // Remove extra spaces
    clean = clean.replace(/\s+/g, " ").trim();

    return clean;
}

// Fetch genre names from TMDB genre IDs
async function fetchGenres(moviedb: MovieDb, genreIds: number[], type: 'movie' | 'tv'): Promise<string> {
    try {
        const genreList = type === 'movie'
            ? await moviedb.genreMovieList({})
            : await moviedb.genreTvList({});

        const genreMap = new Map(genreList.genres?.map(g => [g.id, g.name]) || []);
        return genreIds.map(id => genreMap.get(id)).filter(Boolean).join(', ');
    } catch {
        return '';
    }
}

// Refresh metadata for movies missing posters
export async function POST(req: Request) {
    const TMDB_API_KEY = getTmdbApiKey();
    const moviedb = new MovieDb(TMDB_API_KEY);

    try {
        const { id, type } = await req.json();

        // If specific ID provided, refresh just that one
        if (id && type) {
            return await refreshSingle(moviedb, id, type);
        }

        // Otherwise refresh all items missing posters
        const moviesWithoutPoster = db.prepare('SELECT id, title, year, fileName FROM movies WHERE posterPath IS NULL').all() as any[];
        const showsWithoutPoster = db.prepare('SELECT id, title FROM shows WHERE posterPath IS NULL').all() as any[];

        let refreshed = 0;
        const errors: string[] = [];

        // Refresh movies
        for (const movie of moviesWithoutPoster) {
            try {
                const searchTitle = cleanTitleForSearch(movie.title);
                const res = await moviedb.searchMovie({ query: searchTitle, year: movie.year || undefined });

                if (res.results && res.results.length > 0) {
                    const hit = res.results[0];
                    const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'movie') : '';

                    db.prepare(`
            UPDATE movies SET 
              title = ?,
              tmdbId = ?,
              posterPath = ?,
              backdropPath = ?,
              overview = ?,
              rating = ?,
              genres = ?
            WHERE id = ?
          `).run(
                        hit.title || movie.title,
                        hit.id,
                        hit.poster_path,
                        hit.backdrop_path,
                        hit.overview,
                        hit.vote_average,
                        genres,
                        movie.id
                    );
                    refreshed++;
                }
            } catch (e) {
                errors.push(`Movie: ${movie.title}`);
            }

            // Rate limiting - small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Refresh shows
        for (const show of showsWithoutPoster) {
            try {
                const searchTitle = cleanTitleForSearch(show.title);
                const res = await moviedb.searchTv({ query: searchTitle });

                if (res.results && res.results.length > 0) {
                    const hit = res.results[0];
                    const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'tv') : '';

                    db.prepare(`
            UPDATE shows SET 
              title = ?,
              tmdbId = ?,
              posterPath = ?,
              backdropPath = ?,
              overview = ?,
              rating = ?,
              genres = ?
            WHERE id = ?
          `).run(
                        hit.name || show.title,
                        hit.id,
                        hit.poster_path,
                        hit.backdrop_path,
                        hit.overview,
                        hit.vote_average,
                        genres,
                        show.id
                    );
                    refreshed++;
                }
            } catch (e) {
                errors.push(`Show: ${show.title}`);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
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
async function refreshSingle(moviedb: MovieDb, id: number, type: 'movie' | 'show') {
    try {
        if (type === 'movie') {
            const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(id) as any;
            if (!movie) {
                return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
            }

            const searchTitle = cleanTitleForSearch(movie.title);
            const res = await moviedb.searchMovie({ query: searchTitle, year: movie.year || undefined });

            if (res.results && res.results.length > 0) {
                const hit = res.results[0];
                const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'movie') : '';

                db.prepare(`
          UPDATE movies SET 
            title = ?,
            tmdbId = ?,
            posterPath = ?,
            backdropPath = ?,
            overview = ?,
            rating = ?,
            genres = ?
          WHERE id = ?
        `).run(
                    hit.title || movie.title,
                    hit.id,
                    hit.poster_path,
                    hit.backdrop_path,
                    hit.overview,
                    hit.vote_average,
                    genres,
                    movie.id
                );

                return NextResponse.json({ success: true, title: hit.title });
            } else {
                return NextResponse.json({ error: 'No TMDB match found' }, { status: 404 });
            }
        } else {
            const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(id) as any;
            if (!show) {
                return NextResponse.json({ error: 'Show not found' }, { status: 404 });
            }

            const searchTitle = cleanTitleForSearch(show.title);
            const res = await moviedb.searchTv({ query: searchTitle });

            if (res.results && res.results.length > 0) {
                const hit = res.results[0];
                const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'tv') : '';

                db.prepare(`
          UPDATE shows SET 
            title = ?,
            tmdbId = ?,
            posterPath = ?,
            backdropPath = ?,
            overview = ?,
            rating = ?,
            genres = ?
          WHERE id = ?
        `).run(
                    hit.name || show.title,
                    hit.id,
                    hit.poster_path,
                    hit.backdrop_path,
                    hit.overview,
                    hit.vote_average,
                    genres,
                    show.id
                );

                return NextResponse.json({ success: true, title: hit.name });
            } else {
                return NextResponse.json({ error: 'No TMDB match found' }, { status: 404 });
            }
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
