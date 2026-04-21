/**
 * Movie Release Monitor — Checks torrent sources for watchlist movies
 * that have become available for download. Does NOT auto-download;
 * only creates notifications so the user can download manually.
 */

import db from './db';
import { searchTorrents, TorrentResult } from './torrentSearch';
import releaseMonitor from './releaseMonitor';

// Re-use the same quality scoring from autoDownloader
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

/** Minimum score to consider a movie "available" */
const MIN_AVAILABLE_SCORE = 30;

/** Don't re-check a movie more often than this */
const RE_CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Delay between consecutive torrent searches to avoid rate-limiting */
const SEARCH_DELAY_MS = 5000;

export interface WatchlistMovie {
  id: number;
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  year: string | null;
  trackRelease: number;
}

export interface MovieReleaseRow {
  id: number;
  tmdbId: number;
  title: string;
  mediaType: string;
  posterPath: string | null;
  isAvailable: number;
  notified: number;
  lastCheckedAt: string | null;
  availableAt: string | null;
  bestResult: string | null;
  addedAt: string;
}

/**
 * Score a torrent result for a movie (simplified from autoDownloader).
 */
function scoreMovieTorrent(result: TorrentResult): number {
  let score = 0;

  const quality = result.quality || 'Unknown';
  score += QUALITY_SCORES[quality] || QUALITY_SCORES['Unknown'];

  // DDL bonus
  if (result.source === 'DDL') {
    score += 1000;
  }

  // Seed count bonus
  if (result.seeds > 0) {
    score += Math.min(20, Math.log2(result.seeds) * 3);
  }

  // Size heuristic for movies (prefer 1–20 GB range)
  if (result.sizeBytes > 0) {
    const sizeGB = result.sizeBytes / (1024 ** 3);
    if (sizeGB >= 1 && sizeGB <= 5) score += 10;
    else if (sizeGB > 5 && sizeGB <= 20) score += 15;
    else if (sizeGB > 50) score -= 20;
  }

  // Source bonuses
  const titleLower = result.title.toLowerCase();
  const sourceBonuses: [string, number][] = [
    ['remux', 15], ['bluray', 10], ['web-dl', 5], ['hevc', 3], ['x265', 3], ['10bit', 2],
  ];
  for (const [tag, bonus] of sourceBonuses) {
    if (titleLower.includes(tag)) score += bonus;
  }

  // Penalty for CAM/TS quality
  if (/\b(cam|ts|telesync|telecine|hdcam)\b/i.test(result.title)) {
    score -= 40;
  }

  return Math.max(0, score);
}

class MovieReleaseMonitor {
  private interval: NodeJS.Timeout | null = null;
  private checking = false;
  private started = false;

