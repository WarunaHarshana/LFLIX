import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET as getMatches, normalizeSportCategory, matchesSportFilter, getMatchKey } from '@/app/api/sports/matches/route';
import { GET as getStreams } from '@/app/api/sports/streams/route';
import { GET as resolveStream } from '@/app/api/sports/streams/resolve/route';
import { GET as getIptvChannels } from '@/app/api/iptv/channels/route';
import * as ppvModule from '@/lib/ppv';
import * as strmFreeModule from '@/lib/strmfree';
import * as timStreamsModule from '@/lib/timstreams';
import * as pitSportModule from '@/lib/pitsport';

describe('Comprehensive Sports & TV Integration Suite', () => {
  describe('Provider Category Normalization and Bidirectional Filtering', () => {
    it('normalizes common aliases to canonical sports', () => {
      // Football / Soccer
      expect(normalizeSportCategory('soccer', 'Liverpool vs Chelsea')).toBe('football');
      expect(normalizeSportCategory('futsal', 'Brazil vs Spain')).toBe('football');

      // Combat sports
      expect(normalizeSportCategory('combat sports', 'UFC 300: Pereira vs Hill')).toBe('fight');
      expect(normalizeSportCategory('mma', 'Bellator')).toBe('fight');
      expect(normalizeSportCategory('boxing', 'Canelo vs Bivol')).toBe('fight');
      expect(normalizeSportCategory('wrestling', 'WWE Raw')).toBe('fight');

      // Motorsport
      expect(normalizeSportCategory('formula 1', 'Monza GP')).toBe('motor-sports');
      expect(normalizeSportCategory('motogp', 'Catalunya')).toBe('motor-sports');
      expect(normalizeSportCategory('nascar', 'Daytona 500')).toBe('motor-sports');
      expect(normalizeSportCategory('indycar', 'Indy 500')).toBe('motor-sports');

      // American Football / Basketball / Tennis
      expect(normalizeSportCategory('american football', 'Chiefs vs 49ers')).toBe('american-football');
      expect(normalizeSportCategory('basketball', 'Lakers vs Celtics')).toBe('basketball');
      expect(normalizeSportCategory('tennis', 'Alcaraz vs Sinner')).toBe('tennis');
      expect(normalizeSportCategory('snooker', 'World Championship')).toBe('billiards');
    });

    it('matches sports filters bidirectionally with alias support', () => {
      expect(matchesSportFilter('football', 'soccer')).toBe(true);
      expect(matchesSportFilter('soccer', 'football')).toBe(true);
      expect(matchesSportFilter('fight', 'mma')).toBe(true);
      expect(matchesSportFilter('mma', 'fight')).toBe(true);
      expect(matchesSportFilter('fight', 'boxing')).toBe(true);
      expect(matchesSportFilter('motor-sports', 'formula1')).toBe(true);
      expect(matchesSportFilter('formula1', 'motor-sports')).toBe(true);
      expect(matchesSportFilter('motor-sports', 'f1')).toBe(true);
      expect(matchesSportFilter('american-football', 'nfl')).toBe(true);
      expect(matchesSportFilter('basketball', 'nba')).toBe(true);
    });
  });

  describe('Deduplication & Match Key Generation', () => {
    it('generates normalized keys regardless of home/away order', () => {
      const match1 = {
        title: 'Arsenal vs Manchester City',
        teams: { home: { name: 'Arsenal' }, away: { name: 'Manchester City' } }
      };
      const match2 = {
        title: 'Manchester City at Arsenal',
        teams: { home: { name: 'Arsenal' }, away: { name: 'Manchester City' } }
      };
      const match3 = {
        title: 'Manchester City vs Arsenal',
        teams: { home: { name: 'Manchester City' }, away: { name: 'Arsenal' } }
      };

      expect(getMatchKey(match1)).toBe('arsenal-vs-manchestercity');
      expect(getMatchKey(match2)).toBe('arsenal-vs-manchestercity');
      expect(getMatchKey(match3)).toBe('arsenal-vs-manchestercity');
    });

    it('extracts and deduplicates matches from title when teams object is missing', () => {
      const matchA = { title: 'Lakers vs Golden State Warriors' };
      const matchB = { title: 'Golden State Warriors @ Lakers' };

      expect(getMatchKey(matchA)).toBe('goldenstatewarriors-vs-lakers');
      expect(getMatchKey(matchB)).toBe('goldenstatewarriors-vs-lakers');
    });
  });

  describe('Multi-Provider Match Aggregation & Deduplication Route', () => {
    let mockPpvSpy: any;
    let mockStrmFreeSpy: any;
    let mockTimStreamsSpy: any;
    let mockPitSportSpy: any;

    beforeEach(() => {
      mockPpvSpy = vi.spyOn(ppvModule, 'fetchPpvEvents');
      mockStrmFreeSpy = vi.spyOn(strmFreeModule, 'fetchStrmFreeStreams');
      mockTimStreamsSpy = vi.spyOn(timStreamsModule, 'fetchTimStreamsEvents');
      mockPitSportSpy = vi.spyOn(pitSportModule, 'fetchPitSportLiveNow');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('aggregates and merges identical matches from multiple providers into a single match with multiple sources', async () => {
      const now = Date.now();

      // Provider 1: PPV has Real Madrid vs Barcelona
      mockPpvSpy.mockResolvedValue([
        {
          id: 501,
          name: 'Real Madrid vs Barcelona',
          starts_at: Math.floor(now / 1000),
          ends_at: Math.floor(now / 1000) + 7200,
          always_live: 0,
          category_name: 'Football',
          iframe: 'https://taifood-blog.asia/embed/elclasico',
          tag: 'La Liga'
        }
      ]);

      // Provider 2: StrmFree also has Barcelona vs Real Madrid (inverted title)
      mockStrmFreeSpy.mockResolvedValue([
        {
          id: 'fcb-rma',
          name: 'Barcelona vs Real Madrid',
          category: 'soccer',
          league: 'La Liga',
          stream_key: 'fcb-rma',
          match_timestamp: Math.floor(now / 1000),
          team1: { name: 'Barcelona' },
          team2: { name: 'Real Madrid' }
        }
      ]);

      // Provider 3: TimStreams has Real Madrid vs Barcelona
      mockTimStreamsSpy.mockResolvedValue({
        events: [
          {
            url: 'real-madrid-vs-barcelona-laliga',
            name: 'Real Madrid vs Barcelona',
            genre: 1,
            time: new Date(now).toISOString()
          }
        ],
        genres: { 1: 'Soccer' }
      });

      // Provider 4: PitSport has a distinct F1 race
      mockPitSportSpy.mockResolvedValue({
        live: [
          {
            programId: 901,
            slug: 'monaco-gp',
            titleText: 'Formula 1 Monaco Grand Prix',
            sessionStart: Math.floor(now / 1000),
            href: '/programs/monaco-gp',
            playHref: '/programs/901/play',
            liveState: 'live',
            kind: 'racing',
            competitionSlug: 'formula-1'
          }
        ],
        upcoming: []
      });

      const req = new Request('http://localhost:3000/api/sports/matches?type=all');
      const res = await getMatches(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.matches).toHaveLength(2); // 1 merged El Clasico + 1 Monaco GP

      // Find the merged El Clasico
      const elClasico = data.matches.find((m: any) => m.category === 'football');
      expect(elClasico).toBeDefined();
      expect(elClasico.sources).toHaveLength(3); // Merged sources from PPV, StrmFree, and TimStreams
      expect(elClasico.sources.map((s: any) => s.source)).toEqual(
        expect.arrayContaining(['ppv', 'strmfree', 'timstreams'])
      );

      // Find Monaco GP
      const monaco = data.matches.find((m: any) => m.category === 'motor-sports');
      expect(monaco).toBeDefined();
      expect(monaco.sources).toHaveLength(1);
      expect(monaco.sources[0].source).toBe('pitsport');
    });

    it('isolates failures with Promise.allSettled when one or more providers reject', async () => {
      // PPV rejects with network failure
      mockPpvSpy.mockRejectedValue(new Error('Connection timed out'));
      // StrmFree rejects with DNS error
      mockStrmFreeSpy.mockRejectedValue(new Error('ENOTFOUND strmfree.pk'));

      // TimStreams succeeds
      mockTimStreamsSpy.mockResolvedValue({
        events: [
          {
            url: 'celtics-at-heat',
            name: 'Boston Celtics at Miami Heat',
            genre: 7,
            time: new Date().toISOString()
          }
        ],
        genres: { 7: 'Basketball' }
      });

      // PitSport succeeds
      mockPitSportSpy.mockResolvedValue({
        live: [],
        upcoming: [
          {
            programId: 999,
            slug: 'atp-finals',
            titleText: 'ATP Finals: Sinner vs Alcaraz',
            sessionStart: Math.floor(Date.now() / 1000) + 3600,
            href: '/programs/atp-finals',
            playHref: '/programs/999/play',
            liveState: 'upcoming',
            kind: 'tennis',
            competitionSlug: 'tennis'
          }
        ]
      });

      const req = new Request('http://localhost:3000/api/sports/matches?type=all');
      const res = await getMatches(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.matches.length).toBeGreaterThanOrEqual(2);
      expect(data.matches.some((m: any) => m.category === 'basketball')).toBe(true);
      expect(data.matches.some((m: any) => m.category === 'tennis')).toBe(true);
    });

    it('filters matches by search query across titles and team names', async () => {
      mockPpvSpy.mockResolvedValue([]);
      mockStrmFreeSpy.mockResolvedValue([]);
      mockPitSportSpy.mockResolvedValue({ live: [], upcoming: [] });
      mockTimStreamsSpy.mockResolvedValue({
        events: [
          {
            url: 'arsenal-vs-liverpool',
            name: 'Arsenal vs Liverpool',
            genre: 1,
            time: new Date().toISOString()
          },
          {
            url: 'lakers-vs-warriors',
            name: 'LA Lakers vs Golden State Warriors',
            genre: 7,
            time: new Date().toISOString()
          }
        ],
        genres: { 1: 'Soccer', 7: 'Basketball' }
      });

      // Search for "Warriors"
      const req = new Request('http://localhost:3000/api/sports/matches?type=all&q=warriors');
      const res = await getMatches(req);
      const data = await res.json();

      expect(data.matches).toHaveLength(1);
      expect(data.matches[0].title).toContain('Warriors');
    });
  });

  describe('Streams Endpoint (/api/sports/streams)', () => {
    it('returns 400 when stream id is missing', async () => {
      const req = new Request('http://localhost:3000/api/sports/streams?source=ppv');
      const res = await getStreams(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Source and ID are required');
    });

    it('returns empty array when unknown provider is specified', async () => {
      const req = new Request('http://localhost:3000/api/sports/streams?source=unknown_provider&id=123');
      const res = await getStreams(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.streams).toEqual([]);
    });

    it('fetches streams for all 4 providers without errors', async () => {
      // 1. PPV
      const ppvReq = new Request('http://localhost:3000/api/sports/streams?source=ppv&id=nfl-network');
      const ppvRes = await getStreams(ppvReq);
      expect(ppvRes.status).toBe(200);
      const ppvData = await ppvRes.json();
      expect(Array.isArray(ppvData.streams)).toBe(true);

      // 2. StrmFree
      const strmReq = new Request('http://localhost:3000/api/sports/streams?source=strmfree&id=montenegro-vs-cyprus');
      const strmRes = await getStreams(strmReq);
      expect(strmRes.status).toBe(200);
      const strmData = await strmRes.json();
      expect(Array.isArray(strmData.streams)).toBe(true);

      // 3. TimStreams
      const timReq = new Request('http://localhost:3000/api/sports/streams?source=timstreams&id=ufc-334-gane-vs-hokit-ufc-600061400');
      const timRes = await getStreams(timReq);
      expect(timRes.status).toBe(200);
      const timData = await timRes.json();
      expect(Array.isArray(timData.streams)).toBe(true);

      // 4. PitSport
      const pitReq = new Request('http://localhost:3000/api/sports/streams?source=pitsport&id=103182');
      const pitRes = await getStreams(pitReq);
      expect(pitRes.status).toBe(200);
      const pitData = await pitRes.json();
      expect(Array.isArray(pitData.streams)).toBe(true);
    });
  });

  describe('Streams Resolver Endpoint (/api/sports/streams/resolve)', () => {
    it('returns 400 when stream ID parameter is omitted', async () => {
      const req = new Request('http://localhost:3000/api/sports/streams/resolve');
      const res = await resolveStream(req as any);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Stream ID is required');
    });

    it('redirects to embed URL for PitSport provider', async () => {
      vi.spyOn(pitSportModule, 'fetchPitSportPlay').mockResolvedValue({
        program: {},
        video: {
          embedId: 102298,
          embedType: 'video',
          embedUrl: 'https://embdlol.st/embed/test-uuid',
          isDefault: true
        },
        videos: [],
        hasVideo: true
      });

      const req = new Request('http://localhost:3000/api/sports/streams/resolve?source=pitsport&id=102298');
      const res = await resolveStream(req as any);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://embdlol.st/embed/test-uuid');
    });

    it('redirects to StrmFree live source or embed fallback', async () => {
      vi.spyOn(strmFreeModule, 'fetchStrmFreeSources').mockResolvedValue([
        {
          quality: 'HD',
          url: 'https://strmfree.pk/live/embed-player-1',
          live: true
        }
      ]);

      const req = new Request('http://localhost:3000/api/sports/streams/resolve?source=strmfree&id=test-stream-key');
      const res = await resolveStream(req as any);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://strmfree.pk/live/embed-player-1');
    });

    it('redirects to decoded TimStreams HLS m3u8 url', async () => {
      const targetM3u8 = 'https://tims-001.sytes.net/main/secure/token/123/stream.m3u8';
      vi.spyOn(timStreamsModule, 'resolveTimStream').mockResolvedValue(targetM3u8);

      const req = new Request('http://localhost:3000/api/sports/streams/resolve?source=timstreams&id=test-embed-id');
      const res = await resolveStream(req as any);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(targetM3u8);
    });

    it('returns 500 when stream resolution fails', async () => {
      vi.spyOn(timStreamsModule, 'resolveTimStream').mockRejectedValue(new Error('Decryption failed'));

      const req = new Request('http://localhost:3000/api/sports/streams/resolve?source=timstreams&id=bad-id');
      const res = await resolveStream(req as any);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain('Decryption failed');
    });
  });

  describe('Live TV Channels Aggregation (/api/iptv/channels)', () => {
    it('aggregates channels from multiple sources and isolates provider failures', async () => {
      // Mock TimStreams channels throwing error
      vi.spyOn(timStreamsModule, 'fetchTimStreamsChannels').mockRejectedValue(new Error('TimStreams offline'));

      // Mock PPV channels succeeding
      vi.spyOn(ppvModule, 'fetchPpvChannels').mockResolvedValue([
        {
          id: 9901,
          name: 'NFL Network 24/7',
          starts_at: 0,
          ends_at: 0,
          always_live: 1,
          category_name: 'Sports TV',
          iframe: 'https://taifood-blog.asia/embed/nfl-network'
        }
      ]);

      const req = new Request('http://localhost:3000/api/iptv/channels');
      const res = await getIptvChannels(req as any);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.channels)).toBe(true);

      // Should still include PPV channels even though TimStreams threw
      const ppvChannel = data.channels.find((c: any) => c.name === 'NFL Network 24/7');
      expect(ppvChannel).toBeDefined();
      expect(ppvChannel.country).toBe('USA');
      expect(ppvChannel.category).toBe('Sports TV');
    });
  });
});
