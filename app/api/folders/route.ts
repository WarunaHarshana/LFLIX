import { NextResponse } from 'next/server';
import db, { removeAutoTrackingForShow } from '@/lib/db';
import path from 'path';
import { getSafeErrorMessage, parsePositiveInt, validateExistingDirectory } from '@/lib/security';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Get all scanned folders
export async function GET() {
    try {
        const folders = db.prepare('SELECT * FROM scanned_folders ORDER BY addedAt DESC').all();
        return NextResponse.json(folders);
    } catch (e) {
        return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
    }
}

// Add a new folder
export async function POST(req: Request) {
    try {
        const { folderPath, contentType = 'auto' } = await req.json();

        if (!folderPath) {
            return NextResponse.json({ error: 'Missing folderPath' }, { status: 400 });
        }

        const validation = validateExistingDirectory(folderPath);
        if (validation.error !== null) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const folderName = path.basename(validation.path);

        db.prepare(`
      INSERT OR IGNORE INTO scanned_folders (folderPath, folderName, contentType)
      VALUES (?, ?, ?)
    `).run(validation.path, folderName, contentType);

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
    }
}

// Remove folder and its content
export async function DELETE(req: Request) {
    try {
        const url = new URL(req.url);
        const id = parsePositiveInt(url.searchParams.get('id'));

        if (!id) {
            return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }

        // Get the folder path
        const folder = db.prepare('SELECT folderPath FROM scanned_folders WHERE id = ?').get(id) as { folderPath: string } | undefined;

        if (!folder) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        const folderPath = folder.folderPath;
        
        // Use simple LIKE pattern - escape % and _ by wrapping them in []
        // This is SQLite's way of escaping without ESCAPE clause
        const escapedPath = folderPath
            .replace(/%/g, '[%]')
            .replace(/_/g, '[_]');
        const likePattern = `${escapedPath}%`;

        // Delete movies from this folder
        db.prepare("DELETE FROM movies WHERE filePath LIKE ?").run(likePattern);

        // Get shows that have episodes ONLY in this folder
        const showsToCheck = db.prepare(`
            SELECT DISTINCT showId FROM episodes WHERE filePath LIKE ?
        `).all(likePattern) as { showId: number }[];

        // Delete episodes from this folder
        db.prepare("DELETE FROM episodes WHERE filePath LIKE ?").run(likePattern);

        // Delete shows that no longer have any episodes
        for (const { showId } of showsToCheck) {
            const remaining = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE showId = ?').get(showId) as { count: number };
            if (remaining.count === 0) {
                removeAutoTrackingForShow(showId);
                db.prepare('DELETE FROM shows WHERE id = ?').run(showId);
            }
        }

        // Delete the folder record
        db.prepare('DELETE FROM scanned_folders WHERE id = ?').run(id);

        return NextResponse.json({ success: true, message: 'Folder removed from library' });
    } catch (e) {
        console.error('Delete folder error:', e);
        return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
    }
}
