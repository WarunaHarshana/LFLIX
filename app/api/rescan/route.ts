import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db, { cleanupOrphanedAutoTracks } from '@/lib/db';
import { scanFile, getVideoFiles } from '@/lib/scanner';
import { isItemPartOfActiveDownload } from '@/lib/mediaOrganizer';
import { apiErrorResponse } from '@/lib/apiSecurity';
import { getSafeErrorMessage } from '@/lib/security';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Get all watched folders
    const folders = db.prepare('SELECT folderPath FROM scanned_folders').all() as { folderPath: string }[];

    if (folders.length === 0) {
      return NextResponse.json({ error: 'No folders to scan' }, { status: 400 });
    }

    let totalAdded = 0;
    let totalRemoved = 0;
    const errors: string[] = [];

    // Auto-organize loose media (TV episodes & movies) in watched folders
    for (const { folderPath } of folders) {
      if (fs.existsSync(folderPath)) {
        try {
          const { organizeLooseMediaInDownloads } = await import('@/lib/mediaOrganizer');
          await organizeLooseMediaInDownloads(folderPath);
        } catch { /* ignore */ }
      }
    }

    // Scan each folder
    for (const { folderPath } of folders) {
      if (!fs.existsSync(folderPath)) {
        errors.push(`Folder not found: ${folderPath}`);
        continue;
      }

      // 1) Remove stale DB entries (files deleted/moved on disk)
      try {
        const movieRows = db
          .prepare('SELECT id, filePath FROM movies WHERE filePath LIKE ?')
          .all(`${folderPath}%`) as { id: number; filePath: string }[];

        for (const row of movieRows) {
          if (!fs.existsSync(row.filePath) || isItemPartOfActiveDownload(row.filePath)) {
            const deleted = db.prepare('DELETE FROM movies WHERE id = ?').run(row.id);
            totalRemoved += deleted.changes;
          }
        }

        const episodeRows = db
          .prepare('SELECT id, filePath FROM episodes WHERE filePath LIKE ?')
          .all(`${folderPath}%`) as { id: number; filePath: string }[];

        for (const row of episodeRows) {
          if (!fs.existsSync(row.filePath) || isItemPartOfActiveDownload(row.filePath)) {
            const deleted = db.prepare('DELETE FROM episodes WHERE id = ?').run(row.id);
            totalRemoved += deleted.changes;
          }
        }

        // Clean up orphan shows (no episodes left)
        db.prepare(`
          DELETE FROM shows
          WHERE id NOT IN (SELECT DISTINCT showId FROM episodes)
        `).run();
        cleanupOrphanedAutoTracks();
      } catch (e) {
        errors.push(`Cleanup error in ${folderPath}: ${getSafeErrorMessage(e)}`);
      }

      // 2) Add newly found files
      const videoFiles = getVideoFiles(folderPath);

      for (const filePath of videoFiles) {
        try {
          const result = await scanFile(filePath);
          if (result.added) {
            totalAdded++;
          }
        } catch (e) {
          errors.push(`Error scanning ${filePath}: ${getSafeErrorMessage(e)}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      folders: folders.length,
      added: totalAdded,
      removed: totalRemoved,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (e) {
    console.error('Rescan error:', e);
    return apiErrorResponse(e);
  }
}
