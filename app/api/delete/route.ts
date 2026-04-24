import { NextResponse } from 'next/server';
import fs from 'fs';
import db, { removeAutoTrackingForShow } from '@/lib/db';
import { getSafeErrorMessage, isPathInsideAny, parsePositiveInt, validateExistingFile } from '@/lib/security';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type');
        const id = parsePositiveInt(searchParams.get('id'));
        const deleteFile = searchParams.get('deleteFile') === '1';

        if (!type || !id) {
            return NextResponse.json({ error: 'Missing type or id' }, { status: 400 });
        }

        let filesDeleted = 0;
        const fileErrors: string[] = [];
        const libraryRoots = (db.prepare('SELECT folderPath FROM scanned_folders').all() as { folderPath: string }[])
            .map((folder) => folder.folderPath);

        const tryDeleteFile = (filePath: string | null | undefined) => {
            if (!deleteFile || !filePath) return;
            try {
                const file = validateExistingFile(filePath);
                if (file.error !== null) {
                    if (file.error !== 'File does not exist') {
                        fileErrors.push(`${filePath}: ${file.error}`);
                    }
                    return;
                }
                if (!isPathInsideAny(file.path, libraryRoots)) {
                    fileErrors.push(`${filePath}: outside scanned library folders`);
                    return;
                }
                fs.unlinkSync(file.path);
                filesDeleted++;
            } catch (e) {
                fileErrors.push(`${filePath}: ${getSafeErrorMessage(e)}`);
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
            removeAutoTrackingForShow(id);
            db.prepare('DELETE FROM shows WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE contentType = ? AND contentId = ?').run('show', id);
        } else if (type === 'episode') {
            const episode = db.prepare('SELECT showId, filePath FROM episodes WHERE id = ?').get(id) as { showId: number; filePath: string } | undefined;
            tryDeleteFile(episode?.filePath);

            db.prepare('DELETE FROM episodes WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE episodeId = ?').run(id);

            // Cleanup orphan shows (after single episode delete)
            if (episode?.showId) {
                const remaining = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE showId = ?').get(episode.showId) as { count: number };
                if (remaining.count === 0) {
                    removeAutoTrackingForShow(episode.showId);
                    db.prepare('DELETE FROM shows WHERE id = ?').run(episode.showId);
                }
            }
        } else {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        return NextResponse.json({ success: true, filesDeleted, fileErrors: fileErrors.length ? fileErrors : undefined });
    } catch (e: any) {
        return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
    }
}
