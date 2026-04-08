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
  'HEVC': 3,
  'x265': 3,
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
function scoreTorrent(result: TorrentResult, preferredQuality: string): number {
  let score = 0;

  // Base quality score
  const quality = result.quality || 'Unknown';
  score += QUALITY_SCORES[quality] || QUALITY_SCORES['Unknown'];

  // Massive bonus for DDLs (User preference: check DDL first, fallback to torrent)
  if (result.source === 'DDL') {
    score += 1000;
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

  /**
   * Process a list of new episodes from the release monitor.
   * Finds and downloads the best available torrent for each.
   */
  async processNewEpisodes(episodes: NewEpisodeInfo[]): Promise<void> {
    if (this.processing) {
      console.log('[AutoDownloader] Already processing, queuing for next cycle');
      return;
    }

    this.processing = true;

    try {
      for (const ep of episodes) {
        try {
          await this.findAndDownload(ep);
          // Small delay between searches to avoid rate limiting
          await new Promise(r => setTimeout(r, 2000));
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
    const query = buildEpisodeQuery(ep.showTitle, ep.seasonNumber, ep.episodeNumber);
    console.log(`[AutoDownloader] Searching for: "${query}"`);

    try {
      const results = await searchTorrents(query, { type: 'tv' });

      if (!results || results.length === 0) {
        console.log(`[AutoDownloader] No results found for "${query}"`);
        this.markRetry(ep);
        return false;
      }

      // Filter for the specific episode and exact show name
      const episodeResults = filterForEpisode(results, ep.showTitle, ep.seasonNumber, ep.episodeNumber);

      if (episodeResults.length === 0) {
        console.log(`[AutoDownloader] No episode-specific results for "${query}" (${results.length} general results)`);
        this.markRetry(ep);
        return false;
      }

      // Score and rank results
      const scored = episodeResults
        .map(r => ({ ...r, _score: scoreTorrent(r, ep.qualityPreference) }))
        .sort((a, b) => b._score - a._score);

      const best = scored[0];
      console.log(`[AutoDownloader] Best result: "${best.title}" (score: ${best._score}, quality: ${best.quality}, seeds: ${best.seeds}, size: ${best.size})`);

      // Only download if score is reasonable
      if (best._score < 30) {
        console.log(`[AutoDownloader] Best result score too low (${best._score}), marking for retry`);
        this.markRetry(ep);
        return false;
      }

      // Start the download
      const download = await downloadManager.addDownload(best.magnet);

      // Update episode_releases
      db.prepare(`
        UPDATE episode_releases 
        SET downloadAttempted = 1, downloadId = ?, lastAttemptAt = CURRENT_TIMESTAMP 
        WHERE tmdbId = ? AND seasonNumber = ? AND episodeNumber = ?
      `).run(download.id, ep.tmdbId, ep.seasonNumber, ep.episodeNumber);

      // Create notification
      const epLabel = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
      releaseMonitor.createNotification({
        type: 'download_started',
        title: 'Auto-Download Started',
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
      return false;
    }
  }

  /**
   * Mark an episode for retry on the next cycle.
   */
  private markRetry(ep: NewEpisodeInfo): void {
    db.prepare(`
      UPDATE episode_releases SET lastAttemptAt = CURRENT_TIMESTAMP 
      WHERE tmdbId = ? AND seasonNumber = ? AND episodeNumber = ?
    `).run(ep.tmdbId, ep.seasonNumber, ep.episodeNumber);
  }

  /**
   * Check for episodes that need retry (aired but not yet downloaded).
   * Called on server startup and periodically by the release monitor.
   */
  async retryPendingEpisodes(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_RETRY_DAYS);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    // Find episodes that:
    // 1. Haven't been downloaded yet (downloadAttempted = 0 OR downloadId is null with no completed download)
    // 2. Were aired within the retry window
    // 3. Belong to enabled tracked shows
    const pendingEpisodes = db.prepare(`
      SELECT er.*, at.showId, at.title as showTitle, at.qualityPreference,
             (SELECT posterPath FROM shows WHERE id = at.showId) as posterPath
      FROM episode_releases er
      JOIN auto_track at ON er.tmdbId = at.tmdbId AND at.enabled = 1
      LEFT JOIN downloads d ON er.downloadId = d.id
      WHERE er.airDate >= ?
        AND er.airDate <= date('now')
        AND (er.downloadAttempted = 0 OR d.status IN ('error') OR er.downloadId IS NULL)
        AND (er.lastAttemptAt IS NULL OR er.lastAttemptAt < datetime('now', '-30 minutes'))
    `).all(cutoff) as any[];

    if (pendingEpisodes.length === 0) return;

    console.log(`[AutoDownloader] Retrying ${pendingEpisodes.length} pending episodes...`);

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
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_RETRY_DAYS);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    const pending = db.prepare(`
      SELECT COUNT(*) as count FROM episode_releases er
      JOIN auto_track at ON er.tmdbId = at.tmdbId AND at.enabled = 1
      WHERE er.downloadAttempted = 0 AND er.airDate >= ? AND er.airDate <= date('now')
    `).get(cutoff) as { count: number };

    const retrying = db.prepare(`
      SELECT COUNT(*) as count FROM episode_releases er
      JOIN auto_track at ON er.tmdbId = at.tmdbId AND at.enabled = 1
      LEFT JOIN downloads d ON er.downloadId = d.id
      WHERE er.downloadAttempted = 1 AND (d.status = 'error' OR er.downloadId IS NULL)
        AND er.airDate >= ?
    `).get(cutoff) as { count: number };

    const completed = db.prepare(`
      SELECT COUNT(*) as count FROM episode_releases er
      JOIN downloads d ON er.downloadId = d.id
      WHERE d.status = 'completed'
    `).get() as { count: number };

    const failed = db.prepare(`
      SELECT COUNT(*) as count FROM episode_releases er
      WHERE er.airDate < ? AND er.downloadAttempted = 0
    `).get(cutoff) as { count: number };

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
