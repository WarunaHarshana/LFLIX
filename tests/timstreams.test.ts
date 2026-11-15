import { describe, it, expect, vi } from 'vitest';
import {
  parseTimStreamsTimeToUTC,
  normalizeGenresMap,
  mapTimStreamsCategory,
  extractTeamsFromTitle,
  TIMSTREAMS_BASE,
  TIMSTREAMS_FALLBACK_BASE,
  resolveTimStream,
  fetchTimStreamsEvents,
  fetchTimStreamsChannels,
  fetchTimStreamsWatch
} from '@/lib/timstreams';

describe('timstreams', () => {
  describe('constants', () => {
    it('uses the correct official base URL', () => {
      expect(['https://tim-streams.com', 'https://timstreams.co.rw']).toContain(TIMSTREAMS_BASE);
    });
  });

  describe('parseTimStreamsTimeToUTC', () => {
    it('parses ISO format date-time string to UTC timestamp', () => {
      const ts = parseTimStreamsTimeToUTC('2026-08-15T13:30');
      expect(ts).toBeGreaterThan(0);
      const date = new Date(ts);
      expect(date.getUTCHours()).toBe(13);
      expect(date.getUTCMinutes()).toBe(30);
    });

    it('parses space-separated date-time string to UTC timestamp', () => {
      const ts = parseTimStreamsTimeToUTC('2026-08-15 13:30');
      expect(ts).toBeGreaterThan(0);
      const date = new Date(ts);
      expect(date.getUTCHours()).toBe(13);
      expect(date.getUTCMinutes()).toBe(30);
    });

    it('returns 0 or valid fallback on empty/invalid string', () => {
      expect(parseTimStreamsTimeToUTC('')).toBe(0);
    });
  });

  describe('normalizeGenresMap', () => {
    it('normalizes array of genre objects into an ID map', () => {
      const rawGenres = [
        { id: 1, name: 'Soccer' },
        { id: 2, name: 'Motorsport' },
        { id: 8, name: 'American Football' }
      ];
      const map = normalizeGenresMap(rawGenres);
      expect(map[1]).toBe('Soccer');
      expect(map[2]).toBe('Motorsport');
      expect(map[8]).toBe('American Football');
    });

    it('normalizes key-value object of genres', () => {
      const rawGenres = {
        '1': 'Soccer',
        '2': 'Motorsport'
      };
      const map = normalizeGenresMap(rawGenres);
      expect(map[1]).toBe('Soccer');
      expect(map[2]).toBe('Motorsport');
    });

    it('handles empty or null inputs gracefully', () => {
      expect(normalizeGenresMap(null)).toEqual({});
      expect(normalizeGenresMap(undefined)).toEqual({});
      expect(normalizeGenresMap([])).toEqual({});
    });
  });

  describe('mapTimStreamsCategory', () => {
    const genresMap: Record<number, string> = {
      1: 'Soccer',
      2: 'Motorsport',
      3: 'Mixed Martial Arts',
      4: 'Bare Knuckles',
      5: 'Boxing',
      6: 'Profesional Wrestling',
      7: 'Basketball',
      8: 'American Football',
      9: 'Baseball',
      10: 'Tennis',
      11: 'Hockey',
      12: 'Darts',
      13: 'Cricket',
      14: 'Cycling',
      15: 'Rugby',
      17: 'Live Shows',
      18: 'Others / Uncategorized'
    };

    it('maps genres correctly by numeric ID with dictionary', () => {
      expect(mapTimStreamsCategory(1, genresMap)).toBe('football');
      expect(mapTimStreamsCategory(2, genresMap)).toBe('formula1');
      expect(mapTimStreamsCategory(3, genresMap)).toBe('mma');
      expect(mapTimStreamsCategory(4, genresMap)).toBe('boxing');
      expect(mapTimStreamsCategory(5, genresMap)).toBe('boxing');
      expect(mapTimStreamsCategory(6, genresMap)).toBe('mma');
      expect(mapTimStreamsCategory(7, genresMap)).toBe('basketball');
      expect(mapTimStreamsCategory(8, genresMap)).toBe('american-football');
      expect(mapTimStreamsCategory(9, genresMap)).toBe('baseball');
      expect(mapTimStreamsCategory(10, genresMap)).toBe('tennis');
      expect(mapTimStreamsCategory(11, genresMap)).toBe('hockey');
      expect(mapTimStreamsCategory(12, genresMap)).toBe('darts');
      expect(mapTimStreamsCategory(13, genresMap)).toBe('cricket');
      expect(mapTimStreamsCategory(14, genresMap)).toBe('cycling');
      expect(mapTimStreamsCategory(15, genresMap)).toBe('rugby');
      expect(mapTimStreamsCategory(17, genresMap)).toBe('tv');
      expect(mapTimStreamsCategory(18, genresMap)).toBe('other');
    });

    it('maps genre directly from string name', () => {
      expect(mapTimStreamsCategory('Soccer')).toBe('football');
      expect(mapTimStreamsCategory('Formula 1')).toBe('formula1');
      expect(mapTimStreamsCategory('UFC')).toBe('mma');
      expect(mapTimStreamsCategory('NBA')).toBe('basketball');
      expect(mapTimStreamsCategory('NFL')).toBe('american-football');
      expect(mapTimStreamsCategory('Unknown Game')).toBe('other');
    });
  });

  describe('extractTeamsFromTitle', () => {
    it('extracts home and away from "vs" format', () => {
      const teams = extractTeamsFromTitle('Deportivo Alaves vs Getafe');
      expect(teams).toEqual({
        home: { name: 'Deportivo Alaves' },
        away: { name: 'Getafe' }
      });
    });

    it('extracts home and away from "@" format (US away @ home convention)', () => {
      const teams = extractTeamsFromTitle('Panthers @ Bills');
      expect(teams).toEqual({
        away: { name: 'Panthers' },
        home: { name: 'Bills' }
      });
    });

    it('extracts home and away from hyphen format', () => {
      const teams = extractTeamsFromTitle('Arsenal - Chelsea');
      expect(teams).toEqual({
        home: { name: 'Arsenal' },
        away: { name: 'Chelsea' }
      });
    });

    it('returns undefined for non-match titles', () => {
      expect(extractTeamsFromTitle('Knoxville Raceway')).toBeUndefined();
      expect(extractTeamsFromTitle('')).toBeUndefined();
    });
  });

  describe('resolveTimStream', () => {
    it('throws error when embed URL or stream ID is missing', async () => {
      await expect(resolveTimStream('')).rejects.toThrow('Embed URL or Stream ID is required');
    });

    it('correctly decodes obfuscated embed page and ticket to return stream URL', async () => {
      const originalFetch = globalThis.fetch;
      try {
        const expectedStreamUrl = 'https://tims-001.sytes.net/main/secure/abc/123/stream.m3u8';
        const ticketToken = 'testtoken12345';
        const ticketUrl = `https://tims-001.sytes.net/p/${ticketToken}`;

        // Construct encrypted script
        const scriptSource = `var CFG = {"ticketUrl":"${ticketUrl}"};`;
        const xorVal = 42;
        const subVal = 17;
        const scriptBytes = Array.from(Buffer.from(scriptSource)).map(b => ((b + subVal) % 256) ^ xorVal);
        const embedHtml = `<html><head><script>var encData = [${scriptBytes.join(', ')}], xVal = ${xorVal}, sVal = ${subVal};</script></head></html>`;

        // Construct ticket buffer
        const seed = 100;
        const ticketBuffer = [seed];
        for (let i = 1; i <= expectedStreamUrl.length; i++) {
          const charCode = expectedStreamUrl.charCodeAt(i - 1);
          const b = charCode ^ ticketToken.charCodeAt((i - 1) % ticketToken.length) ^ ((seed + i - 1) & 0xff);
          ticketBuffer.push(b);
        }

        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('ehgembxe.cfd')) {
            return new Response(embedHtml, {
              status: 200,
              headers: { 'Content-Type': 'text/html' }
            });
          }
          if (url.includes('/p/testtoken12345')) {
            return new Response(new Uint8Array(ticketBuffer), {
              status: 200,
              headers: { 'Content-Type': 'application/octet-stream' }
            });
          }
          throw new Error('Unexpected URL: ' + url);
        });

        const result = await resolveTimStream('mock-stream-id');
        expect(result).toBe(expectedStreamUrl);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('throws error when embed page does not contain obfuscated script', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response('<html><body>No script here</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          })
        );
        await expect(resolveTimStream('invalid-embed')).rejects.toThrow('Could not find obfuscated script');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('throws error when ticket buffer is too short', async () => {
      const originalFetch = globalThis.fetch;
      try {
        const scriptSource = `var CFG = {"ticketUrl":"https://tims-001.sytes.net/p/shorttoken"};`;
        const xorVal = 10;
        const subVal = 5;
        const scriptBytes = Array.from(Buffer.from(scriptSource)).map(b => ((b + subVal) % 256) ^ xorVal);
        const embedHtml = `<html><head><script>var encData = [${scriptBytes.join(', ')}], xVal = ${xorVal}, sVal = ${subVal};</script></head></html>`;

        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('ehgembxe.cfd')) {
            return new Response(embedHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
          if (url.includes('/p/shorttoken')) {
            return new Response(new Uint8Array([42]), { status: 200 }); // only 1 byte
          }
          throw new Error('Unexpected URL: ' + url);
        });

        await expect(resolveTimStream('short-ticket')).rejects.toThrow('Ticket buffer too short');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('fetchTimStreams API methods & error isolation', () => {
    it('returns empty events and genres when fetch fails', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
        const result = await fetchTimStreamsEvents();
        expect(result.events).toEqual([]);
        expect(result.genres).toEqual({});
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('fetches channels and watch items accurately with mocks', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
          if (url.includes('/api/channels')) {
            return new Response(JSON.stringify({
              channels: [{ url: 'ch1', name: 'Channel 1', genre: 1 }],
              genres: [{ id: 1, name: 'Sports' }]
            }), { status: 200 });
          }
          if (url.includes('/api/watch/test-item')) {
            return new Response(JSON.stringify({
              item: { url: 'test-item', name: 'Test Event', streams: [{ name: 'HD', url: 'https://ehgembxe.cfd/embed123' }] }
            }), { status: 200 });
          }
          throw new Error('Unexpected URL: ' + url);
        });

        const channelsResult = await fetchTimStreamsChannels();
        expect(channelsResult.channels).toHaveLength(1);
        expect(channelsResult.channels[0].name).toBe('Channel 1');
        expect(channelsResult.genres[1]).toBe('Sports');

        const watchResult = await fetchTimStreamsWatch('test-item');
        expect(watchResult).toBeDefined();
        expect(watchResult?.name).toBe('Test Event');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
