import fs from 'fs';
import path from 'path';
import db from './db';
import { detectTvShow, isExtrasContent, isSampleClip, isVideoFile } from './mediaNaming';
import { normalizeShowName } from './metadata';
import { isPathInsideAny } from './security';

/**
 * Move a file across filesystems/drives safely.
 * If fs.renameSync fails with EXDEV, copies and unlinks.
 */
export function moveFileSafe(srcPath: string, destPath: string): void {
  if (path.resolve(srcPath) === path.resolve(destPath)) {
    return;
  }

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    fs.renameSync(srcPath, destPath);
  } catch (err: any) {
    if (err?.code === 'EXDEV' || err?.code === 'EPERM' || err?.code === 'EBUSY') {
      fs.copyFileSync(srcPath, destPath);
      try {
        fs.unlinkSync(srcPath);
      } catch { /* ignore unlink error */ }
    } else {
      throw err;
    }
  }
}

/**
 * Get or create the TV Shows directory inside the base download directory.
 * If 'TV Shows' or 'TV shows' or 'tv shows' exists, uses that. Otherwise creates 'TV Shows'.
 */
export function getTvShowsDirectory(baseDownloadPath?: string): string {
  let downloadRoot = baseDownloadPath;

  if (!downloadRoot) {
    try {
      const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath') as { value: string } | undefined;
      if (setting?.value && fs.existsSync(setting.value)) {
        downloadRoot = setting.value;
      }
    } catch { /* ignore */ }
  }

  if (!downloadRoot) {
    downloadRoot = path.join(process.cwd(), 'downloads');
  }

  if (!fs.existsSync(downloadRoot)) {
    fs.mkdirSync(downloadRoot, { recursive: true });
  }

  // Check actual filesystem entries to preserve existing casing/names (e.g. "tv shows", "Shows", etc.)
  try {
    const entries = fs.readdirSync(downloadRoot);
    const existing = entries.find(e => {
      const lower = e.toLowerCase();
      if (lower === 'tv shows' || lower === 'shows' || lower === 'tv') {
        try {
          return fs.statSync(path.join(downloadRoot!, e)).isDirectory();
        } catch {
          return false;
        }
      }
      return false;
    });

    if (existing) {
      return path.join(downloadRoot, existing);
    }
  } catch { /* ignore */ }

  const defaultTvShowsPath = path.join(downloadRoot, 'TV Shows');
  if (!fs.existsSync(defaultTvShowsPath)) {
    fs.mkdirSync(defaultTvShowsPath, { recursive: true });
  }

  return defaultTvShowsPath;
}

/**
 * Format a season folder name.
 * If the show directory already has "Season 01" style folders, match that padding; otherwise default to "Season X".
 */
export function formatSeasonFolderName(showDir: string, seasonNumber: number): string {
  const pad2 = `Season ${String(seasonNumber).padStart(2, '0')}`;
  const pad1 = `Season ${seasonNumber}`;

  if (fs.existsSync(showDir)) {
    try {
      const entries = fs.readdirSync(showDir);
      // If the exact season already exists with any casing/padding, reuse that
      const exactMatch = entries.find(e => new RegExp(`^Season\\s+0*${seasonNumber}$`, 'i').test(e));
      if (exactMatch) return exactMatch;

      // If any existing Season folder uses 2-digit padding (e.g. "Season 01"), match that format
      const has2DigitSeason = entries.some(e => /^Season\s+\d{2,}$/i.test(e));
      if (has2DigitSeason) {
        return pad2;
      }
    } catch { /* ignore */ }
  }

  return pad1;
}

/**
 * Clean a show title so it is suitable for filesystem folder naming.
 */
export function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]+/g, '') // remove invalid filesystem characters
    .replace(/\s+/g, ' ')
    .trim();
}

export interface OrganizeResult {
  moved: boolean;
  oldPath?: string;
  newPath?: string;
  showTitle?: string;
  seasonNumber?: number;
  error?: string;
}

/**
 * Organize a single TV show episode video file into the proper TV Shows/<Show Name>/Season <N>/ structure.
 */
