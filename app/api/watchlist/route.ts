import { NextResponse } from 'next/server';
import db from '@/lib/db';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// GET — retrieve all watchlist items
export async function GET() {
    try {
        const items = db.prepare('SELECT * FROM watchlist ORDER BY addedAt DESC').all();
        return NextResponse.json({ items });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST — add item to watchlist
export async function POST(req: Request) {
    try {
        const { tmdbId, mediaType, title, posterPath, backdropPath, overview, rating, year, genres, notes } = await req.json();

        if (!tmdbId || !mediaType || !title) {
            return NextResponse.json({ error: 'Missing required fields: tmdbId, mediaType, title' }, { status: 400 });
        }

        if (mediaType !== 'movie' && mediaType !== 'tv') {
            return NextResponse.json({ error: 'mediaType must be "movie" or "tv"' }, { status: 400 });
        }

        const stmt = db.prepare(`
      INSERT OR IGNORE INTO watchlist (tmdbId, mediaType, title, posterPath, backdropPath, overview, rating, year, genres, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const result = stmt.run(
            tmdbId,
            mediaType,
            title,
            posterPath || null,
            backdropPath || null,
            overview || null,
            rating || null,
            year || null,
            genres || null,
            notes || null
        );

        if (result.changes === 0) {
            return NextResponse.json({ message: 'Already in watchlist', alreadyExists: true });
        }

        return NextResponse.json({ success: true, id: result.lastInsertRowid });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// DELETE — remove item from watchlist
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }

        db.prepare('DELETE FROM watchlist WHERE id = ?').run(parseInt(id));
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
