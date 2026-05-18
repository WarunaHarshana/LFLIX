import { NextResponse } from 'next/server';
import db from '@/lib/db';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

type LocalSearchResult = {
    id: number;
    type: 'movie' | 'show';
    title: string;
    posterPath: string | null;
    year?: number | null;
    firstAirDate?: string | null;
    rating: number | null;
    imdbRating?: number | null;
    filePath?: string;
};

function buildFtsQuery(query: string): string | null {
    const tokens = query
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter(token => token.length > 0)
        .slice(0, 8);

    if (!tokens || tokens.length === 0) return null;
    return tokens.map(token => `${token}*`).join(' ');
}

function searchWithLike(query: string): LocalSearchResult[] {
    const searchTerm = `%${query}%`;

    const movies = db.prepare(`
      SELECT id, 'movie' as type, title, posterPath, year, rating, imdbRating, filePath
      FROM movies 
      WHERE title LIKE ? OR fileName LIKE ?
      ORDER BY COALESCE(imdbRating, rating) DESC
      LIMIT 10
    `).all(searchTerm, searchTerm) as LocalSearchResult[];

    const shows = db.prepare(`
      SELECT id, 'show' as type, title, posterPath, firstAirDate, rating, imdbRating
      FROM shows 
      WHERE title LIKE ?
      ORDER BY COALESCE(imdbRating, rating) DESC
      LIMIT 10
    `).all(searchTerm) as LocalSearchResult[];

    return [...movies, ...shows];
}

function searchWithFts(ftsQuery: string): LocalSearchResult[] {
    const movies = db.prepare(`
      SELECT m.id, 'movie' as type, m.title, m.posterPath, m.year, m.rating, m.imdbRating, m.filePath
      FROM movie_search_fts fts
      JOIN movies m ON m.id = fts.rowid
      WHERE movie_search_fts MATCH ?
      ORDER BY bm25(movie_search_fts), COALESCE(m.imdbRating, m.rating) DESC
      LIMIT 10
    `).all(ftsQuery) as LocalSearchResult[];

    const shows = db.prepare(`
      SELECT s.id, 'show' as type, s.title, s.posterPath, s.firstAirDate, s.rating, s.imdbRating
      FROM show_search_fts fts
      JOIN shows s ON s.id = fts.rowid
      WHERE show_search_fts MATCH ?
      ORDER BY bm25(show_search_fts), COALESCE(s.imdbRating, s.rating) DESC
      LIMIT 10
    `).all(ftsQuery) as LocalSearchResult[];

    return [...movies, ...shows];
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');

        if (!query || query.trim().length < 2) {
            return NextResponse.json([]);
        }

        const trimmedQuery = query.trim();
        const ftsQuery = buildFtsQuery(trimmedQuery);
        let rawResults: LocalSearchResult[];

        if (ftsQuery) {
            try {
                rawResults = searchWithFts(ftsQuery);
            } catch (error) {
                console.warn('[Search] FTS lookup failed, falling back to LIKE search:', error);
                rawResults = searchWithLike(trimmedQuery);
            }
        } else {
            rawResults = searchWithLike(trimmedQuery);
        }

        const results = rawResults
            .sort((a, b) => ((b.imdbRating ?? b.rating) || 0) - ((a.imdbRating ?? a.rating) || 0))
            .slice(0, 15);

        return NextResponse.json(results);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
