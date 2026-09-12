import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseDirectDownloadSizeBytes,
  parseDirectDownloadQualityTags,
  getDirectDownloadQualityLabel,
  fetchCinejoyDirectDownloads,
  extractRealReleaseFilename,
  isPlausibleReleaseFilename,
} from '@/lib/cinejoy';
import { GET as directDownloadsRoute } from '@/app/api/direct-downloads/route';

describe('Direct Downloads Resolver', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('parseDirectDownloadSizeBytes', () => {
    it('correctly parses gigabytes', () => {
      expect(parseDirectDownloadSizeBytes('49.1 GB')).toBe(49100000000);
      expect(parseDirectDownloadSizeBytes('65.95 GB')).toBe(65950000000);
    });

    it('correctly parses megabytes, terabytes, and kilobytes', () => {
      expect(parseDirectDownloadSizeBytes('750 MB')).toBe(750000000);
      expect(parseDirectDownloadSizeBytes('1.5 TB')).toBe(1500000000000);
      expect(parseDirectDownloadSizeBytes('500 KB')).toBe(500000);
    });

    it('returns 0 for empty or invalid size strings', () => {
      expect(parseDirectDownloadSizeBytes('')).toBe(0);
      expect(parseDirectDownloadSizeBytes('unknown size')).toBe(0);
    });
  });

  describe('parseDirectDownloadQualityTags', () => {
    it('extracts format tags and excludes file size and resolution', () => {
      const name = '4K CINEJOY [BLURAY DOLBYVISION HDR HEVC DDP5 DTS-HD X265][65.95 GB]';
      const tags = parseDirectDownloadQualityTags(name);
      expect(tags).toContain('BLURAY');
      expect(tags).toContain('DOLBYVISION');
      expect(tags).toContain('HDR');
      expect(tags).toContain('HEVC');
      expect(tags).not.toContain('65.95');
      expect(tags).not.toContain('4K');
    });

    it('handles multiple tag blocks', () => {
      const name = '4K CINEJOY [FSL Server] [BLURAY DOLBYVISION HEVC DDP5 DTS-HD X265][49.1 GB]';
      const tags = parseDirectDownloadQualityTags(name);
      expect(tags).toContain('FSL');
      expect(tags).toContain('Server');
      expect(tags).toContain('BLURAY');
    });
  });

  describe('getDirectDownloadQualityLabel', () => {
    it('formats quality numbers into human-readable labels', () => {
      expect(getDirectDownloadQualityLabel(2160)).toBe('4K (2160p)');
      expect(getDirectDownloadQualityLabel(1440)).toBe('2K (1440p)');
      expect(getDirectDownloadQualityLabel(1080)).toBe('1080p');
      expect(getDirectDownloadQualityLabel(720)).toBe('720p');
      expect(getDirectDownloadQualityLabel(480)).toBe('480p');
    });
  });

  describe('fetchCinejoyDirectDownloads', () => {
    it('returns empty array for invalid tmdbId', async () => {
      const results = await fetchCinejoyDirectDownloads(0, 'movie');
      expect(results).toEqual([]);
    });

    it('fetches, parses, and sorts movie downloads by quality and size', async () => {
      const mockApiResponse = {
        links: [
          {
            source: '4K Server',
            name: 'Movie [1080p][10.5 GB]',
            quality: 1080,
            url: 'https://cdn.example.com/movie-1080.mkv',
            size: '10.5 GB',
            provider: 'hub',
          },
          {
            source: '4K Server',
            name: 'Movie [2160p][50 GB]',
            quality: 2160,
            url: 'https://cdn.example.com/movie-4k.mkv',
            size: '50 GB',
            provider: 'hub',
          },
          {
            source: '4K Server',
            name: 'Movie [1080p][25 GB]',
            quality: 1080,
            url: 'https://cdn.example.com/movie-1080-remux.mkv',
            size: '25 GB',
            provider: 'hub',
          },
          // Duplicate URL to test deduplication
          {
            source: '4K Server',
            name: 'Duplicate [1080p][25 GB]',
            quality: 1080,
            url: 'https://cdn.example.com/movie-1080-remux.mkv',
            size: '25 GB',
            provider: 'hub',
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as any);

      const results = await fetchCinejoyDirectDownloads(12345, 'movie');
      expect(results).toHaveLength(3);
      // Top link should be 4K (2160p)
      expect(results[0].quality).toBe(2160);
      expect(results[0].qualityLabel).toBe('4K (2160p)');
      expect(results[0].url).toBe('https://cdn.example.com/movie-4k.mkv');

      // Second should be 1080p 25 GB
      expect(results[1].quality).toBe(1080);
      expect(results[1].size).toBe('25 GB');

      // Third should be 1080p 10.5 GB
      expect(results[2].quality).toBe(1080);
      expect(results[2].size).toBe('10.5 GB');
    });

    it('handles 404 or empty response gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as any);

      const results = await fetchCinejoyDirectDownloads(999999, 'movie');
      expect(results).toEqual([]);
    });

    it('extracts real release filename from response-content-disposition instead of raw provider name', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          links: [
            {
              source: '4K CINEJOY [FSL Server]',
              name: '4K CINEJOY [FSL Server] [WEB-DL DDP5][16.62 GB]',
              quality: 2160,
              url: 'https://r2.example.com/stream?response-content-disposition=attachment%3B%20filename%3D%22Mutiny.2026.2160p.MA.WEB-DL.DDP5.1.H.265-4KHDHub.com.mkv%22',
              size: '16.62 GB',
              provider: 'r2',
            },
          ],
        }),
      } as any);

      const results = await fetchCinejoyDirectDownloads(1288445, 'movie');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Mutiny.2026.2160p.MA.WEB-DL.DDP5.1.H.265-4KHDHub.com');
      expect(results[0].name).not.toContain('CINEJOY');
      expect(results[0].name).not.toContain('FSL Server');
      expect(results[0].qualityTags).toContain('WEB-DL');
      expect(results[0].qualityTags).not.toContain('FSL');
      expect(results[0].qualityTags).not.toContain('Server');
    });

    it('uses media title and year context when URL has no embedded filename', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          links: [
            {
              source: '4K CINEJOY',
              name: '4K CINEJOY [1080p][5 GB]',
              quality: 1080,
              url: 'https://r2.example.com/raw-stream-chunk',
              size: '5 GB',
              provider: 'r2',
            },
          ],
        }),
      } as any);

      const results = await fetchCinejoyDirectDownloads(1288446, 'movie', undefined, undefined, {
        title: 'Mutiny',
        year: '2026',
      });
      expect(results.length).toBe(1);
      expect(results[0].name).toContain('Mutiny (2026)');
      expect(results[0].name).not.toContain('CINEJOY');
    });

    it('falls back to media title and year context when URL has a generic CDN filename', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          links: [
            {
              name: '4K CINEJOY [2160p][15 GB]',
              quality: 2160,
              url: 'https://r2.example.com/stream-chunk-1080.mkv',
              size: '15 GB',
            },
          ],
        }),
      } as any);

      const results = await fetchCinejoyDirectDownloads(999, 'movie', undefined, undefined, {
        title: 'Avatar',
        year: 2009,
      });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Avatar (2009) [4K (2160p)]');
      expect(results[0].provider).toBe('cinejoy');
      expect(results[0].source).toBe('Cinejoy');
    });

    it('preserves genuine 4KHDHub scene releases from URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          links: [
            {
              name: '4K CINEJOY [2160p][60 GB]',
              quality: 2160,
              url: 'https://r2.example.com/Avatar.2009.Extended.IMAX.2160p.UHD.BluRay.REMUX-4kHdHub.Com.mkv',
              size: '60.21 GB',
              provider: 'hub',
            },
          ],
        }),
      } as any);

      const results = await fetchCinejoyDirectDownloads(19995, 'movie', undefined, undefined, {
        title: 'Avatar',
        year: 2009,
      });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Avatar.2009.Extended.IMAX.2160p.UHD.BluRay.REMUX-4kHdHub.Com');
      expect(results[0].provider).toBe('hub');
    });
  });

  describe('isPlausibleReleaseFilename', () => {
    it('accepts genuine scene release filenames', () => {
      expect(isPlausibleReleaseFilename('Avatar.2009.Extended.IMAX.2160p.UHD.BluRay.REMUX-4kHdHub.Com.mkv', 'Avatar')).toBe(true);
      expect(isPlausibleReleaseFilename('Mutiny.2026.2160p.MA.WEB-DL.DDP5.1.H.265-4KHDHub.com.mkv', 'Mutiny')).toBe(true);
      expect(isPlausibleReleaseFilename('The.Runner.2026.1080p.WEB-DL.mkv', 'The Runner')).toBe(true);
    });

    it('rejects generic CDN paths, player streams, and playlists', () => {
      expect(isPlausibleReleaseFilename('stream.mp4')).toBe(false);
      expect(isPlausibleReleaseFilename('video.mkv')).toBe(false);
      expect(isPlausibleReleaseFilename('index.m3u8')).toBe(false);
      expect(isPlausibleReleaseFilename('manifest.mpd')).toBe(false);
      expect(isPlausibleReleaseFilename('chunk_123.mp4')).toBe(false);
    });

    it('rejects filenames that do not contain title tokens when title is provided', () => {
      expect(isPlausibleReleaseFilename('random_unrelated_video_1080p.mkv', 'Avatar')).toBe(false);
      expect(isPlausibleReleaseFilename('enc_stream_4k.mkv', 'Avatar')).toBe(false);
    });
  });

  describe('GET /api/direct-downloads', () => {
    it('rejects requests missing tmdbId and query', async () => {
      const req = new Request('http://localhost:3000/api/direct-downloads');
      const res = await directDownloadsRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('tmdbId is required');
    });

    it('returns direct downloads for valid tmdbId', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          links: [
            {
              source: 'Direct Stream',
              name: 'Sample [2160p][30 GB]',
              quality: 2160,
              url: 'https://r2.example.com/sample.mkv',
              size: '30 GB',
              provider: 'r2',
            },
          ],
        }),
      } as any);

      const req = new Request('http://localhost:3000/api/direct-downloads?tmdbId=7777&type=movie');
      const res = await directDownloadsRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(1);
      expect(data.downloads[0].url).toBe('https://r2.example.com/sample.mkv');
    });
  });

  describe('probeDirectDownloadUrl', () => {
    it('detects Google Drive download quota exceeded on 403', async () => {
      const { probeDirectDownloadUrl } = await import('@/lib/directDownloadHealth');
      global.fetch = vi.fn().mockResolvedValue({
        status: 403,
        text: async () => JSON.stringify({
          error: {
            code: 403,
            message: 'The download quota for this file has been exceeded.',
            errors: [{ reason: 'downloadQuotaExceeded' }],
          },
        }),
      } as any);

      const res = await probeDirectDownloadUrl('https://directfile.workers.dev/movie.mkv');
      expect(res.ok).toBe(false);
      expect(res.quotaExceeded).toBe(true);
      expect(res.error).toContain('Google Drive download quota exceeded');
    });

    it('returns ok for status 200 or 206', async () => {
      const { probeDirectDownloadUrl } = await import('@/lib/directDownloadHealth');
      global.fetch = vi.fn().mockResolvedValue({
        status: 206,
      } as any);

      const res = await probeDirectDownloadUrl('https://directfile.workers.dev/movie-working.mkv');
      expect(res.ok).toBe(true);
      expect(res.quotaExceeded).toBe(false);
    });

    it('identifies 404 expired links', async () => {
      const { probeDirectDownloadUrl } = await import('@/lib/directDownloadHealth');
      global.fetch = vi.fn().mockResolvedValue({
        status: 404,
      } as any);

      const res = await probeDirectDownloadUrl('https://directfile.workers.dev/dead.mkv');
      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
      expect(res.error).toContain('File not found on host');
    });
  });

  describe('formatAria2Error', () => {
    it('translates raw aria2 C++ HttpSkipResponseCommand error with Google Drive quota', async () => {
      const { formatAria2Error } = await import('@/lib/aria2Downloader');
      global.fetch = vi.fn().mockResolvedValue({
        status: 403,
        text: async () => '{"error":{"message":"The download quota for this file has been exceeded."}}',
      } as any);

      const raw = '-> [HttpSkipResponseCommand.cc:239] errorCode=22 The response status is not successful. status=403';
      const formatted = await formatAria2Error(raw, 'https://directfile.workers.dev/the-batman.mkv');

      expect(formatted).toContain('Google Drive download quota exceeded');
      expect(formatted).not.toContain('HttpSkipResponseCommand.cc');
    });

    it('falls back to Google Drive quota message for workers.dev or cinejoy hosts on HTTP 403 even if probe body is empty', async () => {
      const { formatAria2Error } = await import('@/lib/aria2Downloader');
      global.fetch = vi.fn().mockRejectedValue(new Error('Network probe timeout'));

      const raw = '-> [HttpSkipResponseCommand.cc:239] errorCode=22 status=403';
      const formatted = await formatAria2Error(raw, 'https://shiny-haze-7998.vepec461006995.workers.dev/file.mkv');

      expect(formatted).toContain('Google Drive download quota exceeded');
    });

    it('translates status 404 to expired message', async () => {
      const { formatAria2Error } = await import('@/lib/aria2Downloader');
      const raw = 'Exception: [HttpSkipResponseCommand.cc:239] errorCode=22 The response status is not successful. status=404';
      const formatted = await formatAria2Error(raw);

      expect(formatted).toContain('File not found on host (HTTP 404)');
      expect(formatted).not.toContain('HttpSkipResponseCommand');
    });

    it('translates errorCode=9 to disk space error', async () => {
      const { formatAria2Error } = await import('@/lib/aria2Downloader');
      const raw = 'errorCode=9 Not enough disk space';
      const formatted = await formatAria2Error(raw);

      expect(formatted).toContain('Not enough disk space');
    });
  });
});