export async function organizeTvEpisodeFile(
  filePath: string,
  options?: {
    baseDownloadPath?: string;
    showTitleHint?: string;
    deleteSourceFolderIfEmpty?: boolean;
  }
): Promise<OrganizeResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return { moved: false, error: 'File does not exist' };
    }

    if (!isVideoFile(filePath) || isSampleClip(filePath) || isExtrasContent(filePath)) {
      return { moved: false, error: 'Not a valid media file' };
    }

    const fileName = path.basename(filePath);
    const tvInfo = detectTvShow(fileName);

    if (!tvInfo && !options?.showTitleHint) {
      return { moved: false, error: 'Not recognized as a TV show episode' };
    }

    const rawShowName = options?.showTitleHint || (tvInfo ? tvInfo.name : '');
    const cleanShowName = sanitizeFolderName(normalizeShowName(rawShowName) || rawShowName);
    const seasonNumber = tvInfo ? tvInfo.season : 1;

    if (!cleanShowName) {
      return { moved: false, error: 'Could not determine show title' };
    }

    const tvShowsDir = getTvShowsDirectory(options?.baseDownloadPath);
    const showDir = path.join(tvShowsDir, cleanShowName);
    const seasonFolderName = formatSeasonFolderName(showDir, seasonNumber);
    const targetSeasonDir = path.join(showDir, seasonFolderName);

    if (!fs.existsSync(targetSeasonDir)) {
      fs.mkdirSync(targetSeasonDir, { recursive: true });
    }

    const targetFilePath = path.join(targetSeasonDir, fileName);

    // If already in the target location, nothing to move
    if (path.resolve(filePath) === path.resolve(targetFilePath)) {
      return { moved: false, newPath: targetFilePath, showTitle: cleanShowName, seasonNumber };
    }

    const originalParentDir = path.dirname(filePath);

    // Move the file
    moveFileSafe(filePath, targetFilePath);
    console.log(`[MediaOrganizer] Moved "${fileName}" to "${targetFilePath}"`);

    // Update database records for this file path
    try {
      db.prepare('UPDATE episodes SET filePath = ?, fileName = ? WHERE filePath = ? OR filePath = ?')
        .run(targetFilePath, fileName, filePath, filePath.replace(/\\/g, '/'));
      db.prepare('DELETE FROM movies WHERE filePath = ? OR filePath = ?')
        .run(filePath, filePath.replace(/\\/g, '/'));
    } catch (e) {
      console.warn('[MediaOrganizer] Failed to update DB path for moved file:', e);
    }

    // Clean up empty or junk source folder if requested
    if (options?.deleteSourceFolderIfEmpty) {
      cleanupJunkDirectory(originalParentDir, options.baseDownloadPath);
    }

    return {
      moved: true,
      oldPath: filePath,
      newPath: targetFilePath,
      showTitle: cleanShowName,
      seasonNumber,
    };
  } catch (e: any) {
    console.error(`[MediaOrganizer] Error organizing ${filePath}:`, e);
    return { moved: false, error: e?.message || String(e) };
  }
}

/**
 * Safely delete a directory if it only contains junk files (nfo, txt, url, sample, empty dirs)
 * and is inside the downloads directory. Never delete the root downloads folder, TV Shows folder,
 * or user library folders.
 */
export function cleanupJunkDirectory(dirPath: string, baseDownloadPath?: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) return false;

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return false;

    const resolved = path.resolve(dirPath);
    const downloadRoot = path.resolve(baseDownloadPath || getTvShowsDirectory(baseDownloadPath).replace(/[/\\]TV Shows$/i, ''));
    const tvShowsRoot = path.resolve(getTvShowsDirectory(baseDownloadPath));

    // Never delete download root or TV Shows root
    if (resolved === downloadRoot || resolved === tvShowsRoot) {
      return false;
    }

    // Must be inside the download root or a scanned folder
    const allowedRoots = [downloadRoot];
    try {
      const folders = db.prepare('SELECT folderPath FROM scanned_folders').all() as { folderPath: string }[];
      allowedRoots.push(...folders.map(f => path.resolve(f.folderPath)));
    } catch { /* ignore */ }

    if (!isPathInsideAny(resolved, allowedRoots)) {
      return false;
    }

    // Check if there are any remaining valid video files
    const allFiles = getFilesRecursive(resolved);
    const hasValidVideo = allFiles.some(f => isVideoFile(f) && !isSampleClip(f) && !isExtrasContent(f));

    if (hasValidVideo) {
      return false; // Still contains video files, don't delete
    }

    console.log(`[MediaOrganizer] Deleting junk/empty torrent directory: "${resolved}"`);
    fs.rmSync(resolved, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.warn(`[MediaOrganizer] Failed to cleanup directory "${dirPath}":`, e);
    return false;
  }
}

