/**
 * Auto Episode Downloader — Automatically finds and downloads missing episodes
 * in the highest available quality using the existing torrent search infrastructure.
 */

import db from './db';
import { searchTorrents, TorrentResult, isDirectDownloadMatch, isCamQualityResult } from './torrentSearch';
import downloadManager from './downloader';
import releaseMonitor, { NewEpisodeInfo } from './releaseMonitor';

// Quality tiers for scoring
const QUALITY_SCORES: Record<string, number> = {
  '2160p': 100, '4K': 100, 'UHD': 100, '4K (2160p)': 100,
  '1440p': 90, '2K': 90, '2K (1440p)': 90,
  '1080p': 80,
  '720p': 60,
  '480p': 30,
  'HDRip': 50, 'BDRip': 70, 'BluRay': 85,
  'WEBRip': 75, 'WEB-DL': 80,
  'HDTV': 55,
  'CAM': 5, 'TS': 10,
  'Unknown': 20,
};

export function getQualityScore(quality?: string): number {
  if (!quality) return QUALITY_SCORES['Unknown'];
  if (QUALITY_SCORES[quality] !== undefined) return QUALITY_SCORES[quality];
  if (/2160|4k|uhd/i.test(quality)) return 100;
  if (/1440|2k/i.test(quality)) return 90;
  if (/1080/i.test(quality)) return 80;
  if (/720/i.test(quality)) return 60;
  if (/480/i.test(quality)) return 30;
  return QUALITY_SCORES['Unknown'];
}

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

export function getResolutionTier(quality?: string): number {
  if (!quality) return 0;
  const q = quality.toLowerCase();
  if (/2160|4k|uhd/i.test(q)) return 5;
  if (/1440|2k/i.test(q)) return 4;
  if (/1080/i.test(q)) return 3;
  if (/720/i.test(q)) return 2;
  if (/480|576/i.test(q)) return 1;
  if (/bluray|remux|bdrip/i.test(q)) return 3; // Typically 1080p
  if (/web[\s.-]?dl|webrip/i.test(q)) return 2.5;
  return 0.5;
}

export function getResolutionTierBaseScore(quality?: string, preferredQuality?: string): number {
  const tier = getResolutionTier(quality);
  const pref = (preferredQuality || 'best').toLowerCase();

  // If preference is 1080p specifically
  if (pref === '1080p') {
    if (tier === 3) return 100_000;      // 1080p is top tier
    if (tier === 2) return 80_000;       // 720p fallback
    if (tier === 1) return 60_000;       // 480p fallback
    if (tier >= 4) return 40_000;        // 4K fallback
    return 10_000;
  }

  if (pref === '720p') {
    if (tier === 2) return 100_000;      // 720p is top tier
    if (tier === 1) return 80_000;       // 480p fallback
    if (tier === 3) return 60_000;       // 1080p fallback
    if (tier >= 4) return 40_000;        // 4K fallback
    return 10_000;
  }

  // Default: 'best', '2160p', 'any', or unspecified — resolution comes strictly first:
  // 2160p (100,000) > 1440p (80,000) > 1080p (60,000) > 720p (40,000) > 480p (20,000)
  if (tier >= 5) return 100_000;         // 2160p / 4K / UHD
  if (tier >= 4) return 80_000;          // 1440p / 2K
  if (tier >= 3) return 60_000;          // 1080p / FHD
  if (tier >= 2) return 40_000;          // 720p / HD
  if (tier >= 1) return 20_000;          // 480p / SD
  return 10_000;                         // Unknown / non-cam
}

/**
 * Score a candidate release by resolution tier, provider source (DDL first within tier), seeds, and size.
 */
