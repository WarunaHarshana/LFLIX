import { NextResponse } from 'next/server';
import db from '@/lib/db';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Validate ID is a positive integer
function validateId(id: any): id is number {
  return Number.isInteger(id) && id > 0;
}

// Get watch history / continue watching
export async function GET() {
  try {
    // SECURITY: Don't expose filePath columns - use contentId/episodeId only
    const history = db.prepare(`
      SELECT 
        wh.id,
        wh.contentType,
        wh.contentId,
        wh.episodeId,
        wh.progress,
        wh.duration,
        wh.completed,
        wh.lastWatched,
        CASE 
          WHEN wh.contentType = 'movie' THEN m.title
          WHEN wh.contentType = 'show' THEN s.title
        END as title,
        CASE 
          WHEN wh.contentType = 'movie' THEN m.posterPath
          WHEN wh.contentType = 'show' THEN s.posterPath
        END as posterPath,
        CASE 
          WHEN wh.contentType = 'movie' THEN m.backdropPath
          WHEN wh.contentType = 'show' THEN s.backdropPath
        END as backdropPath,
        e.seasonNumber,
        e.episodeNumber,
        e.title as episodeTitle
      FROM watch_history wh
      LEFT JOIN movies m ON wh.contentType = 'movie' AND wh.contentId = m.id
      LEFT JOIN shows s ON wh.contentType = 'show' AND wh.contentId = s.id
      LEFT JOIN episodes e ON wh.episodeId = e.id
      WHERE wh.completed = 0 AND wh.progress > 0
      ORDER BY wh.lastWatched DESC
      LIMIT 20
    `).all();

    return NextResponse.json(history);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Update watch progress
export async function POST(req: Request) {
  try {
    const { contentType, contentId, episodeId, progress, duration } = await req.json();

    if (!contentType || !contentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate contentType
    if (contentType !== 'movie' && contentType !== 'show') {
      return NextResponse.json({ error: 'Invalid contentType. Must be movie or show' }, { status: 400 });
    }

    // Validate IDs
    if (!validateId(contentId)) {
      return NextResponse.json({ error: 'Invalid contentId. Must be a positive integer' }, { status: 400 });
    }
    if (episodeId !== undefined && !validateId(episodeId)) {
      return NextResponse.json({ error: 'Invalid episodeId. Must be a positive integer' }, { status: 400 });
    }

    // Validate progress and duration are numbers
    if (progress !== undefined && (typeof progress !== 'number' || progress < 0)) {
      return NextResponse.json({ error: 'Invalid progress. Must be a non-negative number' }, { status: 400 });
    }
    if (duration !== undefined && (typeof duration !== 'number' || duration < 0)) {
      return NextResponse.json({ error: 'Invalid duration. Must be a non-negative number' }, { status: 400 });
    }

    const completed = (duration && duration > 0 && progress / duration > 0.9) ? 1 : 0;

    db.prepare(`
      INSERT INTO watch_history (contentType, contentId, episodeId, progress, duration, completed, lastWatched)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(contentType, contentId, episodeId) 
      DO UPDATE SET progress = ?, duration = ?, completed = ?, lastWatched = datetime('now')
    `).run(contentType, contentId, episodeId || null, progress, duration, completed, progress, duration, completed);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Clear history item
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get('id');

    if (!idParam) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const id = parseInt(idParam, 10);
    if (!validateId(id)) {
      return NextResponse.json({ error: 'Invalid id. Must be a positive integer' }, { status: 400 });
    }

    db.prepare('DELETE FROM watch_history WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
