import fs from 'fs';
import path from 'path';
import db, { cleanupOrphanedAutoTracks } from './db';
import { fetchMovieMetadata, fetchShowMetadata, fetchEpisodeMetadata, isPlaceholderEpisodeTitle, normalizeShowName, normalizeShowNameForMatch } from './metadata';
import { probeFile } from './mediainfo';
import { mapWithConcurrency } from './concurrency';
import { getSafeErrorMessage } from './security';
import {
  detectAudioCodec,
  detectHDR,
  detectResolution,
  detectTvShow,
  detectVideoCodec,
  isExtrasContent,
  isSampleClip,
  isVideoFile,
} from './mediaNaming';

// Re-exported so existing importers (app/api/scan) keep working unchanged.
export { isVideoFile } from './mediaNaming';

export function getVideoFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        getVideoFiles(filePath, fileList);
      } else if (isVideoFile(filePath) && !isSampleClip(filePath) && !isExtrasContent(filePath)) {
        fileList.push(filePath);
      }
    } catch {
      // ignore access errors
    }
  }

  return fileList;
}

export async function scanFile(filePath: string): Promise<{ added: boolean; error?: string }> {
  try {
    if (!isVideoFile(filePath)) {
      return { added: false };
    }

    if (isSampleClip(filePath) || isExtrasContent(filePath)) {
      return { added: false };
    }

    if (!fs.existsSync(filePath)) {
      return { added: false, error: 'File not found' };
    }

    const fileName = path.basename(filePath);

    // Check if already indexed
    const movieExists = db.prepare('SELECT id, title, tmdbId, posterPath, resolution FROM movies WHERE filePath = ?').get(filePath) as { id: number; title: string | null; tmdbId: number | null; posterPath: string | null; resolution: string | null } | undefined;
    const epExists = db.prepare('SELECT id, resolution, title, stillPath, rating, showId, seasonNumber, episodeNumber FROM episodes WHERE filePath = ?').get(filePath) as { id: number; resolution: string | null; title: string | null; stillPath: string | null; rating: number | null; showId: number; seasonNumber: number; episodeNumber: number } | undefined;

    if (movieExists || epExists) {
      // Check if media info or episode metadata needs updating
      const needsMediaUpdate = (movieExists && !movieExists.resolution) || (epExists && !epExists.resolution);
      const needsMovieMetadata = movieExists && (!movieExists.tmdbId || !movieExists.posterPath || /^(?:www[\s.]|\[)/i.test(movieExists.title || fileName));
      // Episode needs a metadata refresh while its title is still a placeholder
      // — ours ("S1 E1") or TMDB's own ("Episode 6") — or artwork/rating is missing.
      const needsEpMetadata = epExists && (!epExists.stillPath || epExists.rating === null || isPlaceholderEpisodeTitle(epExists.title));

      if (!needsMediaUpdate && !needsMovieMetadata && !needsEpMetadata) {
        return { added: false };
      }

      if (needsMovieMetadata && movieExists) {
        try {
          const movieMeta = await fetchMovieMetadata(fileName);
          if (movieMeta.tmdbId || movieMeta.posterPath || movieMeta.overview) {
            db.prepare(`
              UPDATE movies SET
                title = @title,
                year = @year,
                tmdbId = @tmdbId,
                posterPath = @posterPath,
                backdropPath = @backdropPath,
                overview = @overview,
                rating = @rating,
                imdbRating = @imdbRating,
                genres = @genres
              WHERE id = @id
            `).run({ ...movieMeta, id: movieExists.id });
            console.log(`[Scanner] Updated movie metadata for ${fileName}: "${movieMeta.title}"`);
          }
        } catch (e) {
          console.warn(`[Scanner] Failed to refresh movie metadata for ${fileName}:`, e);
        }
      }

      // Re-fetch episode TMDB metadata if needed (titles, thumbnails, overviews)
      if (needsEpMetadata && epExists) {
        try {
          const show = db.prepare('SELECT tmdbId FROM shows WHERE id = ?').get(epExists.showId) as { tmdbId: number | null } | undefined;
          if (show?.tmdbId && show.tmdbId > 0) {
            const epMeta = await fetchEpisodeMetadata(show.tmdbId, epExists.seasonNumber, epExists.episodeNumber);
            // Only update if we got real data (not fallback)
            if (epMeta.stillPath || epMeta.rating !== null || !isPlaceholderEpisodeTitle(epMeta.title)) {
              db.prepare(`UPDATE episodes SET title = ?, overview = ?, stillPath = ?, rating = ?, voteCount = ? WHERE id = ?`)
                .run(epMeta.title, epMeta.overview, epMeta.stillPath, epMeta.rating, epMeta.voteCount, epExists.id);
              console.log(`[Scanner] Updated episode metadata for ${fileName}: "${epMeta.title}" still=${!!epMeta.stillPath}`);
            }
          }
        } catch (e) {
          console.warn(`[Scanner] Failed to refresh episode metadata for ${fileName}:`, e);
        }
      }

      // Re-probe media info if resolution is missing
      if (needsMediaUpdate) {
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
      }

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
      const normalizedShowName = normalizeShowName(rawShowName) || rawShowName;

      // Fetch metadata from TMDB
      const showMeta = await fetchShowMetadata(normalizedShowName);

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

      if (!existingShow) {
        // Final fallback: normalize title variants (e.g. "Invincible 2021" -> "Invincible").
        const targetKey = normalizeShowNameForMatch(showMeta.title || normalizedShowName);
        if (targetKey) {
          const candidateShows = db.prepare('SELECT id, title FROM shows').all() as { id: number; title: string }[];
          const matched = candidateShows.find(s => normalizeShowNameForMatch(s.title) === targetKey);
          if (matched) {
            existingShow = { id: matched.id };
          }
        }
      }

      if (existingShow) {
        showId = existingShow.id;
      } else {
        const result = db.prepare(`
            INSERT INTO shows (title, tmdbId, posterPath, backdropPath, overview, rating, imdbRating, firstAirDate, genres) 
            VALUES (@title, @tmdbId, @posterPath, @backdropPath, @overview, @rating, @imdbRating, @firstAirDate, @genres)
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
        (showId, filePath, fileName, seasonNumber, episodeNumber, title, overview, stillPath, rating, voteCount, isHDR, resolution, videoCodec, audioCodec, audioChannels, bitrate, duration, fileSize)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          showId, filePath, fileName, tvInfo.season, tvInfo.episode,
          epMeta.title, epMeta.overview, epMeta.stillPath, epMeta.rating, epMeta.voteCount, isHDR,
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
        INSERT OR IGNORE INTO movies (filePath, fileName, title, year, tmdbId, posterPath, backdropPath, overview, rating, imdbRating, genres, isHDR, resolution, videoCodec, audioCodec, audioChannels, bitrate, duration, fileSize) 
        VALUES (@filePath, @fileName, @title, @year, @tmdbId, @posterPath, @backdropPath, @overview, @rating, @imdbRating, @genres, @isHDR, @resolution, @videoCodec, @audioCodec, @audioChannels, @bitrate, @duration, @fileSize)
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

// How many independent titles to scan at once. The win here is local work —
// each file spawns an ffprobe — not TMDB, whose calls are globally serialised
// by the rate limiter in lib/metadata.ts regardless of what happens here.
const SCAN_CONCURRENCY = 4;

/**
 * Partition files into units that must be scanned sequentially.
 *
 * Episodes of one show share a `shows` row that gets created on first sight, so
 * scanning two of them at once could insert the show twice. Grouping by show
 * keeps each series serial while letting unrelated titles proceed in parallel.
 * Movies are independent, so each is its own group.
 */
export function groupFilesForScan(filePaths: readonly string[]): string[][] {
  const showGroups = new Map<string, string[]>();
  const standalone: string[][] = [];

  for (const filePath of filePaths) {
    const tvInfo = detectTvShow(path.basename(filePath));
    if (!tvInfo) {
      standalone.push([filePath]);
      continue;
    }

    const key = normalizeShowNameForMatch(tvInfo.name) || tvInfo.name.toLowerCase();
    const existing = showGroups.get(key);
    if (existing) existing.push(filePath);
    else showGroups.set(key, [filePath]);
  }

  return [...showGroups.values(), ...standalone];
}

export async function scanFolder(folderPath: string): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;

  const groups = groupFilesForScan(getVideoFiles(folderPath));

  const settled = await mapWithConcurrency(groups, SCAN_CONCURRENCY, async (group) => {
    let groupAdded = 0;
    const groupErrors: string[] = [];

    for (const filePath of group) {
      try {
        const result = await scanFile(filePath);
        if (result.added) groupAdded++;
        if (result.error) groupErrors.push(`${filePath}: ${result.error}`);
      } catch (e) {
        groupErrors.push(`${filePath}: ${getSafeErrorMessage(e)}`);
      }
    }

    return { groupAdded, groupErrors };
  });

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      added += result.value.groupAdded;
      errors.push(...result.value.groupErrors);
    } else {
      errors.push(getSafeErrorMessage(result.reason));
    }
  }

  return { added, errors };
}

export function removeFile(filePath: string): { removed: boolean } {
  try {
    console.log('[Scanner] Attempting to remove file:', filePath);
    // Normalize path to ensure matches DB triggers
    // Try original path first
    const movieResult = db.prepare('DELETE FROM movies WHERE filePath = ?').run(filePath);
    const epResult = db.prepare('DELETE FROM episodes WHERE filePath = ?').run(filePath);

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

    if (epResult.changes > 0) {
      db.prepare('DELETE FROM shows WHERE id NOT IN (SELECT DISTINCT showId FROM episodes)').run();
      cleanupOrphanedAutoTracks();
    }

    console.log('[Scanner] Removal result:', { movieChanges: movieResult.changes, epChanges: epResult.changes });
    return { removed: movieResult.changes > 0 || epResult.changes > 0 };
  } catch (e: any) {
    console.error('Remove file error:', e);
    return { removed: false };
  }
}
