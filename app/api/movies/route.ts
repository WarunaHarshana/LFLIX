import { NextResponse } from 'next/server';
import db from '@/lib/db';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // SECURITY: Don't expose filePath - select only safe columns
    const movies = db.prepare(`
      SELECT id, title, year, tmdbId, posterPath, backdropPath, 
             overview, rating, genres, addedAt
      FROM movies 
      ORDER BY addedAt DESC
    `).all();
    return NextResponse.json(movies);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
