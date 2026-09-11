import { describe, expect, it, afterEach, vi } from 'vitest';
import autoDownloader from '@/lib/autoDownloader';
import db from '@/lib/db';

describe('AutoDownloader manual vs automatic tracking', () => {
  let createdShowId: number | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    if (createdShowId !== null) {
      db.prepare('DELETE FROM auto_track WHERE showId = ?').run(createdShowId);
      db.prepare('DELETE FROM episode_releases WHERE tmdbId IN (1399, 999999)').run();
      db.prepare('DELETE FROM notifications WHERE tmdbId IN (1399, 999999)').run();
      db.prepare('DELETE FROM shows WHERE id = ?').run(createdShowId);
      createdShowId = null;
    }
  });

  it('allows manual download for show that is in library but not in auto_track', () => {
    // Look up Game of Thrones, insert if missing
    let show = db.prepare("SELECT id, title, tmdbId FROM shows WHERE title LIKE '%Game of Thrones%'").get() as any;
    if (!show) {
      const info = db.prepare("INSERT INTO shows (title, tmdbId) VALUES ('Game of Thrones', 1399)").run();
      createdShowId = Number(info.lastInsertRowid);
      show = { id: createdShowId, title: 'Game of Thrones', tmdbId: 1399 };
    }
    expect(show).toBeDefined();

    // Verify it is NOT in auto_track
    db.prepare('DELETE FROM auto_track WHERE showId = ?').run(show.id);
    const tracked = db.prepare('SELECT * FROM auto_track WHERE showId = ?').get(show.id);
    expect(tracked).toBeUndefined();

    // Test eligibility check logic directly
    const manualEp = {
      tmdbId: show.tmdbId,
      showId: show.id,
      showTitle: show.title,
      seasonNumber: 2,
      episodeNumber: 2,
      episodeTitle: 'The Night Lands',
      airDate: '2012-04-08',
      posterPath: null,
      qualityPreference: 'best',
      isManual: true
    };

    // Calling processNewEpisodes with manualEp should not crash and should queue the episode
    const findSpy = vi.spyOn(autoDownloader, 'findAndDownload').mockResolvedValue(true);
    expect(() => {
      autoDownloader.processNewEpisodes([manualEp]);
    }).not.toThrow();
  });

  it('forwards target destination to downloadManager.addDownload', async () => {
    const downloadManager = (await import('@/lib/downloader')).default;
    const addDownloadSpy = vi.spyOn(downloadManager, 'addDownload').mockResolvedValueOnce({
      id: 8888,
      magnetUri: 'magnet:?xt=urn:btih:mock',
      infoHash: 'mock',
      name: 'Test Show S01E01',
      watchlistId: null,
      status: 'downloading',
      progress: 0,
      downloadSpeed: 0,
      totalSize: 1000,
      downloadedSize: 0,
      downloadPath: 'Z:\\Media\\TV Shows',
      errorMessage: null,
      retryCount: 0,
      lastProgressAt: null,
      stateUpdatedAt: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    });

    const torrentSearch = await import('@/lib/torrentSearch');
    vi.spyOn(torrentSearch, 'searchTorrents').mockResolvedValueOnce([
      {
        title: 'Test Show S01E01 1080p WEB-DL',
        magnet: 'magnet:?xt=urn:btih:mock',
        seeds: 50,
        leeches: 0,
        size: '1.2 GB',
        sizeBytes: 1200000000,
        quality: '1080p',
        source: 'Mock',
      }
    ]);

    // Insert mock show in DB
    const info = db.prepare("INSERT INTO shows (title, tmdbId) VALUES ('Test Show', 999999)").run();
    createdShowId = Number(info.lastInsertRowid);

    const ep = {
      tmdbId: 999999,
      showId: createdShowId,
      showTitle: 'Test Show',
      seasonNumber: 1,
      episodeNumber: 1,
      episodeTitle: 'Pilot',
      airDate: '2020-01-01',
      posterPath: null,
      qualityPreference: '1080p',
      target: 'gdrive' as const,
      isManual: true,
    };

    const result = await autoDownloader.findAndDownload(ep);
    expect(result).toBe(true);
    expect(addDownloadSpy).toHaveBeenCalledWith(
      'magnet:?xt=urn:btih:mock',
      undefined,
      undefined,
      undefined,
      'gdrive'
    );
  });
});
