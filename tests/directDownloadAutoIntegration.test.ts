import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isGoodMovieReleaseQuality, searchTorrents } from '@/lib/torrentSearch';
import * as cinejoy from '@/lib/cinejoy';
import autoDownloader from '@/lib/autoDownloader';
import downloadManager from '@/lib/downloader';
import releaseMonitor from '@/lib/releaseMonitor';
import db from '@/lib/db';

describe('Direct Downloads Auto Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isGoodMovieReleaseQuality with DDL source', () => {
    it('accepts DDL 1080p and 4K digital streams', () => {
      expect(
        isGoodMovieReleaseQuality({
          title: 'Genius (2017) [1080p]',
          quality: '1080p',
          source: 'DDL',
        })
      ).toBe(true);

      expect(
        isGoodMovieReleaseQuality({
          title: 'Mutiny (2026) [4K]',
          quality: '4K',
          source: 'DDL',
        })
      ).toBe(true);
    });
  });

  describe('searchTorrents with TMDB ID options', () => {
    it('queries DDL provider and includes DDL results when tmdbId is passed', async () => {
      const mockDls = [
        {
          source: 'Direct',
          name: 'Genius S01E01 [1080p]',
          quality: 1080,
          qualityLabel: '1080p',
          qualityTags: ['WEB-DL'],
          size: '1.45 GB',
          sizeBytes: 1556925644,
          url: 'https://storage.example.com/genius_s01e01.mkv',
          provider: 'ddl-stream',
        },
      ];

      const fetchSpy = vi
        .spyOn(cinejoy, 'fetchCinejoyDirectDownloads')
        .mockResolvedValueOnce(mockDls);

      const results = await searchTorrents('Genius S01E01', {
        type: 'tv',
        tmdbId: 70128,
        season: 1,
        episode: 1,
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        70128,
        'tv',
        1,
        1,
        expect.objectContaining({
          title: 'Genius',
          season: 1,
          episode: 1,
        })
      );

      const ddlItem = results.find((r) => r.magnet === 'http-direct:https://storage.example.com/genius_s01e01.mkv');
      expect(ddlItem).toBeDefined();
      expect(ddlItem?.source).toBe('DDL');
      expect(ddlItem?.title).toBe('Genius S01E01 [1080p]');
      expect(ddlItem?.quality).toBe('1080p');
    }, 15000);
  });

  describe('autoDownloader prioritization of DDL', () => {
    it('prioritizes DDL streams over torrents and passes clean customFilename to addDownload', async () => {
      const mockDls = [
        {
          source: 'Direct',
          name: 'Genius S01E01 [1080p]',
          quality: 1080,
          qualityLabel: '1080p',
          qualityTags: ['WEB-DL'],
          size: '1.45 GB',
          sizeBytes: 1556925644,
          url: 'https://storage.example.com/genius_s01e01.mkv',
          provider: 'ddl-stream',
        },
      ];

      vi.spyOn(cinejoy, 'fetchCinejoyDirectDownloads').mockResolvedValue(mockDls);
      const notifySpy = vi.spyOn(releaseMonitor, 'createNotification').mockReturnValue({} as any);

      let show = db.prepare('SELECT id FROM shows WHERE tmdbId = 70128').get() as any;
      let createdShowId: number | null = null;
      if (!show) {
        const info = db.prepare("INSERT INTO shows (title, tmdbId) VALUES ('Genius', 70128)").run();
        createdShowId = Number(info.lastInsertRowid);
      }
      const showId = show ? show.id : createdShowId;

      const addDownloadSpy = vi.spyOn(downloadManager, 'addDownload').mockResolvedValueOnce({
        id: 99999,
        magnetUri: 'http-direct:https://storage.example.com/genius_s01e01.mkv',
        infoHash: null,
        name: 'Genius S01E01 [1080p].mkv',
        watchlistId: null,
        status: 'downloading',
        progress: 0,
        downloadSpeed: 0,
        totalSize: 1556925644,
        downloadedSize: 0,
        downloadPath: 'downloads',
        errorMessage: null,
        retryCount: 0,
        lastProgressAt: null,
        stateUpdatedAt: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      });

      try {
        const success = await autoDownloader.findAndDownload({
          showId: showId!,
          tmdbId: 70128,
          seasonNumber: 1,
          episodeNumber: 1,
          showTitle: 'Genius',
          episodeTitle: 'Einstein Chapter One',
          airDate: '2017-04-25',
          posterPath: null,
          qualityPreference: '1080p',
          isManual: true,
        });

        expect(success).toBe(true);
        expect(addDownloadSpy).toHaveBeenCalledWith(
          'http-direct:https://storage.example.com/genius_s01e01.mkv',
          undefined,
          undefined,
          'Genius S01E01 [1080p].mkv'
        );
      } finally {
        if (createdShowId !== null) {
          db.prepare('DELETE FROM shows WHERE id = ?').run(createdShowId);
        }
        db.prepare('DELETE FROM episode_releases WHERE tmdbId = 70128').run();
        db.prepare("DELETE FROM notifications WHERE tmdbId = 70128 OR message LIKE '%Genius%'").run();
      }
    }, 15000);
  });
});