export function scoreTorrent(result: TorrentResult, preferredQuality: string, maxQualityScore?: number): number {
  // If a direct download is known to have exceeded its quota, disqualify immediately
  if ((result as any).quotaExceeded) {
    return 0;
  }

  // Disqualify CAM / TS releases
  if (isCamQualityResult(result)) {
    return 0;
  }

  const quality = result.quality || 'Unknown';
  let score = getResolutionTierBaseScore(quality, preferredQuality);

  // Within the same resolution tier, Direct Download (DDL) is prioritized first over torrents.
  // DDL receives +10,000 bonus.
  // Torrents receive up to +5,000 bonus based on seeders/peers.
  // This guarantees:
  // 1) 2160p DDL (110,000+) beats 2160p Torrent (100,000 - 105,000)
  // 2) 2160p Torrent (100,000+) ALWAYS beats 1080p DDL (70,000+)
  // 3) Within torrents in the same tier, higher seeders/peers always beat lower seeders.
  if (result.source === 'DDL') {
    score += 10_000;
  } else if (result.seeds > 0) {
    score += Math.min(5_000, Math.log2(result.seeds + 1) * 500);
  }

  // Source & encoding bonuses (check title for encoding info)
  const titleLower = result.title.toLowerCase();
  for (const [tag, bonus] of Object.entries(SOURCE_BONUS)) {
    if (titleLower.includes(tag.toLowerCase())) {
      score += bonus * 15;
    }
  }

  // Size heuristic: prefer healthy file sizes (1 - 25 GB for episodes)
  if (result.sizeBytes > 0) {
    const sizeGB = result.sizeBytes / (1024 ** 3);
    if (sizeGB >= 1 && sizeGB <= 8) score += 200;
    else if (sizeGB > 8 && sizeGB <= 25) score += 300;
    else if (sizeGB > 50) score -= 2_000; // likely a full season pack or raw rip
  }

  // Penalty for obvious season packs (we want single episodes)
  if (/complete|full\s*season|s\d+\s*(?:complete|pack)/i.test(result.title)) {
    score -= 5_000;
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
    // Validate DDL results against show title, season, and episode
    if (r.source === 'DDL') {
      return isDirectDownloadMatch(r, showTitle, { mediaType: 'tv', season, episode });
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
        const score = getQualityScore(r.quality);
        return score > max ? score : max;
      }, 0);

      // Score and rank results
      const scored = episodeResults
        .map(r => ({ ...r, _score: scoreTorrent(r, ep.qualityPreference, maxQualityScore) }))
        .sort((a, b) => b._score - a._score);

      const best = scored[0];
      console.log(`[AutoDownloader] Best result: "${best.title}" (score: ${best._score}, quality: ${best.quality}, seeds: ${best.seeds}, size: ${best.size})`);

      // Only download if best score is reasonable
      if (best._score < 1_000) {
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

      // Try candidates in strict ranked order (e.g. 2160p DDL -> 2160p torrent -> 1080p DDL -> 1080p torrent)
      // If a candidate throws an error upon initiation, seamlessly fall back to the next candidate.
      let download: any = null;
      let chosenResult: (typeof scored)[0] | null = null;
      let lastInitiationError: any = null;

      for (const candidate of scored) {
        if (candidate._score < 1_000) break;

        // Format clean filename for direct downloads
        let customFilename: string | undefined = undefined;
        if (candidate.magnet.startsWith('http-direct:')) {
          const isJunkName = !candidate.title || /cinejoy|fsl_server|^4k\s*\[/i.test(candidate.title);
          if (!isJunkName) {
            customFilename = candidate.title.endsWith('.mkv') || candidate.title.endsWith('.mp4')
              ? candidate.title
              : `${candidate.title}.mkv`;
          } else {
            customFilename = `${ep.showTitle} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} [${candidate.quality || '1080p'}].mkv`;
          }
        }

        try {
          const target = ep.target;
          download = target && target !== 'local'
            ? await downloadManager.addDownload(candidate.magnet, undefined, undefined, customFilename, target)
            : await downloadManager.addDownload(candidate.magnet, undefined, undefined, customFilename);

          chosenResult = candidate;
          console.log(`[AutoDownloader] Download started for ${ep.showTitle} ${epLabel} using "${candidate.title}" (source: ${candidate.source}, quality: ${candidate.quality})`);
          break;
        } catch (initErr) {
          lastInitiationError = initErr;
          console.warn(`[AutoDownloader] Failed to initiate candidate "${candidate.title}" (${candidate.source}), falling back to next candidate:`, initErr);
        }
      }

      if (!download || !chosenResult) {
        console.error(`[AutoDownloader] All candidate downloads failed to initiate for ${ep.showTitle} ${epLabel}:`, lastInitiationError);
        this.markRetry(ep);
        if (ep.isManual) {
          releaseMonitor.createNotification({
            type: 'download_failed',
            title: 'Download Failed',
            message: `Could not start download for ${ep.showTitle} ${epLabel}`,
            showId: ep.showId,
            tmdbId: ep.tmdbId,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            posterPath: ep.posterPath,
          });
        }
        return false;
      }

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
        message: `${ep.showTitle} ${epLabel} — ${chosenResult.quality} (${chosenResult.size})`,
        showId: ep.showId,
        tmdbId: ep.tmdbId,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        posterPath: ep.posterPath,
      });

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
      SELECT er.*, at.showId, at.title as showTitle, at.qualityPreference, at.target,
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

    let globalDefaultTarget: string | null = null;
    try {
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'autoDownloadTarget'").get() as { value: string } | undefined;
      if (setting?.value) globalDefaultTarget = setting.value;
    } catch { /* ignore */ }

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
      target: (ep.target && ep.target !== 'local' ? ep.target : (globalDefaultTarget || ep.target || 'local')) as any,
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
export { autoDownloader };
export default autoDownloader;
