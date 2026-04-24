/**
 * Release Monitor — Checks TMDB for new episodes of tracked shows
 * Creates notifications and triggers auto-downloads when new episodes are detected.
 */

import db from './db';
import { MovieDb } from 'moviedb-promise';
import { getTmdbApiKey, rateLimitedTmdbCall } from './metadata';

// Types
export interface TrackedShow {
  id: number;
  showId: number;
  tmdbId: number;
  title: string;
  enabled: number;
  qualityPreference: string;
  lastCheckedAt: string | null;
  addedAt: string;
}

export interface NewEpisodeInfo {
  tmdbId: number;
  showId: number;
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  airDate: string;
  posterPath: string | null;
  qualityPreference: string;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  showId: number | null;
  tmdbId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  posterPath: string | null;
  read: number;
  actionUrl: string | null;
  createdAt: string;
}

// SSE clients for real-time push
type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
};

class ReleaseMonitor {
  private interval: NodeJS.Timeout | null = null;
  private sseClients: Map<string, SSEClient> = new Map();
  private checking = false;
  private started = false;

  /**
   * Start the monitor loop. Default interval: 30 minutes.
   */
  start(intervalMs = 30 * 60 * 1000): void {
    if (this.started) return;
    this.started = true;

    console.log(`[ReleaseMonitor] Starting with ${intervalMs / 60000}min interval`);

    // Initial check after a short delay (let the server fully boot)
    setTimeout(async () => {
      try {
        await this.checkAllTrackedShows();
      } catch (e) {
        console.error('[ReleaseMonitor] Initial check failed:', e);
      }
    }, 10000);

    // Recurring checks
    this.interval = setInterval(async () => {
      try {
        await this.checkAllTrackedShows();
      } catch (e) {
        console.error('[ReleaseMonitor] Periodic check failed:', e);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.started = false;
    console.log('[ReleaseMonitor] Stopped');
  }

  /**
   * Check all tracked shows for new episodes.
   * Returns list of newly discovered episodes.
   */
  async checkAllTrackedShows(): Promise<NewEpisodeInfo[]> {
    if (this.checking) {
      console.log('[ReleaseMonitor] Already checking, skipping...');
      return [];
    }

    this.checking = true;
    const allNewEpisodes: NewEpisodeInfo[] = [];

    try {
      const trackedShows = db.prepare(
        `
          SELECT at.*
          FROM auto_track at
          JOIN shows s ON s.id = at.showId
          WHERE at.enabled = 1
            AND EXISTS (SELECT 1 FROM episodes e WHERE e.showId = at.showId)
        `
      ).all() as TrackedShow[];

      if (trackedShows.length === 0) {
        console.log('[ReleaseMonitor] No tracked shows');
        return [];
      }

      console.log(`[ReleaseMonitor] Checking ${trackedShows.length} tracked shows...`);

      for (const show of trackedShows) {
        try {
          const newEpisodes = await this.checkShow(show);
          allNewEpisodes.push(...newEpisodes);

          // Update lastCheckedAt
          db.prepare('UPDATE auto_track SET lastCheckedAt = CURRENT_TIMESTAMP WHERE id = ?')
            .run(show.id);
        } catch (e) {
          console.error(`[ReleaseMonitor] Error checking "${show.title}":`, e);
        }
      }

      if (allNewEpisodes.length > 0) {
        console.log(`[ReleaseMonitor] Found ${allNewEpisodes.length} new episodes total`);
      }
    } finally {
      this.checking = false;
    }

    return allNewEpisodes;
  }

  /**
   * Check a single show for new episodes using TMDB.
   */
  async checkShow(show: TrackedShow): Promise<NewEpisodeInfo[]> {
    const apiKey = getTmdbApiKey();
    const moviedb = new MovieDb(apiKey);
    const newEpisodes: NewEpisodeInfo[] = [];
    const isInitialSync = !show.lastCheckedAt;
    let baselineMarked = 0;

    // Fetch show info to get number of seasons
    const showInfo = await rateLimitedTmdbCall(() =>
      moviedb.tvInfo({ id: show.tmdbId })
    ) as any;

    if (!showInfo || !showInfo.number_of_seasons) return [];

    const posterPath = showInfo.poster_path || null;

    // Get existing local episodes for this show
    const localEpisodes = db.prepare(
      'SELECT seasonNumber, episodeNumber FROM episodes WHERE showId = ?'
    ).all(show.showId) as { seasonNumber: number; episodeNumber: number }[];

    const localEpisodeSet = new Set(
      localEpisodes.map(e => `${e.seasonNumber}x${e.episodeNumber}`)
    );

    // Get already-tracked releases for this show
    const trackedReleases = db.prepare(
      'SELECT seasonNumber, episodeNumber, notified FROM episode_releases WHERE tmdbId = ?'
    ).all(show.tmdbId) as { seasonNumber: number; episodeNumber: number; notified: number }[];

    const trackedReleaseSet = new Set(
      trackedReleases.filter(r => r.notified).map(r => `${r.seasonNumber}x${r.episodeNumber}`)
    );

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Check the last 2 seasons (most relevant for new releases)
    const startSeason = Math.max(1, showInfo.number_of_seasons - 1);

    for (let seasonNum = startSeason; seasonNum <= showInfo.number_of_seasons; seasonNum++) {
      try {
        const seasonData = await rateLimitedTmdbCall(() =>
          moviedb.seasonInfo({ id: show.tmdbId, season_number: seasonNum })
        ) as any;

        if (!seasonData?.episodes) continue;

        for (const ep of seasonData.episodes) {
          const key = `${seasonNum}x${ep.episode_number}`;
          const airDate = ep.air_date || null;

          // Skip if: already in local library, already notified, or not yet aired
          if (localEpisodeSet.has(key)) continue;
          if (trackedReleaseSet.has(key)) continue;
          if (!airDate || airDate > today) continue;

          // This is a new episode that has aired but isn't in the library!
          const episodeInfo: NewEpisodeInfo = {
            tmdbId: show.tmdbId,
            showId: show.showId,
            showTitle: show.title,
            seasonNumber: seasonNum,
            episodeNumber: ep.episode_number,
            episodeTitle: ep.name || `Episode ${ep.episode_number}`,
            airDate,
            posterPath,
            qualityPreference: show.qualityPreference,
          };

          // Upsert into episode_releases
          db.prepare(`
            INSERT OR IGNORE INTO episode_releases (tmdbId, seasonNumber, episodeNumber, episodeTitle, airDate)
            VALUES (?, ?, ?, ?, ?)
          `).run(show.tmdbId, seasonNum, ep.episode_number, ep.name || null, airDate);

          if (isInitialSync) {
            // First-time tracking should establish a baseline, not notify old aired episodes.
            db.prepare(
              'UPDATE episode_releases SET notified = 1 WHERE tmdbId = ? AND seasonNumber = ? AND episodeNumber = ?'
            ).run(show.tmdbId, seasonNum, ep.episode_number);
            baselineMarked++;
            continue;
          }

          // Create notification
          const notifMessage = `${show.title} — S${String(seasonNum).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}: ${ep.name || 'New Episode'}`;

          this.createNotification({
            type: 'new_episode',
            title: 'New Episode Available',
            message: notifMessage,
            showId: show.showId,
            tmdbId: show.tmdbId,
            seasonNumber: seasonNum,
            episodeNumber: ep.episode_number,
            posterPath,
          });

          // Mark as notified
          db.prepare(
            'UPDATE episode_releases SET notified = 1 WHERE tmdbId = ? AND seasonNumber = ? AND episodeNumber = ?'
          ).run(show.tmdbId, seasonNum, ep.episode_number);

          newEpisodes.push(episodeInfo);
        }
      } catch (e) {
        console.error(`[ReleaseMonitor] Error fetching S${seasonNum} for "${show.title}":`, e);
      }
    }

    if (isInitialSync && baselineMarked > 0) {
      console.log(`[ReleaseMonitor] Baseline sync for "${show.title}": marked ${baselineMarked} aired episodes as already seen`);
    }

    return newEpisodes;
  }

  /**
   * Create a notification and broadcast via SSE.
   */
  createNotification(params: {
    type: string;
    title: string;
    message: string;
    showId?: number | null;
    tmdbId?: number | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    posterPath?: string | null;
    actionUrl?: string | null;
  }): AppNotification {
    const stmt = db.prepare(`
      INSERT INTO notifications (type, title, message, showId, tmdbId, seasonNumber, episodeNumber, posterPath, actionUrl)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      params.type,
      params.title,
      params.message,
      params.showId ?? null,
      params.tmdbId ?? null,
      params.seasonNumber ?? null,
      params.episodeNumber ?? null,
      params.posterPath ?? null,
      params.actionUrl ?? null
    );

    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as AppNotification;

    // Broadcast to SSE clients
    this.broadcastSSE(notification);

    console.log(`[ReleaseMonitor] Notification: ${params.message}`);

    return notification;
  }

  // ---- SSE Management ----

  addSSEClient(id: string, controller: ReadableStreamDefaultController): void {
    this.sseClients.set(id, { id, controller });
    console.log(`[ReleaseMonitor] SSE client connected: ${id} (total: ${this.sseClients.size})`);
  }

  removeSSEClient(id: string): void {
    this.sseClients.delete(id);
    console.log(`[ReleaseMonitor] SSE client disconnected: ${id} (total: ${this.sseClients.size})`);
  }

  private broadcastSSE(notification: AppNotification): void {
    const data = JSON.stringify(notification);
    const message = `data: ${data}\n\n`;
    const encoder = new TextEncoder();

    for (const [id, client] of this.sseClients) {
      try {
        client.controller.enqueue(encoder.encode(message));
      } catch {
        // Client disconnected, remove it
        this.sseClients.delete(id);
      }
    }
  }

  /**
   * Get unread notification count.
   */
  getUnreadCount(): number {
    const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as { count: number };
    return result?.count || 0;
  }

  /**
   * Get all notifications (most recent first).
   */
  getNotifications(limit = 50, unreadOnly = false): AppNotification[] {
    const query = unreadOnly
      ? 'SELECT * FROM notifications WHERE read = 0 ORDER BY createdAt DESC LIMIT ?'
      : 'SELECT * FROM notifications ORDER BY createdAt DESC LIMIT ?';
    return db.prepare(query).all(limit) as AppNotification[];
  }

  /**
   * Mark notification(s) as read.
   */
  markAsRead(ids?: number[]): void {
    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE notifications SET read = 1 WHERE id IN (${placeholders})`).run(...ids);
    } else {
      db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
    }
  }

  /**
   * Clear all notifications.
   */
  clearAll(): void {
    db.prepare('DELETE FROM notifications').run();
  }
}

// Singleton
const releaseMonitor = new ReleaseMonitor();
export default releaseMonitor;
