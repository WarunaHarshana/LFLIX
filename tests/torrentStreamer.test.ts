import { describe, expect, it } from 'vitest';
import { TorrentStreamManager } from '@/lib/torrentStreamer';

describe('TorrentStreamManager', () => {
  it('returns a singleton instance', () => {
    const instance1 = TorrentStreamManager.getInstance();
    const instance2 = TorrentStreamManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('correctly picks the largest video file by default', () => {
    const manager = TorrentStreamManager.getInstance();
    const files = [
      { name: 'sample.mkv', length: 50 * 1024 * 1024 },
      { name: 'Movie.2024.1080p.mkv', length: 2500 * 1024 * 1024 },
      { name: 'subs.srt', length: 120 * 1024 },
      { name: 'info.nfo', length: 2 * 1024 },
    ];

    // Access private method via any for unit testing
    const selectedIdx = (manager as any).pickBestFileIndex(files);
    expect(selectedIdx).toBe(1); // Movie.2024.1080p.mkv
  });

  it('respects explicitly requested file index when valid', () => {
    const manager = TorrentStreamManager.getInstance();
    const files = [
      { name: 'Episode1.mkv', length: 1000 * 1024 * 1024 },
      { name: 'Episode2.mkv', length: 1050 * 1024 * 1024 },
      { name: 'Episode3.mkv', length: 1020 * 1024 * 1024 },
    ];

    const selectedIdx = (manager as any).pickBestFileIndex(files, 0);
    expect(selectedIdx).toBe(0);
  });

  it('falls back to largest file if no recognized video extension exists', () => {
    const manager = TorrentStreamManager.getInstance();
    const files = [
      { name: 'archive.part1.rar', length: 500 * 1024 * 1024 },
      { name: 'archive.part2.rar', length: 800 * 1024 * 1024 },
      { name: 'readme.txt', length: 1024 },
    ];

    const selectedIdx = (manager as any).pickBestFileIndex(files);
    expect(selectedIdx).toBe(1);
  });

  it('prioritizes container headers on file start and tail (TorrentPlayer optimization)', () => {
    const manager = TorrentStreamManager.getInstance();
    const criticalCalls: [number, number][] = [];
    const mockTorrent = {
      critical: (start: number, end: number) => {
        criticalCalls.push([start, end]);
      },
    };
    const mockFile = {
      _startPiece: 10,
      _endPiece: 100,
      select: () => {},
    };

    (manager as any).prioritizeContainerHeaders(mockTorrent, mockFile);

    expect(criticalCalls).toEqual([
      [10, 12], // start pieces (EBML/moov)
      [98, 100], // tail pieces (Cues/moov)
    ]);
  });

  it('generates proper stream URLs and nextStreamUrl in buildStats', () => {
    const manager = TorrentStreamManager.getInstance();
    const mockTorrent = {
      infoHash: '08ada5a7a6183aae1e09d831df6748d566095a10',
      name: 'Sintel',
      files: [
        { name: 'Sintel.2010.mp4', path: 'Sintel/Sintel.2010.mp4', length: 123456789 },
      ],
      progress: 0.25,
      downloadSpeed: 1024000,
      uploadSpeed: 50000,
      numPeers: 15,
      length: 123456789,
      downloaded: 30864197,
    };

    const stats = (manager as any).buildStats(mockTorrent, 0, 42069);
    expect(stats.infoHash).toBe('08ada5a7a6183aae1e09d831df6748d566095a10');
    expect(stats.files[0].path).toBe('Sintel/Sintel.2010.mp4');
    expect(stats.files[0].streamUrl).toContain('/webtorrent/08ada5a7a6183aae1e09d831df6748d566095a10/Sintel/Sintel.2010.mp4');
    expect(stats.files[0].localStreamUrl).toContain('127.0.0.1:42069/webtorrent/08ada5a7a6183aae1e09d831df6748d566095a10/Sintel/Sintel.2010.mp4');
    expect(stats.files[0].nextStreamUrl).toBe('/api/torrent-stream/video?infoHash=08ada5a7a6183aae1e09d831df6748d566095a10&fileIndex=0');
    expect(stats.streamUrl).toBe(stats.files[0].streamUrl);
  });

  it('provides getCacheStats with disk and folder telemetry', () => {
    const manager = TorrentStreamManager.getInstance();
    const stats = manager.getCacheStats();
    expect(typeof stats.cacheDir).toBe('string');
    expect(typeof stats.totalSizeBytes).toBe('number');
    expect(typeof stats.totalSizeFormatted).toBe('string');
    expect(typeof stats.freeDiskBytes).toBe('number');
    expect(typeof stats.freeDiskFormatted).toBe('string');
  });

  it('handles heartbeats appropriately', () => {
    const manager = TorrentStreamManager.getInstance();
    expect(manager.heartbeat('unknownhash123')).toBe(false);
  });

  it('includes candidate cache dirs', () => {
    const manager = TorrentStreamManager.getInstance();
    const dirs = manager.getCandidateCacheDirs();
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    expect(dirs.some(d => d.includes('torrent-streams') || d.includes('stream-cache'))).toBe(true);
  });
});