function getFilesRecursive(dir: string, list: string[] = []): string[] {
  if (!fs.existsSync(dir)) return list;
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        getFilesRecursive(fullPath, list);
      } else {
        list.push(fullPath);
      }
    }
  } catch { /* ignore */ }
  return list;
}

/**
 * Organize all files from a completed download (torrent or HTTP).
 * Moves TV episodes to TV Shows/<Show Name>/Season <N>/ and deletes temporary torrent folders.
 */
export async function organizeDownloadedItem(
  downloadPath: string,
  torrentNameOrFilename?: string | null
): Promise<{ organizedFiles: string[]; deletedFolders: string[] }> {
  const organizedFiles: string[] = [];
  const deletedFolders: string[] = [];

  try {
    const targetDir = torrentNameOrFilename
      ? path.join(downloadPath, torrentNameOrFilename)
      : downloadPath;

    if (!fs.existsSync(targetDir)) {
      return { organizedFiles, deletedFolders };
    }

    const stat = fs.statSync(targetDir);

    if (stat.isFile()) {
      // Single file download
      if (isVideoFile(targetDir) && detectTvShow(path.basename(targetDir))) {
        const result = await organizeTvEpisodeFile(targetDir, { baseDownloadPath: downloadPath });
        if (result.moved && result.newPath) {
          organizedFiles.push(result.newPath);
        }
      }
    } else if (stat.isDirectory()) {
      // Multi-file folder download (typical for torrents)
      const allFiles = getFilesRecursive(targetDir);
      const videoFiles = allFiles.filter(f => isVideoFile(f) && !isSampleClip(f) && !isExtrasContent(f));

      for (const videoFile of videoFiles) {
        if (detectTvShow(path.basename(videoFile))) {
          const result = await organizeTvEpisodeFile(videoFile, {
            baseDownloadPath: downloadPath,
            deleteSourceFolderIfEmpty: false,
          });
          if (result.moved && result.newPath) {
            organizedFiles.push(result.newPath);
          }
        }
      }

      // If this was a subfolder inside downloadPath, cleanup the torrent subfolder
      if (path.resolve(targetDir) !== path.resolve(downloadPath)) {
        const cleaned = cleanupJunkDirectory(targetDir, downloadPath);
        if (cleaned) {
          deletedFolders.push(targetDir);
        }
      }
    }
  } catch (e) {
    console.error('[MediaOrganizer] organizeDownloadedItem error:', e);
  }

  return { organizedFiles, deletedFolders };
}

/**
 * Scan the download directory for loose TV show episodes (e.g. dropped directly into downloads root
 * or into loose torrent subfolders) and organize them into TV Shows/<Show Name>/Season <N>/.
 */
