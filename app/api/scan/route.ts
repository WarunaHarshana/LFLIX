import { NextResponse } from 'next/server';
import path from 'path';
import db from '@/lib/db';
import { getVideoFiles, isVideoFile, scanFile } from '@/lib/scanner';
import { clearEpisodeCache } from '@/lib/metadata';
import { isPathInside, validateExistingDirectory, validateExistingFile } from '@/lib/security';
import { apiErrorResponse, rateLimit, readJsonObject } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // A scan walks the filesystem and fans out to TMDB, so it is worth capping.
    const limited = rateLimit(req, 'scan', { windowMs: 60 * 1000, max: 10 });
    if (limited) return limited;

    const { folderPath, specificFile } = await readJsonObject(req, 64 * 1024);
    const folder = validateExistingDirectory(folderPath);

    if (folder.error !== null) {
      return NextResponse.json({ error: folder.error }, { status: 400 });
    }

    const folderName = path.basename(folder.path) || 'Media Folder';
    db.prepare(`
      INSERT OR IGNORE INTO scanned_folders (folderPath, folderName, contentType)
      VALUES (?, ?, 'auto')
    `).run(folder.path, folderName);

    let files: string[] = [];

    if (specificFile) {
      const file = validateExistingFile(specificFile);
      if (file.error !== null) {
        return NextResponse.json({ error: file.error }, { status: 400 });
      }
      if (!isPathInside(file.path, folder.path)) {
        return NextResponse.json({ error: 'File must be inside the scanned folder' }, { status: 400 });
      }
      if (!isVideoFile(file.path)) {
        return NextResponse.json({ error: 'File is not a supported video type' }, { status: 400 });
      }
      files = [file.path];
    } else {
      files = getVideoFiles(folder.path);
    }

    let addedCount = 0;
    const errors: string[] = [];

    for (const filePath of files) {
      const result = await scanFile(filePath);
      if (result.added) addedCount++;
      if (result.error) errors.push(`${filePath}: ${result.error}`);
    }

    clearEpisodeCache();

    return NextResponse.json({
      success: true,
      added: addedCount,
      totalFiles: files.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    console.error('Scan error:', e);
    return apiErrorResponse(e, 'Scan failed');
  }
}
