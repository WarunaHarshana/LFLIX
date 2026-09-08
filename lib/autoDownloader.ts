/**
 * Auto Episode Downloader — Automatically finds and downloads missing episodes
 * in the highest available quality using the existing torrent search infrastructure.
 */

import db from './db';
import { searchTorrents, TorrentResult } from './torrentSearch';
import downloadManager from './downloader';
import releaseMonitor, { NewEpisodeInfo } from './releaseMonitor';

// Quality tiers for scoring
const QUALITY_SCORES: Record<string, number> = {
  '2160p': 100, '4K': 100, 'UHD': 100,
  '1080p': 80,
  '720p': 60,
  '480p': 30,
  'HDRip': 50, 'BDRip': 70, 'BluRay': 85,
  'WEBRip': 75, 'WEB-DL': 80,
  'HDTV': 55,
  'CAM': 5, 'TS': 10,
  'Unknown': 20,
};

const SOURCE_BONUS: Record<string, number> = {
  'Remux': 15,
  'BluRay': 10,
  'WEB-DL': 5,
  'DV': 4,
  'Dolby Vision': 4,
  'HDR10+': 4,
  'HDR': 3,
  'HEVC': 3,
  'x265': 3,
  'AV1': 3,
  '10bit': 2,
};

// Max retry window (days after air date)
const MAX_RETRY_DAYS = 7;

export interface AutoDownloadStatus {
  pending: number;
  retrying: number;
  completed: number;
  failed: number;
}

/**
 * Score a torrent result by quality, size, and seeds.
 */
function scoreTorrent(result: TorrentResult, preferredQuality: string, maxQualityScore?: number): number {
  let score = 0;

  // Base quality score
  const quality = result.quality || 'Unknown';
  const qualityScore = QUALITY_SCORES[quality] || QUALITY_SCORES['Unknown'];
  score += qualityScore;

  // Massive bonus for DDLs (User preference: check DDL first, fallback to torrent)
  if (result.source === 'DDL') {
    let preferredQualityScore = 100; // default for 'best'
    if (preferredQuality === 'any') {
      preferredQualityScore = 0;
    } else if (preferredQuality && preferredQuality !== 'best') {
      preferredQualityScore = QUALITY_SCORES[preferredQuality] || 80;
    }

    const targetQualityScore = maxQualityScore !== undefined
      ? Math.min(preferredQualityScore, maxQualityScore)
      : preferredQualityScore;

    // Only apply the massive DDL bonus if the DDL meets or exceeds the target quality score.
    // If it's below the target quality, we give it a much smaller bonus (+15)
    // so it doesn't override higher quality torrents, but still beats torrents in its own lower quality tier.
    if (qualityScore >= targetQualityScore) {
      score += 1000;
    } else {
      score += 15;
    }
  }

  // Source bonuses (check title for encoding info)
  const titleLower = result.title.toLowerCase();
  for (const [tag, bonus] of Object.entries(SOURCE_BONUS)) {
    if (titleLower.includes(tag.toLowerCase())) {
      score += bonus;
    }
  }

  // Seed count bonus (more seeds = more reliable, but cap the bonus)
  if (result.seeds > 0) {
    score += Math.min(20, Math.log2(result.seeds) * 3);
  }

  // Size heuristic: prefer larger files (better quality), but not absurdly large
  if (result.sizeBytes > 0) {
    const sizeGB = result.sizeBytes / (1024 ** 3);
    if (sizeGB >= 1 && sizeGB <= 8) score += 10;        // sweet spot for episodes
    else if (sizeGB >= 8 && sizeGB <= 20) score += 15;   // likely higher quality
    else if (sizeGB > 50) score -= 20;                    // probably a full season pack
  }

  // Preferred quality bonus — if the result matches what user wants
  if (preferredQuality !== 'any' && preferredQuality !== 'best') {
    const prefScore = QUALITY_SCORES[preferredQuality] || 80;
    const actualScore = QUALITY_SCORES[quality] || 20;
    // Bonus if at or above preferred quality
    if (actualScore >= prefScore) score += 15;
    // Penalty if below preferred
    else score -= 10;
  }

  // Penalty for obvious season packs (we want single episodes)
  if (/complete|full\s*season|s\d+\s*(?:complete|pack)/i.test(result.title)) {
    score -= 50;
  }

  return Math.max(0, score);
}

/**
 * Build a search query for a specific episode.
 */
function buildEpisodeQuery(showTitle: string, season: number, episode: number): string {
  const sXXeXX = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  return `${showTitle} ${sXXeXX}`;
}

/**
 * Filter torrent results to only include those matching the specific episode and exact show name.
 */
