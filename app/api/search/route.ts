import { NextResponse } from 'next/server';
import db from '@/lib/db';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');

        if (!query || query.trim().length < 2) {
            return NextResponse.json([]);
        }

        const searchTerm = `%${query.trim()}%`;

        const movies = db.prepare(`
      SELECT id, 'movie' as type, title, posterPath, year, rating, filePath
      FROM movies 
      WHERE title LIKE ?
      ORDER BY rating DESC
      LIMIT 10
    `).all(searchTerm);

        const shows = db.prepare(`
      SELECT id, 'show' as type, title, posterPath, firstAirDate, rating
      FROM shows 
      WHERE title LIKE ?
      ORDER BY rating DESC
      LIMIT 10
    `).all(searchTerm);

        const results = [...movies, ...shows]
            .sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0))
            .slice(0, 15);

        return NextResponse.json(results);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
