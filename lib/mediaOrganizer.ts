import fs from 'fs';
import path from 'path';
import db from './db';
import { detectTvShow, isExtrasContent, isSampleClip, isVideoFile } from './mediaNaming';
import { cleanFilename, extractYear, normalizeShowName } from './metadata';
import { isPathInsideAny } from './security';

const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.sub', '.idx', '.ass', '.ssa'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const STANDARD_ARTWORK_NAMES = [
  'folder',
  'poster',
  'cover',
  'backdrop',
  'fanart',
  'landscape',
  'logo',
  'clearart',
  'banner',
  'disc',
  'keyart',
  'thumb',
];

function isSubtitleFile(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  return SUBTITLE_EXTENSIONS.includes(ext);
}

function isAdOrJunkFile(fileName: string): boolean {
  return (
    /www\./i.test(fileName) ||
    /\.(?:com|net|org|cn|cc|me|top|xyz|site|vip)\b/i.test(fileName) ||
    /http[s]?:\/\//i.test(fileName) ||
    /【.*?(?:发布|访问|网址|电影|高清|水印).*?】/i.test(fileName) ||
    /qrcode|扫码|关注|广告|promo|sample/i.test(fileName)
  );
}

function isArtworkFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) return false;
  if (isAdOrJunkFile(fileName)) return false;

  const baseName = path.basename(fileName, ext).toLowerCase();
  if (STANDARD_ARTWORK_NAMES.includes(baseName)) return true;
  if (STANDARD_ARTWORK_NAMES.some(art => baseName.endsWith(`-${art}`) || baseName.endsWith(`_${art}`))) return true;

  return false;
}

export function moveCompanionFiles(sourceDir: string, targetDir: string, baseTargetName?: string): void {
  if (!fs.existsSync(sourceDir) || !fs.existsSync(targetDir)) return;
  if (path.resolve(sourceDir) === path.resolve(targetDir)) return;

  try {
    const entries = fs.readdirSync(sourceDir);
    for (const entry of entries) {
      const entryPath = path.join(sourceDir, entry);
      try {
        const stat = fs.statSync(entryPath);
        if (stat.isFile()) {
          if (isSubtitleFile(entry)) {
            const ext = path.extname(entry).toLowerCase();
            const langMatch = entry.match(/\.([a-z]{2,3})\.(?:srt|vtt|sub|idx|ass|ssa)$/i);
            const langSuffix = langMatch ? `.${langMatch[1].toLowerCase()}` : '';
            const targetSubName = baseTargetName ? `${baseTargetName}${langSuffix}${ext}` : entry;
            const destPath = path.join(targetDir, targetSubName);
            moveFileSafe(entryPath, destPath);
          } else if (isArtworkFile(entry)) {
            const destPath = path.join(targetDir, entry);
            moveFileSafe(entryPath, destPath);
          }
        } else if (stat.isDirectory() && /^(subs|subtitles)$/i.test(entry)) {
          const subFiles = fs.readdirSync(entryPath);
          for (const subFile of subFiles) {
            const subFilePath = path.join(entryPath, subFile);
            if (isSubtitleFile(subFile)) {
              const ext = path.extname(subFile).toLowerCase();
              const langMatch = subFile.match(/\.([a-z]{2,3})\.(?:srt|vtt|sub|idx|ass|ssa)$/i);
              const langSuffix = langMatch ? `.${langMatch[1].toLowerCase()}` : '';
              const targetSubName = baseTargetName ? `${baseTargetName}${langSuffix}${ext}` : subFile;
              const destSubDir = path.join(targetDir, entry);
              if (!fs.existsSync(destSubDir)) fs.mkdirSync(destSubDir, { recursive: true });
              moveFileSafe(subFilePath, path.join(destSubDir, targetSubName));
            }
          }
        }
      } catch { /* ignore single entry errors */ }
    }
  } catch { /* ignore read errors */ }
}

export function moveCompanionSubtitles(sourceDir: string, targetDir: string, baseTargetName?: string): void {
  moveCompanionFiles(sourceDir, targetDir, baseTargetName);
}

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
 * Resolves the root download directory:
 * 1. Explicit baseDownloadPath if passed
 * 2. settings.downloadPath from database
 * 3. Default cwd/downloads
 */
