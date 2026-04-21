import { NextResponse } from 'next/server';
import db from '@/lib/db';
import movieReleaseMonitor from '@/lib/movieReleaseMonitor';

export const dynamic = 'force-dynamic';

// GET — get tracking status for all watchlist movies
export async function GET() {
  try {
    // Join watchlist with movie_releases to get availability info
    const items = db.prepare(`
      SELECT
        w.id as watchlistId,
        w.tmdbId,
        w.title,
        w.posterPath,
        w.year,
        w.trackRelease,
        mr.isAvailable,
        mr.notified,
        mr.lastCheckedAt,
        mr.availableAt,
        mr.bestResult
      FROM watchlist w
      LEFT JOIN movie_releases mr ON w.tmdbId = mr.tmdbId
      WHERE w.mediaType = 'movie'
      ORDER BY w.addedAt DESC
    `).all();

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — manually trigger a check for a specific movie
export async function POST(req: Request) {
  try {
    const { tmdbId } = await req.json();

    if (!tmdbId) {
      return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 });
    }

    const result = await movieReleaseMonitor.checkSingleMovie(tmdbId);

    return NextResponse.json({
      success: true,
      available: result.available,
      bestResult: result.bestResult,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — toggle trackRelease on/off for a watchlist item
export async function PATCH(req: Request) {
  try {
    const { id, tmdbId, trackRelease } = await req.json();

    if (trackRelease === undefined) {
      return NextResponse.json({ error: 'Missing trackRelease field' }, { status: 400 });
    }

    if (id) {
      db.prepare('UPDATE watchlist SET trackRelease = ? WHERE id = ?')
        .run(trackRelease ? 1 : 0, id);
    } else if (tmdbId) {
      db.prepare("UPDATE watchlist SET trackRelease = ? WHERE tmdbId = ? AND mediaType = 'movie'")
        .run(trackRelease ? 1 : 0, tmdbId);
    } else {
      return NextResponse.json({ error: 'Missing id or tmdbId' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