export async function organizeLooseTvShowsInDownloads(
  baseDownloadPath?: string
): Promise<{ organized: number; errors: string[] }> {
  let organized = 0;
  const errors: string[] = [];

  try {
    const tvShowsDir = getTvShowsDirectory(baseDownloadPath);
    const downloadRoot = path.dirname(tvShowsDir);

    if (!fs.existsSync(downloadRoot)) {
      return { organized: 0, errors: [] };
    }

    const entries = fs.readdirSync(downloadRoot);

    for (const entry of entries) {
      const fullPath = path.join(downloadRoot, entry);
      try {
        const stat = fs.statSync(fullPath);

        // Skip the TV Shows folder itself and Movies folder
        if (stat.isDirectory()) {
          const normName = entry.toLowerCase();
          if (normName === 'tv shows' || normName === 'tv' || normName === 'shows') {
            continue;
          }
          if (normName.startsWith('.') || normName === 'node_modules' || normName === 'data') {
            continue;
          }

          // Check if this subfolder has TV episodes
          const files = getFilesRecursive(fullPath);
          const tvFiles = files.filter(f => isVideoFile(f) && !isSampleClip(f) && !isExtrasContent(f) && detectTvShow(path.basename(f)));

          if (tvFiles.length > 0) {
            for (const file of tvFiles) {
              const res = await organizeTvEpisodeFile(file, { baseDownloadPath: downloadRoot });
              if (res.moved) {
                organized++;
              }
            }
            cleanupJunkDirectory(fullPath, downloadRoot);
          }
        } else if (stat.isFile() && isVideoFile(fullPath)) {
          // File directly in root download folder
          if (detectTvShow(entry)) {
            const res = await organizeTvEpisodeFile(fullPath, { baseDownloadPath: downloadRoot });
            if (res.moved) {
              organized++;
            }
          }
        }
      } catch (e: any) {
        errors.push(`${entry}: ${e?.message || String(e)}`);
      }
    }
  } catch (e: any) {
    errors.push(`Loose organization error: ${e?.message || String(e)}`);
  }

  if (organized > 0) {
    console.log(`[MediaOrganizer] Auto-organized ${organized} loose TV episode(s) in downloads`);
  }

  return { organized, errors };
}

/**
 * Clean up empty parent directories after a media file is deleted.
 * - For movies: deletes the movie folder if it only contained that movie and has no other video files.
 * - For TV shows: deletes the Season folder if no episodes remain, and deletes the Show folder if no episodes/seasons remain.
 * - Never deletes protected root folders (downloads, TV Shows, Movies, or scanned library roots).
 */
export function cleanupEmptyMediaDirectories(filePath: string): { cleanedDirs: string[] } {
  const cleanedDirs: string[] = [];
  try {
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) return { cleanedDirs };

    // Get all protected root folders that should NEVER be deleted
    const protectedRoots = new Set<string>();
    protectedRoots.add(path.resolve(process.cwd(), 'downloads'));

    try {
      const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath') as { value: string } | undefined;
      if (setting?.value) protectedRoots.add(path.resolve(setting.value));
    } catch { /* ignore */ }

    try {
      const folders = db.prepare('SELECT folderPath FROM scanned_folders').all() as { folderPath: string }[];
      for (const f of folders) {
        protectedRoots.add(path.resolve(f.folderPath));
        protectedRoots.add(path.resolve(path.join(f.folderPath, 'TV Shows')));
        protectedRoots.add(path.resolve(path.join(f.folderPath, 'Movies')));
      }
    } catch { /* ignore */ }

    const isProtected = (dir: string) => {
      const resolved = path.resolve(dir);
      if (protectedRoots.has(resolved)) return true;
      const base = path.basename(resolved).toLowerCase();
      if (base === 'tv shows' || base === 'movies' || base === 'downloads') return true;
      return false;
    };

    const hasVideoFiles = (dir: string): boolean => {
      if (!fs.existsSync(dir)) return false;
      const files = getFilesRecursive(dir);
      return files.some(f => isVideoFile(f) && !isSampleClip(f) && !isExtrasContent(f));
    };

    // Check parent directory (e.g. Season folder or movie folder)
    if (!isProtected(parentDir) && !hasVideoFiles(parentDir)) {
      console.log(`[MediaOrganizer] Removing empty media folder: "${parentDir}"`);
      fs.rmSync(parentDir, { recursive: true, force: true });
      cleanedDirs.push(parentDir);

      // If parent was a Season folder (or inside TV Shows), check grandparent directory (Show folder)
      const isSeasonDir = /^Season\s+\d+$/i.test(path.basename(parentDir));
      const grandParentDir = path.dirname(parentDir);
      const isInsideTvShows = path.basename(path.dirname(grandParentDir)).toLowerCase() === 'tv shows';

      if ((isSeasonDir || isInsideTvShows) && !isProtected(grandParentDir) && !hasVideoFiles(grandParentDir)) {
        console.log(`[MediaOrganizer] Removing empty show folder: "${grandParentDir}"`);
        fs.rmSync(grandParentDir, { recursive: true, force: true });
        cleanedDirs.push(grandParentDir);
      }
    }
  } catch (e) {
    console.warn('[MediaOrganizer] cleanupEmptyMediaDirectories error:', e);
  }
  return { cleanedDirs };
}

