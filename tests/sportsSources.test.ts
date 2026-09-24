import { describe, it, expect } from 'vitest';
import { extractJsonArray, parseEventsData, parseStreamsData } from '@/lib/xyzstreams';
import { getStreamiStreams } from '@/lib/streami';
import { normalizeSportCategory, matchesSportFilter } from '@/app/api/sports/matches/route';

describe('XyzStreams Scraper & Array Extractor', () => {
  it('correctly extracts arrays with timestamps containing colons without JSON corruption', () => {
    const html = `
      <script>
        const EVENTS_DATA = [
          {
            "title": "One FC 100",
            "href": "stream-1.html",
            "start": "2026-09-11T23:00:00Z",
            "end": "2026-09-12T04:30:00Z",
            "category": "Combat Sports"
          },
          {
            title: 'College Football',
            href: 'cfb.html',
            start: '2026-09-11T20:00:00Z',
            end: '2026-09-12T01:00:00Z',
            category: 'American Football',
          }
        ];
      </script>
    `;

    const events = extractJsonArray(html, 'EVENTS_DATA');
    expect(events).toHaveLength(2);
    expect(events[0].title).toBe('One FC 100');
    expect(events[0].start).toBe('2026-09-11T23:00:00Z');
    expect(events[1].title).toBe('College Football');
    expect(events[1].href).toBe('cfb.html');
  });

  it('parses events using parseEventsData with fallback', () => {
    const html = `
      <script>
        const EVENTS_DATA = [
          {
            "title": "Arsenal vs Chelsea",
            "href": "pl-1.html",
            "start": "2026-09-12T15:00:00Z",
            "end": "2026-09-12T17:00:00Z",
            "category": "Football"
          }
        ];
      </script>
    `;

    const events = parseEventsData(html);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Arsenal vs Chelsea');
    expect(events[0].category).toBe('Football');
  });

  it('parses channel streams from modern iframe structure and stream buttons', () => {
    const channelHtml = `
      <div id="playerContainer">
        <iframe id="stream-player" src="https://xyzstreams.st/embed?espn" allowfullscreen></iframe>
      </div>
      <div class="stream-switcher">
        <button class="stream-btn active" data-url="https://xyzstreams.st/embed?espn">Server 1 (ESPN)</button>
        <button class="stream-btn" data-url="https://xyzstreams.st/embed?espn2">Server 2 (ESPN 2)</button>
      </div>
    `;

    const streams = parseStreamsData(channelHtml);
    expect(streams.length).toBeGreaterThanOrEqual(2);
    expect(streams.some(s => s.embedUrl?.includes('espn'))).toBe(true);
    expect(streams.some(s => s.embedUrl?.includes('espn2'))).toBe(true);
  });

  it('parses channel streams from legacy array when present', () => {
    const legacyHtml = `
      <script>
        const streams = [
          { server: 'HD 1', btnName: 'Main HD', title: 'Main Stream', file: 'https://cdn.example.com/live.m3u8' }
        ];
      </script>
    `;

    const streams = parseStreamsData(legacyHtml);
    expect(streams).toHaveLength(1);
    expect(streams[0].file).toBe('https://cdn.example.com/live.m3u8');
  });
});

describe('Streami Embeds Filter', () => {
  it('filters out empty placeholder channel_id embeds and keeps valid feeds', () => {
    const eventWithPlaceholders: any = {
      id: 'test-event',
      title: 'Test Match',
      category: 'mma',
      startTime: 1788537600,
      _embeds: [
        {
          language: 'English | Fake',
          embeds: [
            { embed: 'https://streami.fit/live/?channel_id=', label: 'FHD' },
            { embed: 'https://streami.fit/live/?channel_id=null', label: 'HD' },
          ]
        },
        {
          language: 'English | Real',
          embeds: [
            { embed: 'https://bestembeds.buzz/live/?channel_id=ufc', label: 'FHD' }
          ]
        }
      ]
    };

    const streams = getStreamiStreams(eventWithPlaceholders);
    expect(streams).toHaveLength(1);
    expect(streams[0].embedUrl).toBe('https://bestembeds.buzz/live/?channel_id=ufc');
    expect(streams[0].language).toContain('English | Real');
  });

  it('returns empty stream list for events with exclusively placeholder embeds', () => {
    const eventOnlyPlaceholders: any = {
      id: 'placeholder-event',
      title: 'Upcoming Match',
      category: 'mma',
      startTime: 1788537600,
      _embeds: [
        {
          language: 'English',
          embeds: [
            { embed: 'https://streami.fit/live/?channel_id=', label: 'FHD' }
          ]
        }
      ]
    };

    const streams = getStreamiStreams(eventOnlyPlaceholders);
    expect(streams).toHaveLength(0);
  });
});

describe('Category Normalization and Aliases', () => {
  it('correctly maps combat sports and motorsport aliases', () => {
    expect(normalizeSportCategory('combat', 'ONE Championship')).toBe('fight');
    expect(normalizeSportCategory('formula 1', 'Monza GP')).toBe('motor-sports');
    expect(normalizeSportCategory('futsal', 'World Cup')).toBe('football');
  });

  it('matches sport filter with bidirectional aliases', () => {
    expect(matchesSportFilter('fight', 'mma')).toBe(true);
    expect(matchesSportFilter('mma', 'fight')).toBe(true);
    expect(matchesSportFilter('motor-sports', 'formula1')).toBe(true);
    expect(matchesSportFilter('formula1', 'motor-sports')).toBe(true);
    expect(matchesSportFilter('football', 'soccer')).toBe(true);
    expect(matchesSportFilter('soccer', 'football')).toBe(true);
  });
});

describe('Sports Categories Endpoint', () => {
  it('returns canonical enriched sports list', async () => {
    const { GET: getCategories } = await import('@/app/api/sports/categories/route');
    const res = await getCategories();
    const data = await res.json();
    expect(data.sports).toBeDefined();
    expect(Array.isArray(data.sports)).toBe(true);
    expect(data.sports.length).toBeGreaterThan(5);
    expect(data.sports.some((s: any) => s.id === 'football')).toBe(true);
    expect(data.sports.some((s: any) => s.id === 'motor-sports')).toBe(true);
    expect(data.sports.some((s: any) => s.id === 'fight')).toBe(true);
  });
});

describe('Sports Matches Endpoint Live & Today Integration', () => {
  it('fetches matches with live and today filters without throwing', async () => {
    const { GET: getMatches } = await import('@/app/api/sports/matches/route');
    
    // Test live
    const liveReq = new Request('http://localhost:3000/api/sports/matches?type=live');
    const liveRes = await getMatches(liveReq);
    expect(liveRes.status).toBe(200);
    const liveData = await liveRes.json();
    expect(Array.isArray(liveData.matches)).toBe(true);

    // Test today
    const todayReq = new Request('http://localhost:3000/api/sports/matches?type=today');
    const todayRes = await getMatches(todayReq);
    expect(todayRes.status).toBe(200);
    const todayData = await todayRes.json();
    expect(Array.isArray(todayData.matches)).toBe(true);
  }, 30000);
});
