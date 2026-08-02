import { NextResponse } from 'next/server';
import db from '@/lib/db';
import movieReleaseMonitor from '@/lib/movieReleaseMonitor';
import { apiErrorResponse, readJsonObject } from '@/lib/apiSecurity';
import { parsePositiveInt } from '@/lib/security';

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
  } catch (e) {
    return apiErrorResponse(e);
  }
}

// POST — manually trigger a check for a specific movie
export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req);
    const tmdbId = parsePositiveInt(body.tmdbId);

    if (!tmdbId) {
      return NextResponse.json({ error: 'Missing or invalid tmdbId' }, { status: 400 });
    }

    const result = await movieReleaseMonitor.checkSingleMovie(tmdbId);

    return NextResponse.json({
      success: true,
      available: result.available,
      bestResult: result.bestResult,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

// PATCH — toggle trackRelease on/off for a watchlist item
export async function PATCH(req: Request) {
  try {
    const { id, tmdbId, trackRelease } = await readJsonObject(req);

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
  } catch (e) {
    return apiErrorResponse(e);
  }
}
