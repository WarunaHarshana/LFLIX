import { NextResponse } from 'next/server';
import fs from 'fs';
import db from '@/lib/db';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type');
        const id = searchParams.get('id');
        const deleteFile = searchParams.get('deleteFile') === '1';

        if (!type || !id) {
            return NextResponse.json({ error: 'Missing type or id' }, { status: 400 });
        }

        let filesDeleted = 0;
        const fileErrors: string[] = [];

        const tryDeleteFile = (filePath: string | null | undefined) => {
            if (!deleteFile || !filePath) return;
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    filesDeleted++;
                }
            } catch (e: any) {
                fileErrors.push(`${filePath}: ${e.message}`);
            }
        };

        if (type === 'movie') {
            const movie = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
            tryDeleteFile(movie?.filePath);

            db.prepare('DELETE FROM movies WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE contentType = ? AND contentId = ?').run('movie', id);
        } else if (type === 'show') {
            const episodes = db.prepare('SELECT id, filePath FROM episodes WHERE showId = ?').all(id) as { id: number; filePath: string }[];

            for (const ep of episodes) {
                tryDeleteFile(ep.filePath);
            }

            db.prepare('DELETE FROM episodes WHERE showId = ?').run(id);
            db.prepare('DELETE FROM shows WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE contentType = ? AND contentId = ?').run('show', id);
        } else if (type === 'episode') {
            const episode = db.prepare('SELECT filePath FROM episodes WHERE id = ?').get(id) as { filePath: string } | undefined;
            tryDeleteFile(episode?.filePath);

            db.prepare('DELETE FROM episodes WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE episodeId = ?').run(id);

            // Cleanup orphan shows (after single episode delete)
            db.prepare('DELETE FROM shows WHERE id NOT IN (SELECT DISTINCT showId FROM episodes)').run();
        } else {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        return NextResponse.json({ success: true, filesDeleted, fileErrors: fileErrors.length ? fileErrors : undefined });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