  /**
   * Start the monitor loop. Default interval: 60 minutes.
   */
  start(intervalMs = 60 * 60 * 1000): void {
    if (this.started) return;
    this.started = true;

    console.log(`[MovieReleaseMonitor] Starting with ${intervalMs / 60000}min interval`);

    // Initial check after a short delay (let the server fully boot)
    setTimeout(async () => {
      try {
        await this.checkAllWatchlistMovies();
      } catch (e) {
        console.error('[MovieReleaseMonitor] Initial check failed:', e);
      }
    }, 15000);

    // Recurring checks
    this.interval = setInterval(async () => {
      try {
        await this.checkAllWatchlistMovies();
      } catch (e) {
        console.error('[MovieReleaseMonitor] Periodic check failed:', e);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.started = false;
    console.log('[MovieReleaseMonitor] Stopped');
  }

  /**
   * Check all tracked watchlist movies for download availability.
   */
  async checkAllWatchlistMovies(): Promise<number> {
    if (this.checking) {
      console.log('[MovieReleaseMonitor] Already checking, skipping...');
      return 0;
    }

    this.checking = true;
    let newlyAvailable = 0;

    try {
      // Get all watchlist movies with tracking enabled
      const movies = db.prepare(
        "SELECT * FROM watchlist WHERE mediaType = 'movie' AND trackRelease = 1 ORDER BY addedAt DESC"
      ).all() as WatchlistMovie[];

      if (movies.length === 0) {
        console.log('[MovieReleaseMonitor] No tracked movies in watchlist');
        return 0;
      }

      // Get tmdbIds of movies already in the local library
      const libraryTmdbIds = new Set(
        (db.prepare('SELECT tmdbId FROM movies WHERE tmdbId IS NOT NULL').all() as { tmdbId: number }[])
          .map(m => m.tmdbId)
      );

      // Filter out movies already in library
      const moviesToCheck = movies.filter(m => !libraryTmdbIds.has(m.tmdbId));

      if (moviesToCheck.length === 0) {
        console.log('[MovieReleaseMonitor] All tracked movies are already in library');
        return 0;
      }

      console.log(`[MovieReleaseMonitor] Checking ${moviesToCheck.length} watchlist movies...`);

      for (const movie of moviesToCheck) {
        try {
          const available = await this.checkMovie(movie);
          if (available) newlyAvailable++;

          // Rate limit between searches
          await new Promise(r => setTimeout(r, SEARCH_DELAY_MS));
        } catch (e) {
          console.error(`[MovieReleaseMonitor] Error checking "${movie.title}":`, e);
        }
      }

      if (newlyAvailable > 0) {
        console.log(`[MovieReleaseMonitor] Found ${newlyAvailable} newly available movies`);
      }
    } finally {
      this.checking = false;
    }

    return newlyAvailable;
  }

  /**
   * Check a single movie for download availability.
   * Returns true if the movie is newly available (first time detected).
   */
  async checkMovie(movie: WatchlistMovie): Promise<boolean> {
    // Check cooldown — don't re-check if recently checked
    const existing = db.prepare(
      'SELECT * FROM movie_releases WHERE tmdbId = ?'
    ).get(movie.tmdbId) as MovieReleaseRow | undefined;

    if (existing?.lastCheckedAt) {
      const lastCheck = new Date(existing.lastCheckedAt.replace(' ', 'T') + 'Z').getTime();
      if (Date.now() - lastCheck < RE_CHECK_COOLDOWN_MS) {
        return false; // Too soon to re-check
      }
    }

    // Already available and notified — skip
    if (existing?.isAvailable && existing?.notified) {
      return false;
    }

    // Build search query
    const searchTitle = movie.year
      ? `${movie.title} ${movie.year}`
      : movie.title;

    console.log(`[MovieReleaseMonitor] Searching: "${searchTitle}"`);

    const results = await searchTorrents(searchTitle, {
      type: 'movie',
      year: movie.year || undefined,
    });

    // Upsert movie_releases row
    db.prepare(`
      INSERT INTO movie_releases (tmdbId, title, mediaType, posterPath, lastCheckedAt)
      VALUES (?, ?, 'movie', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tmdbId) DO UPDATE SET
        lastCheckedAt = CURRENT_TIMESTAMP
    `).run(movie.tmdbId, movie.title, movie.posterPath);

    if (!results || results.length === 0) {
      console.log(`[MovieReleaseMonitor] No results for "${movie.title}"`);
      return false;
    }

    // Score and find the best result
    const scored = results
      .map(r => ({ ...r, _score: scoreMovieTorrent(r) }))
      .sort((a, b) => b._score - a._score);

    const best = scored[0];

    if (best._score < MIN_AVAILABLE_SCORE) {
      console.log(`[MovieReleaseMonitor] Best result for "${movie.title}" scored ${best._score} (too low)`);
      return false;
    }

    // Movie is available!
    const bestResultJson = JSON.stringify({
      title: best.title,
      quality: best.quality,
      size: best.size,
      seeds: best.seeds,
      source: best.source,
      score: best._score,
    });

    const wasAlreadyAvailable = existing?.isAvailable === 1;

    db.prepare(`
      UPDATE movie_releases
      SET isAvailable = 1, bestResult = ?, availableAt = COALESCE(availableAt, CURRENT_TIMESTAMP)
      WHERE tmdbId = ?
    `).run(bestResultJson, movie.tmdbId);

    // Only notify if not already notified
    if (!existing?.notified) {
      const qualityInfo = best.quality !== 'Unknown' ? ` — ${best.quality}` : '';
      const sourceInfo = best.source ? ` (${best.source})` : '';

      releaseMonitor.createNotification({
        type: 'movie_available',
        title: 'Movie Now Available',
        message: `${movie.title}${movie.year ? ` (${movie.year})` : ''} is available to download${qualityInfo}${sourceInfo}`,
        tmdbId: movie.tmdbId,
        posterPath: movie.posterPath,
        actionUrl: `/watchlist`,
      });

      db.prepare(
        'UPDATE movie_releases SET notified = 1 WHERE tmdbId = ?'
      ).run(movie.tmdbId);

      console.log(`[MovieReleaseMonitor] ✓ "${movie.title}" is available! (${best.quality}, ${best.size}, score: ${best._score})`);
      return true;
    }

    return !wasAlreadyAvailable;
  }

  /**
   * Manually check a specific movie (triggered from API).
   */
  async checkSingleMovie(tmdbId: number): Promise<{ available: boolean; bestResult: any | null }> {
    const movie = db.prepare(
      "SELECT * FROM watchlist WHERE tmdbId = ? AND mediaType = 'movie'"
    ).get(tmdbId) as WatchlistMovie | undefined;

    if (!movie) {
      return { available: false, bestResult: null };
    }

    // Force check by clearing cooldown
    db.prepare(
      'UPDATE movie_releases SET lastCheckedAt = NULL WHERE tmdbId = ?'
    ).run(tmdbId);

    const available = await this.checkMovie(movie);

    const release = db.prepare(
      'SELECT * FROM movie_releases WHERE tmdbId = ?'
    ).get(tmdbId) as MovieReleaseRow | undefined;

    return {
      available: release?.isAvailable === 1,
      bestResult: release?.bestResult ? JSON.parse(release.bestResult) : null,
    };
  }

  /**
   * Get availability status for all watchlist movies.
   */
  getStatus(): MovieReleaseRow[] {
    return db.prepare(
      'SELECT * FROM movie_releases ORDER BY addedAt DESC'
    ).all() as MovieReleaseRow[];
  }

  /**
   * Get availability for a specific movie.
   */
  getMovieStatus(tmdbId: number): MovieReleaseRow | null {
    return (db.prepare(
      'SELECT * FROM movie_releases WHERE tmdbId = ?'
    ).get(tmdbId) as MovieReleaseRow) || null;
  }
}

// Singleton
const movieReleaseMonitor = new MovieReleaseMonitor();
export default movieReleaseMonitor;
