import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db, { removeAutoTrackingForShow } from '@/lib/db';
import { getSafeErrorMessage, isPathInsideAny, parsePositiveInt, validateExistingFile } from '@/lib/security';
import { apiErrorResponse } from '@/lib/apiSecurity';

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
        libraryRoots.push(path.join(process.cwd(), 'downloads'));
        try {
            const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath') as { value: string } | undefined;
            if (setting?.value) libraryRoots.push(setting.value);
        } catch { /* ignore */ }

        const tryDeleteFileAsync = async (filePath: string | null | undefined): Promise<boolean> => {
            if (!filePath) return false;
            if (!deleteFile) return true;

            try {
                const file = validateExistingFile(filePath);
                if (file.error !== null) {
                    if (file.error === 'File does not exist') {
                        // File already removed from disk, allow DB removal
                        return true;
                    }
                    fileErrors.push(`${filePath}: ${file.error}`);
                    return false;
                }
                if (!isPathInsideAny(file.path, libraryRoots)) {
                    fileErrors.push(`${filePath}: outside scanned library folders`);
                    return false;
                }

                let attempts = 0;
                let lastErr: unknown = null;
                while (attempts < 4) {
                    try {
                        fs.rmSync(file.path, { force: true });
                        filesDeleted++;

                        // Clean up empty movie folders or empty TV Season / Show folders
                        try {
                            const { cleanupEmptyMediaDirectories } = require('@/lib/mediaOrganizer');
                            cleanupEmptyMediaDirectories(file.path);
                        } catch { /* ignore */ }

                        return true;
                    } catch (err: any) {
                        lastErr = err;
                        attempts++;
                        if (attempts < 4) {
                            await new Promise((resolve) => setTimeout(resolve, 200 * attempts));
                        }
                    }
                }

                const rawMsg = getSafeErrorMessage(lastErr);
                const friendlyMsg = rawMsg.includes('EBUSY') || rawMsg.includes('EPERM')
                    ? `File is locked by another process (e.g. video player or indexer). Please close any player using it and try again.`
                    : rawMsg;
                fileErrors.push(`${filePath}: ${friendlyMsg}`);
                return false;
            } catch (e) {
                fileErrors.push(`${filePath}: ${getSafeErrorMessage(e)}`);
                return false;
            }
        };

        if (type === 'movie') {
            const movie = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
            if (!movie) {
                return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
            }

            if (deleteFile) {
                const deleted = await tryDeleteFileAsync(movie.filePath);
                if (!deleted) {
                    return NextResponse.json({
                        success: false,
                        error: fileErrors[0] || 'Failed to delete movie file from disk',
                        filesDeleted,
                        fileErrors
                    }, { status: 409 });
                }
            }

            db.prepare('DELETE FROM movies WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE contentType = ? AND contentId = ?').run('movie', id);
        } else if (type === 'show') {
            const episodes = db.prepare('SELECT id, filePath FROM episodes WHERE showId = ?').all(id) as { id: number; filePath: string }[];

            const failedEpisodes: number[] = [];
            for (const ep of episodes) {
                if (deleteFile) {
                    const deleted = await tryDeleteFileAsync(ep.filePath);
                    if (!deleted) {
                        failedEpisodes.push(ep.id);
                        continue;
                    }
                }
                db.prepare('DELETE FROM episodes WHERE id = ?').run(ep.id);
                db.prepare('DELETE FROM watch_history WHERE episodeId = ?').run(ep.id);
            }

            if (failedEpisodes.length === 0) {
                removeAutoTrackingForShow(id);
                db.prepare('DELETE FROM shows WHERE id = ?').run(id);
                db.prepare('DELETE FROM watch_history WHERE contentType = ? AND contentId = ?').run('show', id);
            } else {
                return NextResponse.json({
                    success: false,
                    error: `Failed to delete ${failedEpisodes.length} episode file(s) from disk. They remain in library.`,
                    filesDeleted,
                    fileErrors
                }, { status: 409 });
            }
        } else if (type === 'episode') {
            const episode = db.prepare('SELECT showId, filePath FROM episodes WHERE id = ?').get(id) as { showId: number; filePath: string } | undefined;
            if (!episode) {
                return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
            }

            if (deleteFile) {
                const deleted = await tryDeleteFileAsync(episode.filePath);
                if (!deleted) {
                    return NextResponse.json({
                        success: false,
                        error: fileErrors[0] || 'Failed to delete episode file from disk',
                        filesDeleted,
                        fileErrors
                    }, { status: 409 });
                }
            }

            db.prepare('DELETE FROM episodes WHERE id = ?').run(id);
            db.prepare('DELETE FROM watch_history WHERE episodeId = ?').run(id);

            // Cleanup orphan shows (after single episode delete)
            if (episode.showId) {
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
    } catch (e) {
        return apiErrorResponse(e);
    }
}
