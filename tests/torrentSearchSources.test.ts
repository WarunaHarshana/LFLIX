import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TORRENT_SOURCES,
  isCamQualityResult,
  isGoodMovieReleaseQuality,
  relevanceScore,
  type TorrentResult,
} from '@/lib/torrentSearch';

describe('DEFAULT_TORRENT_SOURCES', () => {
  it('includes all primary torrent and DDL sources', () => {
    expect(DEFAULT_TORRENT_SOURCES).toContain('TorrentsCSV');
    expect(DEFAULT_TORRENT_SOURCES).toContain('EZTV');
    expect(DEFAULT_TORRENT_SOURCES).toContain('1337x');
    expect(DEFAULT_TORRENT_SOURCES).toContain('YTS');
    expect(DEFAULT_TORRENT_SOURCES).toContain('TPB');
    expect(DEFAULT_TORRENT_SOURCES).toContain('PSA');
    expect(DEFAULT_TORRENT_SOURCES).toContain('Knaben');
    expect(DEFAULT_TORRENT_SOURCES).toContain('Nyaa');
    expect(DEFAULT_TORRENT_SOURCES).toContain('DDL');
    expect(DEFAULT_TORRENT_SOURCES.length).toBe(9);
  });
});

describe('isGoodMovieReleaseQuality with new sources', () => {
  it('accepts TorrentsCSV 1080p and 2160p releases', () => {
    const csvResult: TorrentResult = {
      title: 'Inception.2010.2160p.UHD.BluRay.x265.10bit.TrueHD.7.1-TERMINAL',
      magnet: 'magnet:?xt=urn:btih:dummy',
      size: '22.5 GB',
      sizeBytes: 24159191040,
      seeds: 85,
      leeches: 10,
      quality: '2160p',
      source: 'TorrentsCSV',
    };
    expect(isGoodMovieReleaseQuality(csvResult)).toBe(true);
  });

  it('accepts 1337x BluRay and Remux releases', () => {
    const leetResult: TorrentResult = {
      title: 'Interstellar.2014.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-FGT',
      magnet: 'magnet:?xt=urn:btih:dummy2',
      size: '34.2 GB',
      sizeBytes: 36721598464,
      seeds: 120,
      leeches: 15,
      quality: '1080p',
      source: '1337x',
    };
    expect(isGoodMovieReleaseQuality(leetResult)).toBe(true);
  });

  it('accepts EZTV high definition releases', () => {
    const eztvResult: TorrentResult = {
      title: 'House.of.the.Dragon.S02E08.1080p.HMAX.WEB-DL.DDP5.1.H.265-TURG[EZTV]',
      magnet: 'magnet:?xt=urn:btih:dummy3',
      size: '1.8 GB',
      sizeBytes: 1932735283,
      seeds: 300,
      leeches: 50,
      quality: '1080p',
      source: 'EZTV',
    };
    expect(isGoodMovieReleaseQuality(eztvResult)).toBe(true);
  });

  it('rejects CAM and TeleSync results across all sources', () => {
    const camResults: TorrentResult[] = [
      {
        title: 'Deadpool.and.Wolverine.2024.CAMRip.x264',
        magnet: 'magnet:?xt=urn:btih:dummy4',
        size: '1.2 GB',
        sizeBytes: 1288490188,
        seeds: 400,
        leeches: 200,
        quality: 'CAM',
        source: '1337x',
      },
      {
        title: 'Gladiator.II.2024.HDCAM.720p.x264',
        magnet: 'magnet:?xt=urn:btih:dummy5',
        size: '1.5 GB',
        sizeBytes: 1610612736,
        seeds: 150,
        leeches: 80,
        quality: 'HDCAM',
        source: 'TorrentsCSV',
      },
      {
        title: 'Dune.Part.Two.2024.TELESYNC.x264',
        magnet: 'magnet:?xt=urn:btih:dummy6',
        size: '2.0 GB',
        sizeBytes: 2147483648,
        seeds: 500,
        leeches: 300,
        quality: 'TeleSync',
        source: 'TPB',
      },
    ];

    for (const r of camResults) {
      expect(isCamQualityResult(r)).toBe(true);
      expect(isGoodMovieReleaseQuality(r)).toBe(false);
    }
  });
});

describe('relevanceScore matching', () => {
  it('gives high score to exact title and release matches', () => {
    const score = relevanceScore('Inception 2010 1080p BluRay x264 YIFY', 'Inception');
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it('gives 0 score to unrelated titles', () => {
    const score = relevanceScore('The Dark Knight 2008 1080p BluRay', 'Inception');
    expect(score).toBe(0);
  });
});
