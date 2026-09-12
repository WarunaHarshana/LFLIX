import { describe, expect, it, vi, beforeEach } from 'vitest';
import { extractQuality } from '@/lib/titleMatching';
import { scoreTorrent, getResolutionTierBaseScore, autoDownloader } from '@/lib/autoDownloader';
import { scoreMovieTorrent } from '@/lib/movieReleaseMonitor';
import type { TorrentResult } from '@/lib/torrentSearch';
import downloadManager from '@/lib/downloader';
import releaseMonitor from '@/lib/releaseMonitor';
import db from '@/lib/db';

describe('Strict Resolution-Tiered Scoring and Fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractQuality resolution prioritization', () => {
    it('prioritizes explicit resolution even when source tags appear before it', () => {
      expect(extractQuality('Movie.WEB-DL.2160p.mkv')).toBe('2160p');
      expect(extractQuality('Movie.BluRay.4K.HDR.mkv')).toBe('2160p');
      expect(extractQuality('Movie.Remux.UHD.mkv')).toBe('2160p');
      expect(extractQuality('Movie.WEB-DL.1080p.mkv')).toBe('1080p');
      expect(extractQuality('Movie.1080p.WEB-DL.mkv')).toBe('1080p');
      expect(extractQuality('Movie.HDTV.720p.mkv')).toBe('720p');
      expect(extractQuality('Movie.WEB-DL.mkv')).toBe('WEB-DL');
      expect(extractQuality('Movie.BluRay.mkv')).toBe('BluRay');
    });
  });

  describe('Resolution Tier Hierarchy in scoreTorrent', () => {
    const ddl2160p: TorrentResult = {
      title: 'Reacher.S04E02.2160p.AMZN.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265',
      magnet: 'http-direct:https://example.com/reacher_s04e02_2160p.mkv',
      size: '6.65 GB',
      sizeBytes: 6650000000,
      seeds: 0,
      leeches: 0,
      quality: '2160p',
      source: 'DDL',
    };

    const torrent2160pHighSeeds: TorrentResult = {
      title: 'Reacher.S04E02.2160p.HDR10Plus.DV.WEBRip.6CH.x265.HEVC-PSA.mkv',
      magnet: 'magnet:?xt=urn:btih:2160high',
      size: '1.07 GB',
      sizeBytes: 1072439124,
      seeds: 100,
      leeches: 10,
      quality: '2160p',
      source: 'PSA',
    };

    const torrent2160pLowSeeds: TorrentResult = {
      title: 'Reacher.S04E02.2160p.AMZN.WEB-DL.x265.mkv',
      magnet: 'magnet:?xt=urn:btih:2160low',
      size: '4.5 GB',
      sizeBytes: 4500000000,
      seeds: 3,
      leeches: 1,
      quality: '2160p',
      source: 'TorrentsCSV',
    };

    const ddl1080p: TorrentResult = {
      title: 'Reacher.S04E02.1080p.AMZN.WEB-DL.DDP5.1.Atmos.H.265',
      magnet: 'http-direct:https://example.com/reacher_s04e02_1080p.mkv',
      size: '3.0 GB',
      sizeBytes: 3000000000,
      seeds: 0,
      leeches: 0,
      quality: '1080p',
      source: 'DDL',
    };

    const torrent1080pHighSeeds: TorrentResult = {
      title: 'Reacher.S04E02.1080p.WEB.H264-CAKES',
      magnet: 'magnet:?xt=urn:btih:1080high',
      size: '1.5 GB',
      sizeBytes: 1500000000,
      seeds: 200,
      leeches: 20,
      quality: '1080p',
      source: 'TPB',
    };

    const ddl720p: TorrentResult = {
      title: 'Reacher.S04E02.720p.AMZN.WEB-DL.H.265',
      magnet: 'http-direct:https://example.com/reacher_s04e02_720p.mkv',
      size: '680 MB',
      sizeBytes: 680000000,
      seeds: 0,
      leeches: 0,
      quality: '720p',
      source: 'DDL',
    };

    const torrent720p: TorrentResult = {
      title: 'Reacher.S04E02.720p.HEVC.x265-MeGusta',
      magnet: 'magnet:?xt=urn:btih:720p',
      size: '500 MB',
      sizeBytes: 500000000,
      seeds: 30,
      leeches: 5,
      quality: '720p',
      source: 'TPB',
    };

    it('strictly maintains resolution hierarchy: 2160p DDL > 2160p Torrent > 1080p DDL > 1080p Torrent > 720p DDL > 720p Torrent', () => {
      const s_ddl2160 = scoreTorrent(ddl2160p, 'best');
      const s_t2160High = scoreTorrent(torrent2160pHighSeeds, 'best');
      const s_t2160Low = scoreTorrent(torrent2160pLowSeeds, 'best');
      const s_ddl1080 = scoreTorrent(ddl1080p, 'best');
      const s_t1080High = scoreTorrent(torrent1080pHighSeeds, 'best');
      const s_ddl720 = scoreTorrent(ddl720p, 'best');
      const s_t720 = scoreTorrent(torrent720p, 'best');

      // 2160p DDL beats 2160p Torrent
      expect(s_ddl2160).toBeGreaterThan(s_t2160High);

      // 2160p Torrent (even low seeds) ALWAYS beats 1080p DDL
      expect(s_t2160High).toBeGreaterThan(s_t2160Low);
      expect(s_t2160Low).toBeGreaterThan(s_ddl1080);

      // 1080p DDL beats 1080p Torrent
      expect(s_ddl1080).toBeGreaterThan(s_t1080High);

      // 1080p Torrent beats 720p DDL
      expect(s_t1080High).toBeGreaterThan(s_ddl720);

      // 720p DDL beats 720p Torrent
      expect(s_ddl720).toBeGreaterThan(s_t720);
    });

    it('disqualifies DDL when quotaExceeded is true so it yields to 2160p torrent', () => {
      const quotaExceededDDL: TorrentResult = {
        ...ddl2160p,
        quotaExceeded: true,
      };

      const scoreQuota = scoreTorrent(quotaExceededDDL, 'best');
      const scoreTorrentHigh = scoreTorrent(torrent2160pHighSeeds, 'best');

      expect(scoreQuota).toBe(0);
      expect(scoreTorrentHigh).toBeGreaterThan(scoreQuota);
    });

    it('disqualifies CAM / TS releases', () => {
      const camRelease: TorrentResult = {
        title: 'Reacher.S04E02.HDCAM.x264',
        magnet: 'magnet:?xt=urn:btih:cam',
        size: '1.2 GB',
        sizeBytes: 1200000000,
        seeds: 100,
        leeches: 10,
        quality: 'CAM',
        source: 'TPB',
      };

      expect(scoreTorrent(camRelease, 'best')).toBe(0);
    });
  });

  describe('scoreMovieTorrent hierarchy', () => {
    it('ensures movie releases follow the same strict resolution hierarchy', () => {
      const movie2160pDDL: TorrentResult = {
        title: 'Inception (2010) 2160p UHD Remux HEVC TrueHD Atmos',
        magnet: 'http-direct:https://example.com/inception_4k.mkv',
        size: '45 GB',
        sizeBytes: 45000000000,
        seeds: 0,
        leeches: 0,
        quality: '2160p',
        source: 'DDL',
      };

      const movie2160pTorrent: TorrentResult = {
        title: 'Inception (2010) 2160p UHD BluRay x265',
        magnet: 'magnet:?xt=urn:btih:movie4k',
        size: '18 GB',
        sizeBytes: 18000000000,
        seeds: 50,
        leeches: 5,
        quality: '2160p',
        source: '1337x',
      };

      const movie1080pDDL: TorrentResult = {
        title: 'Inception (2010) 1080p BluRay Remux AVC DTS-HD',
        magnet: 'http-direct:https://example.com/inception_1080p.mkv',
        size: '22 GB',
        sizeBytes: 22000000000,
        seeds: 0,
        leeches: 0,
        quality: '1080p',
        source: 'DDL',
      };

      const score4kDDL = scoreMovieTorrent(movie2160pDDL);
      const score4kTorrent = scoreMovieTorrent(movie2160pTorrent);
      const score1080pDDL = scoreMovieTorrent(movie1080pDDL);

      expect(score4kDDL).toBeGreaterThan(score4kTorrent);
      expect(score4kTorrent).toBeGreaterThan(score1080pDDL);
    });
  });

  describe('Automated Fallback on Download Initiation Error', () => {
    it('seamlessly falls back to 2160p torrent when 2160p DDL fails upon addDownload', async () => {
      const ddlCandidate: TorrentResult = {
        title: 'Reacher Mock S04E02 2160p AMZN WEB-DL DDP5.1 Atmos DV HDR H.265',
        magnet: 'http-direct:https://broken-r2.example.com/reacher.mkv',
        size: '6.65 GB',
        sizeBytes: 6650000000,
        seeds: 0,
        leeches: 0,
        quality: '2160p',
        source: 'DDL',
      };

      const torrentCandidate: TorrentResult = {
        title: 'Reacher Mock S04E02 2160p HDR10Plus DV WEBRip 6CH x265 HEVC-PSA.mkv',
        magnet: 'magnet:?xt=urn:btih:fallback2160torrent',
        size: '1.07 GB',
        sizeBytes: 1072439124,
        seeds: 50,
        leeches: 5,
        quality: '2160p',
        source: 'PSA',
      };

      // Mock torrent search returning both 2160p DDL and 2160p torrent
      const torrentSearch = await import('@/lib/torrentSearch');
      vi.spyOn(torrentSearch, 'searchTorrents').mockResolvedValueOnce([
        ddlCandidate,
        torrentCandidate,
      ]);

      // Mock addDownload: fail on DDL first, succeed on torrent
      const addDownloadSpy = vi.spyOn(downloadManager, 'addDownload')
        .mockRejectedValueOnce(new Error('HTTP 403 Forbidden / Link Expired'))
        .mockResolvedValueOnce({
          id: 77777,
          magnetUri: torrentCandidate.magnet,
          infoHash: 'fallback2160torrent',
          name: torrentCandidate.title,
          watchlistId: null,
          status: 'downloading',
          progress: 0,
          downloadSpeed: 0,
          totalSize: 1072439124,
          downloadedSize: 0,
          downloadPath: 'downloads',
          errorMessage: null,
          retryCount: 0,
          lastProgressAt: null,
          stateUpdatedAt: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
        });

      vi.spyOn(releaseMonitor, 'createNotification').mockReturnValue({} as any);

      // Insert mock show in DB
      const info = db.prepare("INSERT INTO shows (title, tmdbId) VALUES ('Reacher Mock', 888888)").run();
      const showId = Number(info.lastInsertRowid);

      try {
        const success = await autoDownloader.findAndDownload({
          showId,
          tmdbId: 888888,
          seasonNumber: 4,
          episodeNumber: 2,
          showTitle: 'Reacher Mock',
          episodeTitle: 'Cage Fight',
          airDate: '2026-09-12',
          posterPath: null,
          qualityPreference: 'best',
          isManual: true,
        });

        expect(success).toBe(true);
        // Should have called addDownload twice: first with DDL (which failed), then with the 2160p torrent!
        expect(addDownloadSpy).toHaveBeenCalledTimes(2);
        expect(addDownloadSpy).toHaveBeenNthCalledWith(
          1,
          ddlCandidate.magnet,
          undefined,
          undefined,
          expect.stringContaining('.mkv')
        );
        expect(addDownloadSpy).toHaveBeenNthCalledWith(
          2,
          torrentCandidate.magnet,
          undefined,
          undefined,
          undefined
        );
      } finally {
        db.prepare('DELETE FROM shows WHERE id = ?').run(showId);
        db.prepare('DELETE FROM episode_releases WHERE tmdbId = 888888').run();
      }
    });
  });
});
