import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { apiErrorResponse } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // SECURITY: Don't expose filePath - select only safe columns
    const movies = db.prepare(`
      SELECT id, title, year, tmdbId, posterPath, backdropPath, 
             overview, rating, imdbRating, genres, addedAt
      FROM movies 
      ORDER BY addedAt DESC
    `).all();
    return NextResponse.json(movies);
  } catch (e) {
    return apiErrorResponse(e);
  }
}
