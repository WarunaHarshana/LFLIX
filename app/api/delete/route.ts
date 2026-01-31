import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type');
        const id = searchParams.get('id');

        if (!type || !id) {
            return NextResponse.json({ error: 'Missing type or id' }, { status: 400 });
        }

        if (type === 'movie') {
            db.prepare('DELETE FROM movies WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE contentType = ? AND contentId = ?').run('movie', id);
        } else if (type === 'show') {
            // Delete all episodes first
            db.prepare('DELETE FROM episodes WHERE showId = ?').run(id);
            db.prepare('DELETE FROM shows WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE contentType = ? AND contentId = ?').run('show', id);
        } else if (type === 'episode') {
            db.prepare('DELETE FROM episodes WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE episodeId = ?').run(id);
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