export function getDownloadRootDir(baseDownloadPath?: string): string {
  if (baseDownloadPath) return path.resolve(baseDownloadPath);
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath') as { value: string } | undefined;
    if (setting?.value && fs.existsSync(setting.value)) {
      return path.resolve(setting.value);
    }
  } catch { /* ignore */ }
  return path.resolve(process.cwd(), 'downloads');
}

export type ActiveDownloadItem = { name: string | null; magnetUri: string; downloadPath: string | null };

let activeDownloadsStmt: any = null;
export function getActiveDownloads(): ActiveDownloadItem[] {
  if (!activeDownloadsStmt) {
    activeDownloadsStmt = db.prepare(`
      SELECT name, magnetUri, downloadPath 
      FROM downloads 
      WHERE status IN ('metadata', 'downloading', 'stalled', 'paused', 'error', 'uploading')
    `);
  }
  return activeDownloadsStmt.all() as ActiveDownloadItem[];
}

/**
 * Check if a file or directory path belongs to an in-progress, paused, or stalled download.
 * Prevents media organization and file watching routines from moving or deleting partial downloads.
 */
export function isItemPartOfActiveDownload(
  itemPath: string,
  providedActiveDownloads?: ActiveDownloadItem[]
): boolean {
  if (!itemPath) return false;

  try {
    const resolvedItem = path.resolve(itemPath).toLowerCase();

    // Query non-completed downloads from database if not provided
    const activeDownloads = providedActiveDownloads || getActiveDownloads();

    if (!activeDownloads || activeDownloads.length === 0) {
      return false;
    }

    const defaultDownloadRoot = path.resolve(getDownloadRootDir()).toLowerCase();

    for (const dl of activeDownloads) {
      const rootDir = dl.downloadPath ? path.resolve(dl.downloadPath).toLowerCase() : defaultDownloadRoot;

      const candidateNames: string[] = [];
      if (dl.name && dl.name.trim()) {
        candidateNames.push(dl.name.trim());
      }

      // Extract display name (dn) from magnetUri if present
      if (dl.magnetUri && dl.magnetUri.startsWith('magnet:')) {
        const dnMatch = dl.magnetUri.match(/[?&]dn=([^&]+)/i);
        if (dnMatch) {
          try {
            const dn = decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')).trim();
            if (dn && !candidateNames.includes(dn)) {
              candidateNames.push(dn);
            }
          } catch { /* ignore */ }
        }
      }

      for (const name of candidateNames) {
        const candidatePath = path.resolve(rootDir, name).toLowerCase();

        // 1. Exact match (file or folder)
        if (resolvedItem === candidatePath) {
          return true;
        }

        // 2. The item is inside the active download folder
        if (resolvedItem.startsWith(candidatePath + path.sep)) {
          return true;
        }

        // 3. The candidate path is inside the item (e.g. itemPath is the folder containing the download)
        if (candidatePath.startsWith(resolvedItem + path.sep)) {
          return true;
        }

        // 4. Base name match in root download folder (e.g. direct file in download directory)
        const itemBaseName = path.basename(resolvedItem);
        const nameBaseName = path.basename(name).toLowerCase();
        if (itemBaseName === nameBaseName && path.dirname(resolvedItem) === rootDir) {
          return true;
        }

        // 5. Base name without extension match (e.g. folder vs file title) in root download folder
        const itemBaseNoExt = path.basename(resolvedItem, path.extname(resolvedItem));
        const nameBaseNoExt = path.basename(nameBaseName, path.extname(nameBaseName));
        if (itemBaseNoExt && itemBaseNoExt === nameBaseNoExt && path.dirname(resolvedItem) === rootDir) {
          return true;
        }
      }
    }
  } catch (e) {
    // If table doesn't exist or DB is busy, fail safely
    console.warn('[MediaOrganizer] Error checking active downloads:', e);
  }

  return false;
}

