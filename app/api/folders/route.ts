import { NextResponse } from 'next/server';
import db from '@/lib/db';
import path from 'path';
import fs from 'fs';

// Validate ID is a positive integer
function validateId(id: any): id is number {
  return Number.isInteger(id) && id > 0;
}

// SECURITY: Validate folder path to prevent directory traversal
function validateFolderPath(folderPath: string): { valid: boolean; error?: string } {
  // Check for null bytes (path injection)
  if (folderPath.includes('\0')) {
    return { valid: false, error: 'Invalid path' };
  }

  // Normalize the path
  const normalizedPath = path.normalize(folderPath);

  // Check for path traversal attempts (..)
  if (normalizedPath.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  // Must be an absolute path
  if (!path.isAbsolute(normalizedPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  return { valid: true };
}

// Get all scanned folders
export async function GET() {
    try {
        const folders = db.prepare('SELECT * FROM scanned_folders ORDER BY addedAt DESC').all();
        return NextResponse.json(folders);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// Add a new folder
export async function POST(req: Request) {
    try {
        const { folderPath, contentType = 'auto' } = await req.json();

        if (!folderPath) {
            return NextResponse.json({ error: 'Missing folderPath' }, { status: 400 });
        }

        // Validate folder path
        const validation = validateFolderPath(folderPath);
        if (!validation.valid) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        // Check if folder exists
        if (!fs.existsSync(folderPath)) {
            return NextResponse.json({ error: 'Folder does not exist' }, { status: 404 });
        }

        const stat = fs.statSync(folderPath);
        if (!stat.isDirectory()) {
            return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
        }

        const folderName = path.basename(folderPath);

        db.prepare(`
      INSERT OR IGNORE INTO scanned_folders (folderPath, folderName, contentType)
      VALUES (?, ?, ?)
    `).run(folderPath, folderName, contentType);

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// Remove folder and its content
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

        // Get the folder path
        const folder = db.prepare('SELECT folderPath FROM scanned_folders WHERE id = ?').get(id) as { folderPath: string } | undefined;

        if (folder) {
            const folderPath = folder.folderPath;
            // Escape special LIKE characters to prevent pattern interpretation
            const escapedPath = folderPath.replace(/[%_\\]/g, '\\$&');
            const likePattern = `${escapedPath}%`;

            // Delete movies from this folder
            db.prepare("DELETE FROM movies WHERE filePath LIKE ? ESCAPE '\\\\'").run(likePattern);

            // Get shows that have episodes ONLY in this folder
            const showsToCheck = db.prepare(`
        SELECT DISTINCT showId FROM episodes WHERE filePath LIKE ? ESCAPE '\\\\'
      `).all(likePattern) as { showId: number }[];

            // Delete episodes from this folder
            db.prepare("DELETE FROM episodes WHERE filePath LIKE ? ESCAPE '\\\\'").run(likePattern);

            // Delete shows that no longer have any episodes
            for (const { showId } of showsToCheck) {
                const remaining = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE showId = ?').get(showId) as { count: number };
                if (remaining.count === 0) {
                    db.prepare('DELETE FROM shows WHERE id = ?').run(showId);
                }
            }

            // Delete the folder record
            db.prepare('DELETE FROM scanned_folders WHERE id = ?').run(id);
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
