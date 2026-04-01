import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/history/mark - Mark a content item as watched or unwatched
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contentType, contentId, episodeId, watched } = body;

    if (!contentType || !contentId || typeof watched !== 'boolean') {
      return NextResponse.json(
        { error: 'contentType, contentId, and watched (boolean) are required' },
        { status: 400 }
      );
    }

    if (watched) {
      // Mark as watched: upsert watch_history with completed = 1, progress = duration
      if (contentType === 'show' && episodeId) {
        // Mark a specific episode as watched
        db.prepare(`
          INSERT INTO watch_history (contentType, contentId, episodeId, progress, duration, completed, lastWatched)
          VALUES ('show', ?, ?, 1, 1, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(contentType, contentId, episodeId)
          DO UPDATE SET completed = 1, progress = CASE WHEN duration > 0 THEN duration ELSE 1 END, lastWatched = CURRENT_TIMESTAMP
        `).run(contentId, episodeId);
      } else if (contentType === 'show') {
        // Mark ALL episodes of a show as watched
        const episodes = db.prepare('SELECT id FROM episodes WHERE showId = ?').all(contentId) as { id: number }[];
        const stmt = db.prepare(`
          INSERT INTO watch_history (contentType, contentId, episodeId, progress, duration, completed, lastWatched)
          VALUES ('show', ?, ?, 1, 1, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(contentType, contentId, episodeId)
          DO UPDATE SET completed = 1, progress = CASE WHEN duration > 0 THEN duration ELSE 1 END, lastWatched = CURRENT_TIMESTAMP
        `);
        const markAll = db.transaction(() => {
          for (const ep of episodes) {
            stmt.run(contentId, ep.id);
          }
        });
        markAll();
      } else {
        // Mark a movie as watched
        db.prepare(`
          INSERT INTO watch_history (contentType, contentId, episodeId, progress, duration, completed, lastWatched)
          VALUES ('movie', ?, NULL, 1, 1, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(contentType, contentId, episodeId)
          DO UPDATE SET completed = 1, progress = CASE WHEN duration > 0 THEN duration ELSE 1 END, lastWatched = CURRENT_TIMESTAMP
        `).run(contentId);
      }
    } else {
      // Mark as unwatched: delete watch_history entries
      if (contentType === 'show' && episodeId) {
        db.prepare(`DELETE FROM watch_history WHERE contentType = 'show' AND contentId = ? AND episodeId = ?`).run(contentId, episodeId);
      } else if (contentType === 'show') {
        // Remove ALL episode progress for this show
        db.prepare(`DELETE FROM watch_history WHERE contentType = 'show' AND contentId = ?`).run(contentId);
      } else {
        db.prepare(`DELETE FROM watch_history WHERE contentType = 'movie' AND contentId = ?`).run(contentId);
      }
    }

    return NextResponse.json({ success: true, watched });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