/**
 * Check if automatic media organization is enabled in database settings.
 * Defaults to true if not explicitly set to 'false' or '0'.
 */
export function isAutoOrganizeEnabled(): boolean {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('autoOrganize') as { value: string } | undefined;
    if (setting?.value) {
      return setting.value !== 'false' && setting.value !== '0';
    }
  } catch { /* ignore */ }
  return true;
}

/**
 * Get or create the TV Shows directory inside the base download directory.
 * If 'TV Shows' or 'TV shows' or 'tv shows' exists, uses that. Otherwise creates 'TV Shows'.
 */
export function getTvShowsDirectory(baseDownloadPath?: string): string {
  const downloadRoot = getDownloadRootDir(baseDownloadPath);

  const baseName = path.basename(downloadRoot).toLowerCase();
  if (baseName === 'tv shows' || baseName === 'shows' || baseName === 'tv') {
    return downloadRoot;
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
          return fs.statSync(path.join(downloadRoot, e)).isDirectory();
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
 * Get or create the Movies directory inside the base download directory.
 * If 'Movies' or 'movies' exists, uses that. Otherwise creates 'Movies'.
 */
export function getMoviesDirectory(baseDownloadPath?: string): string {
  const downloadRoot = getDownloadRootDir(baseDownloadPath);

  const baseName = path.basename(downloadRoot).toLowerCase();
  if (baseName === 'movies' || baseName === 'movie') {
    return downloadRoot;
  }

  if (!fs.existsSync(downloadRoot)) {
    fs.mkdirSync(downloadRoot, { recursive: true });
  }

  // Check actual filesystem entries to preserve existing casing/names (e.g. "movies", "Movies", etc.)
  try {
    const entries = fs.readdirSync(downloadRoot);
    const existing = entries.find(e => {
      const lower = e.toLowerCase();
      if (lower === 'movies' || lower === 'movie') {
        try {
          return fs.statSync(path.join(downloadRoot, e)).isDirectory();
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

  const defaultMoviesPath = path.join(downloadRoot, 'Movies');
  if (!fs.existsSync(defaultMoviesPath)) {
    fs.mkdirSync(defaultMoviesPath, { recursive: true });
  }

  return defaultMoviesPath;
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
    .replace(/^[-–—._\s]+/, '') // strip leading dashes, underscores, dots, spaces
    .replace(/[-–—._\s]+$/, '') // strip trailing dashes, underscores, dots, spaces
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
    disableAutoOrganizeCheck?: boolean;
    skipActiveDownloadCheck?: boolean;
  }
): Promise<OrganizeResult> {
  try {
    if (!options?.disableAutoOrganizeCheck && !isAutoOrganizeEnabled()) {
      return { moved: false, error: 'Auto-organization is disabled in settings' };
    }

    if (!options?.skipActiveDownloadCheck && isItemPartOfActiveDownload(filePath)) {
      return { moved: false, error: 'File is part of an active download' };
    }

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

export interface MovieOrganizeResult {
  moved: boolean;
  oldPath?: string;
  newPath?: string;
  movieTitle?: string;
  year?: number;
  error?: string;
}

/**
 * Organize a single movie video file into the proper Movies/<Movie Title (Year)>/ structure.
 */
export async function organizeMovieFile(
  filePath: string,
  options?: {
    baseDownloadPath?: string;
    movieTitleHint?: string;
    yearHint?: number;
    deleteSourceFolderIfEmpty?: boolean;
    keepOriginalFileName?: boolean;
    disableAutoOrganizeCheck?: boolean;
    skipActiveDownloadCheck?: boolean;
  }
): Promise<MovieOrganizeResult> {
  try {
    if (!options?.disableAutoOrganizeCheck && !isAutoOrganizeEnabled()) {
      return { moved: false, error: 'Auto-organization is disabled in settings' };
    }

    if (!options?.skipActiveDownloadCheck && isItemPartOfActiveDownload(filePath)) {
      return { moved: false, error: 'File is part of an active download' };
    }

    if (!fs.existsSync(filePath)) {
      return { moved: false, error: 'File does not exist' };
    }

    if (!isVideoFile(filePath) || isSampleClip(filePath) || isExtrasContent(filePath)) {
      return { moved: false, error: 'Not a valid media file' };
    }

    const fileName = path.basename(filePath);

    // If it's detected as a TV show, do not treat as a movie
    if (detectTvShow(fileName)) {
      return { moved: false, error: 'File is recognized as a TV show episode' };
    }

    const rawTitle = options?.movieTitleHint || cleanFilename(fileName);
    const cleanTitle = sanitizeFolderName(rawTitle) || sanitizeFolderName(path.basename(fileName, path.extname(fileName)));
    const year = options?.yearHint ?? extractYear(fileName);

    if (!cleanTitle) {
      return { moved: false, error: 'Could not determine movie title' };
    }

    const folderName = year ? `${cleanTitle} (${year})` : cleanTitle;
    const moviesDir = getMoviesDirectory(options?.baseDownloadPath);

    const ext = path.extname(fileName);
    const targetFileName = options?.keepOriginalFileName ? fileName : `${folderName}${ext}`;
    const targetMovieDir = path.join(moviesDir, folderName);
    const targetFilePath = path.join(targetMovieDir, targetFileName);

    // If already in target location, nothing to move
    if (path.resolve(filePath) === path.resolve(targetFilePath)) {
      return { moved: false, newPath: targetFilePath, movieTitle: cleanTitle, year };
    }

    // Check if the file is already inside its properly formatted movie folder inside moviesDir
    const currentParentDir = path.dirname(filePath);
    const currentGrandParentDir = path.dirname(currentParentDir);
    const isInsideMoviesDir = path.resolve(currentGrandParentDir) === path.resolve(moviesDir);
    const parentMatchesFolderName = path.basename(currentParentDir).toLowerCase() === folderName.toLowerCase();
    const parentMatchesTitle = path.basename(currentParentDir).toLowerCase() === cleanTitle.toLowerCase();

    if (isInsideMoviesDir && (parentMatchesFolderName || parentMatchesTitle)) {
      return { moved: false, newPath: filePath, movieTitle: cleanTitle, year };
    }

    if (!fs.existsSync(targetMovieDir)) {
      fs.mkdirSync(targetMovieDir, { recursive: true });
    }

    const originalParentDir = path.dirname(filePath);

    // Move companion files (subtitles, artwork) first if coming from a dedicated folder
    if (path.resolve(originalParentDir) !== path.resolve(targetMovieDir) && path.resolve(originalParentDir) !== path.resolve(moviesDir)) {
      moveCompanionFiles(originalParentDir, targetMovieDir, folderName);
    }

    // Move the video file
    moveFileSafe(filePath, targetFilePath);
    console.log(`[MediaOrganizer] Moved movie "${fileName}" to "${targetFilePath}"`);

    // Update database records for this file path
    try {
      db.prepare('UPDATE movies SET filePath = ?, fileName = ? WHERE filePath = ? OR filePath = ?')
        .run(targetFilePath, targetFileName, filePath, filePath.replace(/\\/g, '/'));
      db.prepare('DELETE FROM episodes WHERE filePath = ? OR filePath = ?')
        .run(filePath, filePath.replace(/\\/g, '/'));
    } catch (e) {
      console.warn('[MediaOrganizer] Failed to update DB path for moved movie:', e);
    }

    // Clean up empty or junk source folder if requested
    if (options?.deleteSourceFolderIfEmpty && path.resolve(originalParentDir) !== path.resolve(targetMovieDir) && path.resolve(originalParentDir) !== path.resolve(moviesDir)) {
      cleanupJunkDirectory(originalParentDir, options.baseDownloadPath);
    }

    return {
      moved: true,
      oldPath: filePath,
      newPath: targetFilePath,
      movieTitle: cleanTitle,
      year,
    };
  } catch (e: any) {
    console.error(`[MediaOrganizer] Error organizing movie ${filePath}:`, e);
    return { moved: false, error: e?.message || String(e) };
  }
}

/**
 * Safely delete a directory if it only contains junk files (nfo, txt, url, sample, empty dirs)
 * and is inside the downloads directory. Never delete the root downloads folder, TV Shows folder,
 * Movies folder, or user library folders.
 */
export function cleanupJunkDirectory(
  dirPath: string,
  baseDownloadPath?: string,
  options?: { skipActiveDownloadCheck?: boolean }
): boolean {
  try {
    if (!fs.existsSync(dirPath)) return false;

    if (!options?.skipActiveDownloadCheck && isItemPartOfActiveDownload(dirPath)) {
      return false;
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return false;

    const resolved = path.resolve(dirPath);
    const downloadRoot = path.resolve(baseDownloadPath || getDownloadRootDir(baseDownloadPath));
    const tvShowsRoot = path.resolve(getTvShowsDirectory(baseDownloadPath));
    const moviesRoot = path.resolve(getMoviesDirectory(baseDownloadPath));

    // Never delete download root, TV Shows root, or Movies root
    if (resolved === downloadRoot || resolved === tvShowsRoot || resolved === moviesRoot) {
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

    // Check if there are any remaining valid video files or active download files
    const allFiles = getFilesRecursive(resolved);
    if (!options?.skipActiveDownloadCheck && allFiles.some(f => isItemPartOfActiveDownload(f))) {
      return false;
    }

    const hasValidVideo = allFiles.some(f => isVideoFile(f) && !isSampleClip(f) && !isExtrasContent(f));

    if (hasValidVideo) {
      return false; // Still contains video files, don't delete
    }

    console.log(`[MediaOrganizer] Deleting junk/empty torrent directory: "${resolved}"`);
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    return true;
  } catch (e) {
    console.warn(`[MediaOrganizer] Failed to cleanup directory "${dirPath}":`, e);
    return false;
  }
}

export function getFilesRecursive(dir: string, list: string[] = []): string[] {
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
  torrentNameOrFilename?: string | null,
  options?: { disableAutoOrganizeCheck?: boolean; skipActiveDownloadCheck?: boolean }
): Promise<{ organizedFiles: string[]; deletedFolders: string[] }> {
  const organizedFiles: string[] = [];
  const deletedFolders: string[] = [];

  try {
    if (!options?.disableAutoOrganizeCheck && !isAutoOrganizeEnabled()) {
      return { organizedFiles, deletedFolders };
    }

    const targetDir = torrentNameOrFilename
      ? path.join(downloadPath, torrentNameOrFilename)
      : downloadPath;

    if (!fs.existsSync(targetDir)) {
      return { organizedFiles, deletedFolders };
    }

    const stat = fs.statSync(targetDir);

    if (stat.isFile()) {
      // Single file download
      if (isVideoFile(targetDir) && !isSampleClip(targetDir) && !isExtrasContent(targetDir)) {
        if (detectTvShow(path.basename(targetDir))) {
          const result = await organizeTvEpisodeFile(targetDir, {
            baseDownloadPath: downloadPath,
            disableAutoOrganizeCheck: options?.disableAutoOrganizeCheck,
            skipActiveDownloadCheck: true,
          });
          if (result.moved && result.newPath) {
            organizedFiles.push(result.newPath);
          }
        } else {
          const result = await organizeMovieFile(targetDir, {
            baseDownloadPath: downloadPath,
            disableAutoOrganizeCheck: options?.disableAutoOrganizeCheck,
            skipActiveDownloadCheck: true,
          });
          if (result.moved && result.newPath) {
            organizedFiles.push(result.newPath);
          }
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
            disableAutoOrganizeCheck: options?.disableAutoOrganizeCheck,
            skipActiveDownloadCheck: true,
          });
          if (result.moved && result.newPath) {
            organizedFiles.push(result.newPath);
          }
        } else {
          const result = await organizeMovieFile(videoFile, {
            baseDownloadPath: downloadPath,
            deleteSourceFolderIfEmpty: false,
            disableAutoOrganizeCheck: options?.disableAutoOrganizeCheck,
            skipActiveDownloadCheck: true,
          });
          if (result.moved && result.newPath) {
            organizedFiles.push(result.newPath);
          }
        }
      }

      // If this was a subfolder inside downloadPath, cleanup the torrent subfolder
      if (path.resolve(targetDir) !== path.resolve(downloadPath)) {
        const cleaned = cleanupJunkDirectory(targetDir, downloadPath, { skipActiveDownloadCheck: true });
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
  baseDownloadPath?: string,
  options?: { disableAutoOrganizeCheck?: boolean }
): Promise<{ organized: number; errors: string[] }> {
  let organized = 0;
  const errors: string[] = [];

  try {
    if (!options?.disableAutoOrganizeCheck && !isAutoOrganizeEnabled()) {
      return { organized: 0, errors: [] };
    }

    const downloadRoot = getDownloadRootDir(baseDownloadPath);

    if (!fs.existsSync(downloadRoot)) {
      return { organized: 0, errors: [] };
    }

    const entries = fs.readdirSync(downloadRoot);

    for (const entry of entries) {
      const fullPath = path.join(downloadRoot, entry);
      try {
        if (isItemPartOfActiveDownload(fullPath)) {
          continue;
        }

        const stat = fs.statSync(fullPath);

        // Skip the TV Shows folder itself and Movies folder
        if (stat.isDirectory()) {
          const normName = entry.toLowerCase();
          if (normName === 'tv shows' || normName === 'tv' || normName === 'shows' || normName === 'movies' || normName === 'movie') {
            continue;
          }
          if (normName.startsWith('.') || normName === 'node_modules' || normName === 'data' || normName === '$recycle.bin' || normName === 'system volume information') {
            continue;
          }

          // Check if this subfolder has TV episodes
          const files = getFilesRecursive(fullPath);
          const tvFiles = files.filter(f => isVideoFile(f) && !isSampleClip(f) && !isExtrasContent(f) && detectTvShow(path.basename(f)) && !isItemPartOfActiveDownload(f));

          if (tvFiles.length > 0) {
            let anyMoved = false;
            for (const file of tvFiles) {
              if (isItemPartOfActiveDownload(file)) continue;
              const res = await organizeTvEpisodeFile(file, {
                baseDownloadPath: downloadRoot,
                disableAutoOrganizeCheck: options?.disableAutoOrganizeCheck,
              });
              if (res.moved) {
                organized++;
                anyMoved = true;
              }
            }
            if (anyMoved) {
              cleanupJunkDirectory(fullPath, downloadRoot);
            }
          }
        } else if (stat.isFile() && isVideoFile(fullPath)) {
          // File directly in root download folder
          if (detectTvShow(entry) && !isItemPartOfActiveDownload(fullPath)) {
            const res = await organizeTvEpisodeFile(fullPath, {
              baseDownloadPath: downloadRoot,
              disableAutoOrganizeCheck: options?.disableAutoOrganizeCheck,
            });
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
 * Scan the download directory for loose movies (e.g. dropped directly into downloads root
 * or into loose torrent subfolders) and organize them into Movies/<Movie Title (Year)>/.
 */
export async function organizeLooseMoviesInDownloads(
  baseDownloadPath?: string,
  options?: { disableAutoOrganizeCheck?: boolean }
): Promise<{ organized: number; errors: string[] }> {
  let organized = 0;
  const errors: string[] = [];

  try {
    if (!options?.disableAutoOrganizeCheck && !isAutoOrganizeEnabled()) {
      return { organized: 0, errors: [] };
    }

    const downloadRoot = getDownloadRootDir(baseDownloadPath);
    const moviesDir = getMoviesDirectory(baseDownloadPath);

    if (!fs.existsSync(downloadRoot)) {
      return { organized: 0, errors: [] };
    }

    // Clean up empty duplicate "Movies" folder if downloadRoot is already named Movies
    const nestedMovies = path.join(downloadRoot, 'Movies');
    if (path.resolve(downloadRoot) === path.resolve(moviesDir) && fs.existsSync(nestedMovies)) {
      try {
        const nestedEntries = fs.readdirSync(nestedMovies);
        if (nestedEntries.length === 0) {
          fs.rmdirSync(nestedMovies);
          console.log(`[MediaOrganizer] Removed empty duplicate Movies directory: "${nestedMovies}"`);
        }
      } catch { /* ignore */ }
    }

    const searchDirs = new Set<string>([downloadRoot]);
    if (fs.existsSync(moviesDir)) {
      searchDirs.add(path.resolve(moviesDir));
    }

    for (const searchDir of searchDirs) {
      const entries = fs.readdirSync(searchDir);

      for (const entry of entries) {
        const fullPath = path.join(searchDir, entry);
        try {
          if (isItemPartOfActiveDownload(fullPath)) {
            continue;
          }

          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            const normName = entry.toLowerCase();
            // Skip TV Shows folder and system/hidden dirs
            if (normName === 'tv shows' || normName === 'tv' || normName === 'shows') {
              continue;
            }
            if (normName.startsWith('.') || normName === 'node_modules' || normName === 'data' || normName === '$recycle.bin' || normName === 'system volume information') {
              continue;
            }
            // Skip the moviesDir folder itself if it is a child of searchDir
            if (searchDir === downloadRoot && path.resolve(fullPath) === path.resolve(moviesDir)) {
              continue;
            }

            // Check if this subfolder has movie files (and not TV show files)
            const files = getFilesRecursive(fullPath);
            const movieFiles = files.filter(f => isVideoFile(f) && !isSampleClip(f) && !isExtrasContent(f) && !detectTvShow(path.basename(f)) && !isItemPartOfActiveDownload(f));

            if (movieFiles.length > 0) {
              let anyMoved = false;
              for (const file of movieFiles) {
                if (isItemPartOfActiveDownload(file)) continue;
                const res = await organizeMovieFile(file, {
                  baseDownloadPath: downloadRoot,
                  deleteSourceFolderIfEmpty: false,
                  disableAutoOrganizeCheck: options?.disableAutoOrganizeCheck,
                });
                if (res.moved) {
                  organized++;
                  anyMoved = true;
                }
              }
              if (anyMoved) {
                cleanupJunkDirectory(fullPath, downloadRoot);
              }
            }
          } else if (stat.isFile() && isVideoFile(fullPath) && !isSampleClip(fullPath) && !isExtrasContent(fullPath)) {
            // File directly in root download folder or movies directory
            if (!detectTvShow(entry) && !isItemPartOfActiveDownload(fullPath)) {
              const res = await organizeMovieFile(fullPath, {
                baseDownloadPath: downloadRoot,
                deleteSourceFolderIfEmpty: true,
                disableAutoOrganizeCheck: options?.disableAutoOrganizeCheck,
              });
              if (res.moved) {
                organized++;
              }
            }
          }
        } catch (e: any) {
          errors.push(`${entry}: ${e?.message || String(e)}`);
        }
      }
    }
  } catch (e: any) {
    errors.push(`Loose movie organization error: ${e?.message || String(e)}`);
  }

  if (organized > 0) {
    console.log(`[MediaOrganizer] Auto-organized ${organized} loose movie(s) in downloads`);
  }

  return { organized, errors };
}

/**
 * Convenience helper to organize both loose TV shows and loose movies in download directories.
 */
export async function organizeLooseMediaInDownloads(
  baseDownloadPath?: string,
  options?: { disableAutoOrganizeCheck?: boolean }
): Promise<{ organizedShows: number; organizedMovies: number; errors: string[] }> {
  if (!options?.disableAutoOrganizeCheck && !isAutoOrganizeEnabled()) {
    return { organizedShows: 0, organizedMovies: 0, errors: [] };
  }
  const tvRes = await organizeLooseTvShowsInDownloads(baseDownloadPath, options);
  const movieRes = await organizeLooseMoviesInDownloads(baseDownloadPath, options);
  return {
    organizedShows: tvRes.organized,
    organizedMovies: movieRes.organized,
    errors: [...tvRes.errors, ...movieRes.errors],
  };
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
      protectedRoots.add(path.resolve(getTvShowsDirectory()));
      protectedRoots.add(path.resolve(getMoviesDirectory()));
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

