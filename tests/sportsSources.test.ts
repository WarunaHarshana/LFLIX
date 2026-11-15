import { describe, it, expect } from 'vitest';
import { mapPpvCategory, extractTeamsFromPpv, getPpvStreamsForMatch, PpvItem } from '@/lib/ppv';
import { mapStrmFreeCategory, extractTeamsFromStrmFree, StrmFreeStream } from '@/lib/strmfree';
import { mapPitSportCategory, extractTeamsFromPitSport, getPitSportStreams, PitSportProgramPlay } from '@/lib/pitsport';
import { extractTeamsFromTitle, mapTimStreamsCategory } from '@/lib/timstreams';
import { normalizeSportCategory, matchesSportFilter, getMatchKey } from '@/app/api/sports/matches/route';

describe('PPV.st Provider', () => {
  it('correctly maps PPV categories to canonical LFLIX sports', () => {
    expect(mapPpvCategory('Combat Sports')).toBe('fight');
    expect(mapPpvCategory('American Football')).toBe('american-football');
    expect(mapPpvCategory('Football')).toBe('football');
    expect(mapPpvCategory('Basketball')).toBe('basketball');
    expect(mapPpvCategory('Ice Hockey')).toBe('hockey');
    expect(mapPpvCategory('24/7 Streams')).toBe('tv');
  });

  it('extracts teams from US format "Away at Home"', () => {
    const teams = extractTeamsFromPpv('Oregon State Beavers at Boise State Broncos');
    expect(teams).toBeDefined();
    expect(teams?.away.name).toBe('Oregon State Beavers');
    expect(teams?.home.name).toBe('Boise State Broncos');
  });

  it('extracts teams from "Home vs Away"', () => {
    const teams = extractTeamsFromPpv('Real Madrid vs Barcelona');
    expect(teams).toBeDefined();
    expect(teams?.home.name).toBe('Real Madrid');
    expect(teams?.away.name).toBe('Barcelona');
  });

  it('transforms PPV item and substreams into stream options', () => {
    const item: PpvItem = {
      id: 32004,
      name: 'Oregon State Beavers at Boise State Broncos',
      tag: 'College Football',
      source_tag: 'HD | USA Net',
      starts_at: 1794697200,
      ends_at: 1794711600,
      always_live: 0,
      category_name: 'American Football',
      iframe: 'https://taifood-blog.asia/embed/cfb/2026-11-14/orst-bois',
      substreams: [
        {
          id: 1032004,
          name: 'Oregon State Beavers at Boise State Broncos',
          source_tag: 'SD | USA Net',
          iframe: 'https://taifood-blog.asia/embed/cfb/2026-11-14/orst-bois_540p'
        }
      ]
    };

    const streams = getPpvStreamsForMatch(item);
    expect(streams).toHaveLength(2);
    expect(streams[0].id).toBe('ppv-32004-1');
    expect(streams[0].embedUrl).toBe('https://taifood-blog.asia/embed/cfb/2026-11-14/orst-bois');
    expect(streams[0].hd).toBe(true);
    expect(streams[1].id).toBe('ppv-32004-2');
    expect(streams[1].embedUrl).toBe('https://taifood-blog.asia/embed/cfb/2026-11-14/orst-bois_540p');
  });
});

describe('StrmFree.pk Provider', () => {
  it('correctly maps StrmFree categories', () => {
    expect(mapStrmFreeCategory('soccer')).toBe('football');
    expect(mapStrmFreeCategory('basketball')).toBe('basketball');
    expect(mapStrmFreeCategory('mma')).toBe('fight');
    expect(mapStrmFreeCategory('american-football')).toBe('american-football');
  });

  it('extracts teams from team1 / team2 objects', () => {
    const stream: StrmFreeStream = {
      id: 'montenegro-vs-cyprus',
      name: 'Montenegro vs Cyprus',
      category: 'soccer',
      stream_key: 'montenegro-vs-cyprus',
      match_timestamp: 1794751200,
      team1: { name: 'Montenegro', logo: 'https://cdn.example.com/mtg.png' },
      team2: { name: 'Cyprus', logo: 'https://cdn.example.com/cyp.png' }
    };

    const teams = extractTeamsFromStrmFree(stream);
    expect(teams).toBeDefined();
    expect(teams?.home.name).toBe('Montenegro');
    expect(teams?.home.badge).toBe('https://cdn.example.com/mtg.png');
    expect(teams?.away.name).toBe('Cyprus');
  });
});

describe('PitSport.st Provider', () => {
  it('correctly maps motorsport, tennis, and combat categories', () => {
    expect(mapPitSportCategory('Formula 1')).toBe('motor-sports');
    expect(mapPitSportCategory('MotoGP')).toBe('motor-sports');
    expect(mapPitSportCategory('Tennis')).toBe('tennis');
    expect(mapPitSportCategory(null, 'Italian Grand Prix')).toBe('motor-sports');
  });

  it('extracts teams or participants from title', () => {
    const teams = extractTeamsFromPitSport('Sinner vs Alcaraz');
    expect(teams).toBeDefined();
    expect(teams?.home.name).toBe('Sinner');
    expect(teams?.away.name).toBe('Alcaraz');
  });

  it('transforms program play video into stream options', () => {
    const playData: PitSportProgramPlay = {
      program: {},
      video: {
        embedId: 102298,
        embedType: 'video',
        embedUrl: 'https://embdlol.st/embed/01a1d9d0-93c8-756d-baf2-a3b8c9625555',
        label: 'Main Feed',
        isDefault: true
      },
      videos: [
        {
          embedId: 102298,
          embedType: 'video',
          embedUrl: 'https://embdlol.st/embed/01a1d9d0-93c8-756d-baf2-a3b8c9625555',
          label: 'Main Feed',
          isDefault: true
        }
      ],
      hasVideo: true
    };

    const streams = getPitSportStreams(playData, 103182);
    expect(streams).toHaveLength(1);
    expect(streams[0].id).toBe('pitsport-103182-1');
    expect(streams[0].embedUrl).toBe('https://embdlol.st/embed/01a1d9d0-93c8-756d-baf2-a3b8c9625555');
    expect(streams[0].source).toBe('pitsport');
  });
});

describe('TimStreams Provider & Match Key Deduplication', () => {
  it('extracts teams from title with US @ convention or vs', () => {
    const teamsAt = extractTeamsFromTitle('Celtics @ Lakers');
    expect(teamsAt?.away.name).toBe('Celtics');
    expect(teamsAt?.home.name).toBe('Lakers');

    const teamsVs = extractTeamsFromTitle('Arsenal vs Chelsea');
    expect(teamsVs?.home.name).toBe('Arsenal');
    expect(teamsVs?.away.name).toBe('Chelsea');
  });

  it('generates consistent match keys for deduplication regardless of team order or format', () => {
    const matchA = {
      title: 'Arsenal vs Chelsea',
      teams: { home: { name: 'Arsenal' }, away: { name: 'Chelsea' } }
    };
    const matchB = {
      title: 'Chelsea vs Arsenal',
      teams: { home: { name: 'Chelsea' }, away: { name: 'Arsenal' } }
    };

    expect(getMatchKey(matchA)).toBe(getMatchKey(matchB));
    expect(getMatchKey(matchA)).toBe('arsenal-vs-chelsea');
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

describe('Sports Matches Endpoint Integration', () => {
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
