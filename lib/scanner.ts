import fs from 'fs';
import path from 'path';
import db from './db';
import { fetchMovieMetadata, fetchShowMetadata, fetchEpisodeMetadata } from './metadata';
import { probeFile } from './mediainfo';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'];

// TV show detection patterns
const TV_PATTERNS = [
  /(.+?)[ .\[\(]?(?:s(\d+)[ .]?e(\d+))/i,
  /(.+?)[ .\[\(]?(?:(\d+)x(\d+))/i,
  /(.+?)[ ._-]?(?:season[ ._]?(\d+)[ ._]?episode[ ._]?(\d+))/i,
  /(.+?)[ .\[\(]?(?:ep?(\d+))/i,
];

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

function detectTvShow(fileName: string): { name: string; season: number; episode: number } | null {
  for (const pattern of TV_PATTERNS) {
    const match = fileName.match(pattern);
    if (match) {
      const name = match[1].replace(/[._]/g, ' ').trim();
      const season = parseInt(match[2]) || 1;
      const episode = parseInt(match[3]) || parseInt(match[2]) || 1;
      if (episode > 0) {
        return { name, season, episode };
      }
    }
  }
  return null;
}

// Detect HDR content from filename
const HDR_PATTERN = /\b(HDR10\+?|HDR10Plus|HDR|HLG|DV|DoVi|Dolby[. ]?Vision|DolbyVision)\b/i;

function detectHDR(fileName: string): boolean {
  return HDR_PATTERN.test(fileName);
}

// Detect resolution from filename
function detectResolution(fileName: string): string | null {
  if (/\b(2160p|4k|UHD)\b/i.test(fileName)) return '2160p';
  if (/\b1080p\b/i.test(fileName)) return '1080p';
  if (/\b720p\b/i.test(fileName)) return '720p';
  if (/\b480p\b/i.test(fileName)) return '480p';
  return null;
}

// Detect video codec from filename
function detectVideoCodec(fileName: string): string | null {
  if (/\b(x265|h\.?265|HEVC)\b/i.test(fileName)) return 'HEVC';
  if (/\b(x264|h\.?264|AVC)\b/i.test(fileName)) return 'H.264';
  if (/\bAV1\b/i.test(fileName)) return 'AV1';
  if (/\bVP9\b/i.test(fileName)) return 'VP9';
  return null;
}

// Detect audio codec from filename
function detectAudioCodec(fileName: string): { codec: string | null; channels: string | null } {
  let codec: string | null = null;
  let channels: string | null = null;

  if (/\bAtmos\b/i.test(fileName)) codec = 'Atmos';
  else if (/\bTrueHD\b/i.test(fileName)) codec = 'TrueHD';
  else if (/\bDTS[- ]?HD\b/i.test(fileName)) codec = 'DTS-HD';
  else if (/\bDTS\b/i.test(fileName)) codec = 'DTS';
  else if (/\bEAC3\b/i.test(fileName) || /\bDD\+\b/i.test(fileName) || /\bDDP\b/i.test(fileName)) codec = 'EAC3';
  else if (/\bAC3\b/i.test(fileName) || /\bDD5\.?1\b/i.test(fileName)) codec = 'AC3';
  else if (/\bAAC\b/i.test(fileName)) codec = 'AAC';
  else if (/\bFLAC\b/i.test(fileName)) codec = 'FLAC';
  else if (/\bOpus\b/i.test(fileName)) codec = 'Opus';

  if (/\b7\.1\b/.test(fileName)) channels = '7.1';
  else if (/\b5\.1\b/.test(fileName)) channels = '5.1';
  else if (/\b2\.0\b/.test(fileName)) channels = '2.0';

  return { codec, channels };
}

export async function scanFile(filePath: string): Promise<{ added: boolean; error?: string }> {
  try {
    if (!isVideoFile(filePath)) {
      return { added: false };
    }

    if (!fs.existsSync(filePath)) {
      return { added: false, error: 'File not found' };
    }

    const fileName = path.basename(filePath);

    // Check if already indexed
    const movieExists = db.prepare('SELECT id, resolution FROM movies WHERE filePath = ?').get(filePath) as { id: number; resolution: string | null } | undefined;
    const epExists = db.prepare('SELECT id, resolution FROM episodes WHERE filePath = ?').get(filePath) as { id: number; resolution: string | null } | undefined;

    if (movieExists || epExists) {
      // If already indexed but missing media info, update it
      const needsMediaUpdate = (movieExists && !movieExists.resolution) || (epExists && !epExists.resolution);
      if (!needsMediaUpdate) {
        return { added: false };
      }

      // Run FFprobe + filename detection to fill in missing media info
      const mediaInfo = await probeFile(filePath);
      const fnResolution = detectResolution(fileName);
      const fnVideoCodec = detectVideoCodec(fileName);
      const fnAudio = detectAudioCodec(fileName);

      const updResolution = mediaInfo?.resolution || fnResolution;
      const updVideoCodec = mediaInfo?.videoCodec || fnVideoCodec;
      const updAudioCodec = mediaInfo?.audioCodec || fnAudio.codec;
      const updAudioChannels = mediaInfo?.audioChannels || fnAudio.channels;
      const updIsHDR = (mediaInfo?.isHDR || detectHDR(fileName)) ? 1 : 0;

      if (movieExists) {
        db.prepare(`UPDATE movies SET resolution = ?, videoCodec = ?, audioCodec = ?, audioChannels = ?, isHDR = ?, bitrate = ?, duration = ?, fileSize = ? WHERE id = ?`)
          .run(updResolution, updVideoCodec, updAudioCodec, updAudioChannels, updIsHDR,
            mediaInfo?.bitrate || null, mediaInfo?.duration || null, mediaInfo?.fileSize || null, movieExists.id);
      }
      if (epExists) {
        db.prepare(`UPDATE episodes SET resolution = ?, videoCodec = ?, audioCodec = ?, audioChannels = ?, isHDR = ?, bitrate = ?, duration = ?, fileSize = ? WHERE id = ?`)
          .run(updResolution, updVideoCodec, updAudioCodec, updAudioChannels, updIsHDR,
            mediaInfo?.bitrate || null, mediaInfo?.duration || null, mediaInfo?.fileSize || null, epExists.id);
      }
      console.log(`[Scanner] Updated media info for ${fileName}: ${updResolution} ${updVideoCodec} HDR=${updIsHDR}`);
      return { added: false }; // Not a new addition, but updated
    }

    const tvInfo = detectTvShow(fileName);

    // Probe file for media info (non-blocking — scan continues if FFprobe fails)
    const mediaInfo = await probeFile(filePath);

    // Filename-based detection as fallback
    const fnResolution = detectResolution(fileName);
    const fnVideoCodec = detectVideoCodec(fileName);
    const fnAudio = detectAudioCodec(fileName);

    // Merge: prefer FFprobe, fall back to filename
    const isHDR = (mediaInfo?.isHDR || detectHDR(fileName)) ? 1 : 0;
    const resolution = mediaInfo?.resolution || fnResolution;
    const videoCodec = mediaInfo?.videoCodec || fnVideoCodec;
    const audioCodec = mediaInfo?.audioCodec || fnAudio.codec;
    const audioChannels = mediaInfo?.audioChannels || fnAudio.channels;

    if (tvInfo) {
      // Handle TV show
      const rawShowName = tvInfo.name.replace(/[\(\[].*?[\)\]]/g, '').replace(/-$/, '').trim();

      // Fetch metadata from TMDB
      const showMeta = await fetchShowMetadata(rawShowName);

      // Find or create show - using strict TMDB ID check first
      let showId: number | bigint = 0;
      let existingShow = null;

      if (showMeta.tmdbId) {
        existingShow = db.prepare('SELECT id FROM shows WHERE tmdbId = ?').get(showMeta.tmdbId) as { id: number } | undefined;
      }

      if (!existingShow) {
        // Fallback to title check
        existingShow = db.prepare('SELECT id FROM shows WHERE title = ?').get(showMeta.title) as { id: number } | undefined;
      }

      if (existingShow) {
        showId = existingShow.id;
      } else {
        const result = db.prepare(`
            INSERT INTO shows (title, tmdbId, posterPath, backdropPath, overview, rating, firstAirDate, genres) 
            VALUES (@title, @tmdbId, @posterPath, @backdropPath, @overview, @rating, @firstAirDate, @genres)
        `).run(showMeta);
        showId = result.lastInsertRowid;
      }

      // Fetch per-episode metadata from TMDB
      const epMeta = await fetchEpisodeMetadata(
        showMeta.tmdbId || 0,
        tvInfo.season,
        tvInfo.episode
      );

      // Insert episode with TMDB metadata and media info
      db.prepare(`INSERT OR IGNORE INTO episodes 
        (showId, filePath, fileName, seasonNumber, episodeNumber, title, overview, stillPath, isHDR, resolution, videoCodec, audioCodec, audioChannels, bitrate, duration, fileSize) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          showId, filePath, fileName, tvInfo.season, tvInfo.episode,
          epMeta.title, epMeta.overview, epMeta.stillPath, isHDR,
          resolution || null, videoCodec || null,
          audioCodec || null, audioChannels || null,
          mediaInfo?.bitrate || null, mediaInfo?.duration || null,
          mediaInfo?.fileSize || null
        );

      return { added: true };
    } else {
      // Handle movie
      // Fetch metadata from TMDB
      const movieMeta = await fetchMovieMetadata(fileName);

      db.prepare(`
        INSERT OR IGNORE INTO movies (filePath, fileName, title, year, tmdbId, posterPath, backdropPath, overview, rating, genres, isHDR, resolution, videoCodec, audioCodec, audioChannels, bitrate, duration, fileSize) 
        VALUES (@filePath, @fileName, @title, @year, @tmdbId, @posterPath, @backdropPath, @overview, @rating, @genres, @isHDR, @resolution, @videoCodec, @audioCodec, @audioChannels, @bitrate, @duration, @fileSize)
      `).run({
        filePath,
        fileName,
        ...movieMeta,
        isHDR,
        resolution: resolution || null,
        videoCodec: videoCodec || null,
        audioCodec: audioCodec || null,
        audioChannels: audioChannels || null,
        bitrate: mediaInfo?.bitrate || null,
        duration: mediaInfo?.duration || null,
        fileSize: mediaInfo?.fileSize || null,
      });

      return { added: true };
    }
  } catch (e: any) {
    console.error('Scan file error:', e);
    return { added: false, error: e.message };
  }
}

export async function scanFolder(folderPath: string): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          scanDir(filePath);
        } else if (isVideoFile(filePath)) {
          const result = db.prepare('SELECT id FROM movies WHERE filePath = ?').get(filePath) ||
            db.prepare('SELECT id FROM episodes WHERE filePath = ?').get(filePath);
          if (!result) {
            // Will be added by watcher or manual scan
            added++;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  scanDir(folderPath);
  return { added, errors };
}

export function removeFile(filePath: string): { removed: boolean } {
  try {
    console.log('[Scanner] Attempting to remove file:', filePath);
    // Normalize path to ensure matches DB triggers
    // Try original path first
    let movieResult = db.prepare('DELETE FROM movies WHERE filePath = ?').run(filePath);
    let epResult = db.prepare('DELETE FROM episodes WHERE filePath = ?').run(filePath);

    if (movieResult.changes === 0 && epResult.changes === 0) {
      // Try with normalized slashes if Windows
      const normalizedPath = filePath.replace(/\\/g, '/');
      const winPath = filePath.replace(/\//g, '\\');

      console.log('[Scanner] No items deleted, trying variants:', { normalizedPath, winPath });

      if (normalizedPath !== filePath) {
        const m = db.prepare('DELETE FROM movies WHERE filePath = ?').run(normalizedPath);
        const e = db.prepare('DELETE FROM episodes WHERE filePath = ?').run(normalizedPath);
        movieResult.changes += m.changes;
        epResult.changes += e.changes;
      }
      if (winPath !== filePath && (movieResult.changes === 0 && epResult.changes === 0)) {
        const m = db.prepare('DELETE FROM movies WHERE filePath = ?').run(winPath);
        const e = db.prepare('DELETE FROM episodes WHERE filePath = ?').run(winPath);
        movieResult.changes += m.changes;
        epResult.changes += e.changes;
      }
    }

    console.log('[Scanner] Removal result:', { movieChanges: movieResult.changes, epChanges: epResult.changes });
    return { removed: movieResult.changes > 0 || epResult.changes > 0 };
  } catch (e: any) {
    console.error('Remove file error:', e);
    return { removed: false };
  }
}