function filterForEpisode(results: TorrentResult[], showTitle: string, season: number, episode: number): TorrentResult[] {
  const sXXeXX = `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;
  const altPattern = new RegExp(`${season}x${String(episode).padStart(2, '0')}`, 'i');
  
  const showWords = showTitle.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().split(/\s+/);

  return results.filter(r => {
    // Direct downloads resolved specifically for this episode via TMDB are guaranteed matches
    if (r.source === 'DDL' && r.magnet.startsWith('http-direct:')) {
      return true;
    }

    let titleLower = r.title.toLowerCase();
    
    // Remove leading [group] tags
    titleLower = titleLower.replace(/^\[.*?\]\s*/, '');
    
    let matchIdx = titleLower.indexOf(sXXeXX);
    if (matchIdx === -1) {
      const altMatch = titleLower.match(altPattern);
      if (altMatch) matchIdx = altMatch.index!;
    }
    
    // Must match the specific episode identifier
    if (matchIdx === -1) return false;
    
    // Validate we haven't picked up a spin-off (like Narcos Mexico instead of Narcos)
    const prefix = titleLower.substring(0, matchIdx).replace(/[^a-z0-9]/g, ' ').trim().split(/\s+/);
    const extraWords = prefix.filter(w => 
        w.length > 0 && 
        !showWords.includes(w) && 
        !/^(19|20)\d{2}$/.test(w) &&
        !['the', 'a', 'an', 'tv'].includes(w)
    );
    
    if (extraWords.length > 0) return false;
    
    return true;
  });
}

class AutoDownloader {
  private processing = false;
  private queue: NewEpisodeInfo[] = [];

  private isEpisodeStillEligible(ep: NewEpisodeInfo): boolean {
    if (ep.isManual) {
      // Manual requests: only verify the show exists in library
      const row = db.prepare(`
        SELECT 1
        FROM shows s
        WHERE s.id = ?
        LIMIT 1
      `).get(ep.showId);
      return !!row;
    }

    const row = db.prepare(`
      SELECT 1
      FROM auto_track at
      JOIN shows s ON s.id = at.showId
      WHERE at.showId = ?
        AND at.tmdbId = ?
        AND at.enabled = 1
        AND EXISTS (SELECT 1 FROM episodes e WHERE e.showId = at.showId)
      LIMIT 1
    `).get(ep.showId, ep.tmdbId);

    return !!row;
  }

  /**
   * Process a list of new episodes from the release monitor or manual actions.
   * Finds and downloads the best available torrent for each.
   */
  async processNewEpisodes(episodes: NewEpisodeInfo[]): Promise<void> {
    this.queue.push(...episodes);
    if (this.processing) {
      console.log(`[AutoDownloader] Already processing, queued ${episodes.length} episode(s) (total queued: ${this.queue.length})`);
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const ep = this.queue.shift()!;
        try {
          if (!this.isEpisodeStillEligible(ep)) {
            console.log(`[AutoDownloader] Skipping ${ep.showTitle} S${ep.seasonNumber}E${ep.episodeNumber}: show is not tracked or eligible`);
            continue;
          }

          await this.findAndDownload(ep);
          // Small delay between searches to avoid rate limiting
          if (this.queue.length > 0) {
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (e) {
          console.error(`[AutoDownloader] Error processing ${ep.showTitle} S${ep.seasonNumber}E${ep.episodeNumber}:`, e);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Find the best torrent and start downloading for a single episode.
   */
  async findAndDownload(ep: NewEpisodeInfo): Promise<boolean> {
    if (!this.isEpisodeStillEligible(ep)) {
      console.log(`[AutoDownloader] Skipping ${ep.showTitle} S${ep.seasonNumber}E${ep.episodeNumber}: show is not tracked or eligible`);
      return false;
    }

    const query = buildEpisodeQuery(ep.showTitle, ep.seasonNumber, ep.episodeNumber);
    const epLabel = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
    console.log(`[AutoDownloader] Searching for: "${query}"`);

    try {
      const results = await searchTorrents(query, {
        type: 'tv',
        tmdbId: ep.tmdbId,
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
      });

      if (!results || results.length === 0) {
        console.log(`[AutoDownloader] No results found for "${query}"`);
        this.markRetry(ep);
        if (ep.isManual) {
          releaseMonitor.createNotification({
            type: 'download_failed',
            title: 'Download Failed',
            message: `No suitable torrent found for ${ep.showTitle} ${epLabel}`,
            showId: ep.showId,
            tmdbId: ep.tmdbId,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            posterPath: ep.posterPath,
          });
        }
        return false;
      }

      // Filter for the specific episode and exact show name
      const episodeResults = filterForEpisode(results, ep.showTitle, ep.seasonNumber, ep.episodeNumber);

      if (episodeResults.length === 0) {
        console.log(`[AutoDownloader] No episode-specific results for "${query}" (${results.length} general results)`);
        this.markRetry(ep);
        if (ep.isManual) {
          releaseMonitor.createNotification({
            type: 'download_failed',
            title: 'Download Failed',
            message: `No episode-specific results for ${ep.showTitle} ${epLabel}`,
            showId: ep.showId,
            tmdbId: ep.tmdbId,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            posterPath: ep.posterPath,
          });
        }
        return false;
      }

      // Calculate maxQualityScore across all episode results
      const maxQualityScore = episodeResults.reduce((max, r) => {
        const score = QUALITY_SCORES[r.quality || 'Unknown'] || QUALITY_SCORES['Unknown'];
        return score > max ? score : max;
      }, 0);

      // Score and rank results
      const scored = episodeResults
        .map(r => ({ ...r, _score: scoreTorrent(r, ep.qualityPreference, maxQualityScore) }))
        .sort((a, b) => b._score - a._score);

      const best = scored[0];
      console.log(`[AutoDownloader] Best result: "${best.title}" (score: ${best._score}, quality: ${best.quality}, seeds: ${best.seeds}, size: ${best.size})`);

      // Only download if score is reasonable
      if (best._score < 30) {
        console.log(`[AutoDownloader] Best result score too low (${best._score}), marking for retry`);
        this.markRetry(ep);
        if (ep.isManual) {
          releaseMonitor.createNotification({
            type: 'download_failed',
            title: 'Download Failed',
            message: `Best source quality too low for ${ep.showTitle} ${epLabel}`,
            showId: ep.showId,
            tmdbId: ep.tmdbId,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            posterPath: ep.posterPath,
          });
        }
        return false;
      }

      // Format clean filename for direct downloads
      let customFilename: string | undefined = undefined;
      if (best.magnet.startsWith('http-direct:')) {
        const isJunkName = !best.title || /cinejoy|fsl_server|^4k\s*\[/i.test(best.title);
        if (!isJunkName) {
          customFilename = best.title.endsWith('.mkv') || best.title.endsWith('.mp4')
            ? best.title
            : `${best.title}.mkv`;
        } else {
          customFilename = `${ep.showTitle} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} [${best.quality || '1080p'}].mkv`;
        }
      }

      // Start the download
      const download = await downloadManager.addDownload(best.magnet, undefined, undefined, customFilename);

      // Upsert into episode_releases
      db.prepare(`
        INSERT INTO episode_releases (tmdbId, seasonNumber, episodeNumber, episodeTitle, airDate, downloadAttempted, downloadId, lastAttemptAt)
        VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(tmdbId, seasonNumber, episodeNumber) DO UPDATE SET
          downloadAttempted = 1,
          downloadId = excluded.downloadId,
          lastAttemptAt = CURRENT_TIMESTAMP
      `).run(ep.tmdbId, ep.seasonNumber, ep.episodeNumber, ep.episodeTitle, ep.airDate, download.id);

      // Create notification
      releaseMonitor.createNotification({
        type: 'download_started',
        title: ep.isManual ? 'Download Started' : 'Auto-Download Started',
        message: `${ep.showTitle} ${epLabel} — ${best.quality} (${best.size})`,
        showId: ep.showId,
        tmdbId: ep.tmdbId,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        posterPath: ep.posterPath,
      });

      console.log(`[AutoDownloader] Download started for ${ep.showTitle} ${epLabel}`);
      return true;
    } catch (e) {
      console.error(`[AutoDownloader] Search/download error for "${query}":`, e);
      this.markRetry(ep);
      if (ep.isManual) {
        releaseMonitor.createNotification({
          type: 'download_failed',
          title: 'Download Failed',
          message: `Error searching for ${ep.showTitle} ${epLabel}`,
          showId: ep.showId,
          tmdbId: ep.tmdbId,
          seasonNumber: ep.seasonNumber,
          episodeNumber: ep.episodeNumber,
          posterPath: ep.posterPath,
        });
      }
      return false;
    }
  }

  /**
   * Mark an episode for retry on the next cycle.
   */
  private markRetry(ep: NewEpisodeInfo): void {
    db.prepare(`
      INSERT INTO episode_releases (tmdbId, seasonNumber, episodeNumber, episodeTitle, airDate, lastAttemptAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tmdbId, seasonNumber, episodeNumber) DO UPDATE SET
        lastAttemptAt = CURRENT_TIMESTAMP
    `).run(ep.tmdbId, ep.seasonNumber, ep.episodeNumber, ep.episodeTitle, ep.airDate);
  }

  /**
   * Check for episodes that need retry (aired but not yet downloaded).
   * Called on server startup and periodically by the release monitor.
   */
  async retryPendingEpisodes(): Promise<void> {
    // Find episodes that:
    // 1. Belong to enabled tracked shows
    // 2. Have aired (airDate <= today)
    // 3. Are missing from the local episodes table
    // 4. Haven't been successfully downloaded yet (downloadAttempted = 0 OR download status is error/null)
    // 5. Haven't been attempted in the last 15 minutes
    const pendingEpisodes = db.prepare(`
      SELECT er.*, at.showId, at.title as showTitle, at.qualityPreference,
             (SELECT posterPath FROM shows WHERE id = at.showId) as posterPath
      FROM episode_releases er
      JOIN auto_track at ON er.tmdbId = at.tmdbId AND at.enabled = 1
      JOIN shows s ON s.id = at.showId
      LEFT JOIN downloads d ON er.downloadId = d.id
      WHERE er.airDate <= date('now')
        AND EXISTS (SELECT 1 FROM episodes e WHERE e.showId = at.showId)
        AND NOT EXISTS (
          SELECT 1 FROM episodes e 
          WHERE e.showId = at.showId 
            AND e.seasonNumber = er.seasonNumber 
            AND e.episodeNumber = er.episodeNumber
        )
        AND (er.downloadAttempted = 0 OR d.status IN ('error') OR (er.downloadId IS NULL AND er.downloadAttempted = 1))
        AND (er.lastAttemptAt IS NULL OR er.lastAttemptAt < datetime('now', '-15 minutes'))
      ORDER BY er.seasonNumber ASC, er.episodeNumber ASC
    `).all() as any[];

    if (pendingEpisodes.length === 0) return;

    console.log(`[AutoDownloader] Retrying/downloading ${pendingEpisodes.length} missing episode(s)...`);

    const episodes: NewEpisodeInfo[] = pendingEpisodes.map(ep => ({
      tmdbId: ep.tmdbId,
      showId: ep.showId,
      showTitle: ep.showTitle,
      seasonNumber: ep.seasonNumber,
      episodeNumber: ep.episodeNumber,
      episodeTitle: ep.episodeTitle || `Episode ${ep.episodeNumber}`,
      airDate: ep.airDate,
      posterPath: ep.posterPath || null,
      qualityPreference: ep.qualityPreference || '1080p',
    }));

    await this.processNewEpisodes(episodes);
  }

  /**
   * Get status of auto-download queue.
   */
  getStatus(): AutoDownloadStatus {
    const pending = db.prepare(`
      SELECT COUNT(*) as count FROM episode_releases er
      JOIN auto_track at ON er.tmdbId = at.tmdbId AND at.enabled = 1
      JOIN shows s ON s.id = at.showId
      WHERE er.downloadAttempted = 0 AND er.airDate <= date('now')
        AND EXISTS (SELECT 1 FROM episodes e WHERE e.showId = at.showId)
        AND NOT EXISTS (
          SELECT 1 FROM episodes e 
          WHERE e.showId = at.showId 
            AND e.seasonNumber = er.seasonNumber 
            AND e.episodeNumber = er.episodeNumber
        )
    `).get() as { count: number };

    const retrying = db.prepare(`
      SELECT COUNT(*) as count FROM episode_releases er
      JOIN auto_track at ON er.tmdbId = at.tmdbId AND at.enabled = 1
      JOIN shows s ON s.id = at.showId
      LEFT JOIN downloads d ON er.downloadId = d.id
      WHERE er.downloadAttempted = 1 AND (d.status = 'error' OR er.downloadId IS NULL)
        AND er.airDate <= date('now')
        AND EXISTS (SELECT 1 FROM episodes e WHERE e.showId = at.showId)
        AND NOT EXISTS (
          SELECT 1 FROM episodes e 
          WHERE e.showId = at.showId 
            AND e.seasonNumber = er.seasonNumber 
            AND e.episodeNumber = er.episodeNumber
        )
    `).get() as { count: number };

    const completed = db.prepare(`
      SELECT COUNT(*) as count FROM episode_releases er
      JOIN downloads d ON er.downloadId = d.id
      WHERE d.status = 'completed'
    `).get() as { count: number };

    const failed = db.prepare(`
      SELECT COUNT(*) as count FROM episode_releases er
      JOIN auto_track at ON er.tmdbId = at.tmdbId AND at.enabled = 1
      JOIN shows s ON s.id = at.showId
      JOIN downloads d ON er.downloadId = d.id
      WHERE d.status = 'error'
        AND EXISTS (SELECT 1 FROM episodes e WHERE e.showId = at.showId)
    `).get() as { count: number };

    return {
      pending: pending?.count || 0,
      retrying: retrying?.count || 0,
      completed: completed?.count || 0,
      failed: failed?.count || 0,
    };
  }
}

// Singleton
const autoDownloader = new AutoDownloader();
export default autoDownloader;
