import { NextResponse } from 'next/server';
import db from '@/lib/db';
import releaseMonitor from '@/lib/releaseMonitor';

export const dynamic = 'force-dynamic';

// GET — list all tracked shows
export async function GET() {
  try {
    const tracked = db.prepare('SELECT * FROM auto_track ORDER BY addedAt DESC').all();
    return NextResponse.json({ tracked });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — add a show to auto-tracking
export async function POST(req: Request) {
  try {
    const { showId, tmdbId, title, qualityPreference } = await req.json();

    if (!showId || !tmdbId || !title) {
      return NextResponse.json({ error: 'Missing required fields: showId, tmdbId, title' }, { status: 400 });
    }

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO auto_track (showId, tmdbId, title, qualityPreference)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(showId, tmdbId, title, qualityPreference || 'best');

    if (result.changes === 0) {
      return NextResponse.json({ message: 'Already tracking this show', alreadyExists: true });
    }

    // Trigger an immediate check for this show
    const show = db.prepare('SELECT * FROM auto_track WHERE showId = ?').get(showId) as any;
    if (show) {
      // Run check in background (don't block the response)
      releaseMonitor.checkShow(show)
        .then(() => {
          db.prepare('UPDATE auto_track SET lastCheckedAt = CURRENT_TIMESTAMP WHERE id = ?').run(show.id);
        })
        .catch(e =>
          console.error('[AutoTrack] Initial check failed:', e)
        );
    }

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — update tracking settings
export async function PATCH(req: Request) {
  try {
    const { id, showId, enabled, qualityPreference } = await req.json();

    const trackId = id || showId;
    if (!trackId) {
      return NextResponse.json({ error: 'Missing id or showId' }, { status: 400 });
    }

    // Build update based on which field to use as identifier
    const field = id ? 'id' : 'showId';

    if (enabled !== undefined) {
      db.prepare(`UPDATE auto_track SET enabled = ? WHERE ${field} = ?`).run(enabled ? 1 : 0, trackId);
    }

    if (qualityPreference) {
      db.prepare(`UPDATE auto_track SET qualityPreference = ? WHERE ${field} = ?`).run(qualityPreference, trackId);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — remove show from auto-tracking
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const showId = searchParams.get('showId');

    if (!id && !showId) {
      return NextResponse.json({ error: 'Missing id or showId parameter' }, { status: 400 });
    }

    if (id) {
      db.prepare('DELETE FROM auto_track WHERE id = ?').run(parseInt(id));
    } else if (showId) {
      db.prepare('DELETE FROM auto_track WHERE showId = ?').run(parseInt(showId));
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
