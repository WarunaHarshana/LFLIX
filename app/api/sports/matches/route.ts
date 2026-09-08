import { NextResponse } from 'next/server';
import { fetchStreamiEvents, getStreamiTitle, mapStreamiCategory } from '@/lib/streami';
import { fetchXyzEvents } from '@/lib/xyzstreams';
import { fetchTimStreamsEvents, parseTimStreamsTimeToUTC, mapTimStreamsCategory, extractTeamsFromTitle } from '@/lib/timstreams';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Streamed.pk API integration for live sports
const API_BASE = 'https://streamed.pk/api';

export function normalizeSportCategory(category?: string | null, title?: string | null): string {
  const cat = (category || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();

  // 1. Tennis detection (handles 'other' category for US Open, Wimbledon, etc.)
  if (
    cat === 'tennis' ||
    cat === 'tenis' ||
    t.includes('🎾') ||
    t.includes('tennis') ||
    t.includes('us open') ||
    t.includes('wimbledon') ||
    t.includes('roland garros') ||
    t.includes('australian open') ||
    /\b(atp|wta|davis cup)\b/.test(t)
  ) {
    return 'tennis';
  }

  // 2. Billiards & Snooker (handles 'other' category for Snooker English Open 🎱)
  if (
    cat === 'billiards' ||
    cat === 'snooker' ||
    cat === 'pool' ||
    t.includes('🎱') ||
    t.includes('snooker') ||
    t.includes('billiards') ||
    t.includes('english open') ||
    t.includes('9-ball')
  ) {
    return 'billiards';
  }

  // 3. Fight (MMA, Boxing, UFC, Wrestling)
  if (
    cat === 'fight' ||
    cat === 'mma' ||
    cat === 'boxing' ||
    cat === 'boks' ||
    cat === 'combat' ||
    cat === 'combat sports' ||
    cat === 'wrestling' ||
    t.includes('🥊') ||
    t.includes('🥋') ||
    t.includes('ufc') ||
    t.includes('bellator') ||
    t.includes('pfl') ||
    t.includes('wwe') ||
    t.includes('boxing') ||
    t.includes('bare knuckle')
  ) {
    return 'fight';
  }

  // 4. Motorsport & Formula 1
  if (
    cat === 'motor-sports' ||
    cat === 'motorsport' ||
    cat === 'formula1' ||
    cat === 'formula 1' ||
    cat === 'racing' ||
    t.includes('🏎️') ||
    t.includes('f1') ||
    t.includes('formula 1') ||
    t.includes('formula') ||
    t.includes('motogp') ||
    t.includes('nascar') ||
    t.includes('indycar') ||
    t.includes('grand prix')
  ) {
    return 'motor-sports';
  }

  // 5. Basketball
  if (
    cat === 'basketball' ||
    cat === 'koszykowka' ||
    t.includes('🏀') ||
    t.includes('nba') ||
    t.includes('wnba') ||
    t.includes('euroleague')
  ) {
    return 'basketball';
  }

  // 6. American Football
  if (
    cat === 'american-football' ||
    cat === 'americanfootball' ||
    cat === 'nfl' ||
    t.includes('🏈') ||
    t.includes('nfl') ||
    t.includes('super bowl') ||
    t.includes('college football')
  ) {
    return 'american-football';
  }

  // 7. Baseball
  if (
    cat === 'baseball' ||
    t.includes('⚾') ||
    t.includes('mlb') ||
    t.includes('world series')
  ) {
    return 'baseball';
  }

  // 8. Ice Hockey
  if (
    cat === 'hockey' ||
    cat === 'hokej' ||
    cat === 'hokej_phl' ||
    t.includes('🏒') ||
    t.includes('nhl') ||
    t.includes('ice hockey') ||
    t.includes('stanley cup')
  ) {
    return 'hockey';
  }

  // 9. Cricket
  if (
    cat === 'cricket' ||
    cat === 'krykiet' ||
    t.includes('🏏') ||
    t.includes('cricket') ||
    t.includes('ipl') ||
    t.includes('t20')
  ) {
    return 'cricket';
  }

  // 10. Rugby & AFL
  if (
    cat === 'rugby' ||
    cat === 'afl' ||
    cat === 'australianfootball' ||
    t.includes('🏉') ||
    t.includes('rugby') ||
    t.includes('six nations') ||
    t.includes('nrl') ||
    t.includes('afl')
  ) {
    return 'rugby';
  }

  // 11. Golf
  if (
    cat === 'golf' ||
    t.includes('⛳') ||
    t.includes('golf') ||
    t.includes('pga') ||
    t.includes('liv golf') ||
    t.includes('ryder cup')
  ) {
    return 'golf';
  }

  // 12. Darts
  if (
    cat === 'darts' ||
    cat === 'dart' ||
    t.includes('🎯') ||
    t.includes('darts') ||
    t.includes('pdc')
  ) {
    return 'darts';
  }

  // 13. Football / Soccer
  if (
    cat === 'football' ||
    cat === 'soccer' ||
    cat === 'pilkanozna' ||
    cat === 'pilkanozna_wazne' ||
    cat === 'futsal' ||
    t.includes('⚽') ||
    t.includes('premier league') ||
    t.includes('la liga') ||
    t.includes('serie a') ||
    t.includes('bundesliga') ||
    t.includes('champions league') ||
    t.includes('europa league') ||
    t.includes('fifa')
  ) {
    return 'football';
  }

  return cat || 'other';
}

export function matchesSportFilter(matchCategory: string, requestedSport: string): boolean {
  if (!requestedSport || requestedSport === 'all') return true;
  const matchCat = matchCategory.toLowerCase().trim();
  const req = requestedSport.toLowerCase().trim();

  if (req === matchCat) return true;

  // Aliases for Fight / Combat sports
  if (req === 'fight' && ['mma', 'boxing', 'combat'].includes(matchCat)) return true;
  if (['mma', 'boxing'].includes(req) && matchCat === 'fight') return true;

  // Aliases for Motorsport
  if (req === 'motor-sports' && ['motorsport', 'formula1', 'formula'].includes(matchCat)) return true;
  if (['formula1', 'motorsport'].includes(req) && matchCat === 'motor-sports') return true;

  // Aliases for Billiards / Snooker
  if (req === 'billiards' && ['snooker', 'pool'].includes(matchCat)) return true;
  if (['snooker', 'pool'].includes(req) && matchCat === 'billiards') return true;

  // Aliases for Rugby / AFL
  if (req === 'rugby' && matchCat === 'afl') return true;
  if (req === 'afl' && matchCat === 'rugby') return true;

  // Aliases for Football
  if (req === 'football' && ['soccer', 'futsal'].includes(matchCat)) return true;

  return false;
}

function getMatchKey(match: any): string {
  if (match.teams?.home?.name && match.teams?.away?.name) {
    const t1 = match.teams.home.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const t2 = match.teams.away.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [t1, t2].sort().join('-vs-');
  }
  const vsMatch = match.title.match(/(.+?)\s*(?:vs\.?|v\.|@|[-–])\s*(.+)/i);
  if (vsMatch) {
    const t1 = vsMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    const t2 = vsMatch[2].toLowerCase().replace(/[^a-z0-9]/g, '');
    return [t1, t2].sort().join('-vs-');
  }
  return match.title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeKey(str?: string | null): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveImageUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/api/')) return `https://streamed.pk${path}`;
  if (path.startsWith('/')) return `https://streamed.pk${path}`;
  return `https://streamed.pk/api/images/proxy/${path}.webp`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'live';
  const sport = searchParams.get('sport') || 'all';
  const query = searchParams.get('q')?.toLowerCase().trim();

  let transformedMatches: any[] = [];
  let timStreamsMatches: any[] = [];

  const posterMap = new Map<string, string>();
  const teamPosterMap = new Map<string, string>();
  const badgeMap = new Map<string, string>();
  let allTodayRaw: any[] = [];

  // Fetch all-today as master poster and team badge metadata dictionary
  try {
    const allTodayRes = await fetch(`${API_BASE}/matches/all-today`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 60 }
    });
    if (allTodayRes.ok) {
      allTodayRaw = await allTodayRes.json();
      for (const m of allTodayRaw) {
        const resolvedPoster = resolveImageUrl(m.poster);
        const titleKey = normalizeKey(m.title);
        if (resolvedPoster) {
          posterMap.set(titleKey, resolvedPoster);
        }
        if (m.teams?.home?.name && m.teams?.away?.name) {
          const t1 = normalizeKey(m.teams.home.name);
          const t2 = normalizeKey(m.teams.away.name);
          if (resolvedPoster) {
            teamPosterMap.set([t1, t2].sort().join('-vs-'), resolvedPoster);
          }
          if (m.teams.home.badge) {
            badgeMap.set(t1, resolveImageUrl(m.teams.home.badge)!);
          }
          if (m.teams.away.badge) {
            badgeMap.set(t2, resolveImageUrl(m.teams.away.badge)!);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch all-today metadata dictionary:', err);
  }

  const enrichMatchPosterAndBadges = (match: any) => {
    if (!match.poster) {
      const titleKey = normalizeKey(match.title);
      if (posterMap.has(titleKey)) {
        match.poster = posterMap.get(titleKey);
      } else if (match.teams?.home?.name && match.teams?.away?.name) {
        const t1 = normalizeKey(match.teams.home.name);
        const t2 = normalizeKey(match.teams.away.name);
        const tk = [t1, t2].sort().join('-vs-');
        if (teamPosterMap.has(tk)) {
          match.poster = teamPosterMap.get(tk);
        } else {
          for (const [k, p] of teamPosterMap.entries()) {
            if ((k.includes(t1) && k.includes(t2)) || (t1.includes(k.split('-vs-')[0]) && t2.includes(k.split('-vs-')[1]))) {
              match.poster = p;
              break;
            }
          }
        }
      }
      if (!match.poster) {
        for (const [k, p] of posterMap.entries()) {
          if (titleKey.length > 5 && (titleKey.includes(k) || k.includes(titleKey))) {
            match.poster = p;
            break;
          }
        }
      }
    }

    if (match.teams) {
      if (!match.teams.home) match.teams.home = { name: '' };
      if (!match.teams.away) match.teams.away = { name: '' };

      if (!match.teams.home.badge && match.teams.home.name) {
        const homeKey = normalizeKey(match.teams.home.name);
        if (badgeMap.has(homeKey)) {
          match.teams.home.badge = badgeMap.get(homeKey);
        }
      }
      if (!match.teams.away.badge && match.teams.away.name) {
        const awayKey = normalizeKey(match.teams.away.name);
        if (badgeMap.has(awayKey)) {
          match.teams.away.badge = badgeMap.get(awayKey);
        }
      }
    }
  };

  // 1. Fetch streamed.pk matches
  try {
    let rawStreamedMatches: any[] = [];

    if (type === 'live') {
      // Fetch /matches/live
      try {
        const liveRes = await fetch(`${API_BASE}/matches/live`, {
          headers: { Accept: 'application/json' },
          next: { revalidate: 60 }
        });
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          rawStreamedMatches = Array.isArray(liveData) ? liveData : [];
        }
      } catch (e) {
        console.error('Error fetching matches/live:', e);
      }

      // Also identify any matches from all-today that are active right now (started in last 3.5h or starting in next 20m)
      const now = Date.now();
      const liveKeys = new Set(rawStreamedMatches.map(m => getMatchKey(m)));

      for (const m of allTodayRaw) {
        const matchTime = typeof m.date === 'number' ? m.date : new Date(m.date).getTime();
        const isInLiveWindow = (now >= matchTime - 20 * 60 * 1000) && (now <= matchTime + 3.5 * 3600 * 1000);
        if (isInLiveWindow) {
          const key = getMatchKey(m);
          if (!liveKeys.has(key)) {
            rawStreamedMatches.push(m);
            liveKeys.add(key);
          }
        }
      }
    } else {
      // 'today' or 'popular'
      rawStreamedMatches = allTodayRaw;
    }

    transformedMatches = rawStreamedMatches.map((match: any) => {
      const matchTime = typeof match.date === 'number' ? match.date : new Date(match.date).getTime();
      const now = Date.now();
      const isLiveTime = (now >= matchTime - 20 * 60 * 1000) && (now <= matchTime + 3.5 * 3600 * 1000);
      const isLive = type === 'live' || isLiveTime;
      const normalizedCat = normalizeSportCategory(match.category, match.title);

      const item = {
        id: match.id,
        title: match.title,
        category: normalizedCat,
        date: matchTime,
        poster: resolveImageUrl(match.poster),
        popular: !!match.popular,
        teams: match.teams ? {
          home: {
            name: match.teams.home?.name || '',
            badge: resolveImageUrl(match.teams.home?.badge)
          },
          away: {
            name: match.teams.away?.name || '',
            badge: resolveImageUrl(match.teams.away?.badge)
          }
        } : undefined,
        sources: match.sources || [],
        isLive,
        is4k: !!(match.title && (match.title.toLowerCase().includes('4k') || match.title.toLowerCase().includes('uhd')))
      };
      enrichMatchPosterAndBadges(item);
      return item;
    });

    // Apply 4k / sport filtering to streamed.pk matches
    if (sport === '4k') {
      transformedMatches = transformedMatches.filter(m => m.is4k);
    } else if (sport !== 'all') {
      transformedMatches = transformedMatches.filter(m => matchesSportFilter(m.category, sport));
    }

    if (type === 'live') {
      transformedMatches = transformedMatches.filter(m => m.isLive);
    }
  } catch (error) {
    console.error('Sports API error:', error);
  }

  // 2. Fetch TimStreams matches
  try {
    const { events: tsEvents, genres: tsGenres } = await fetchTimStreamsEvents();
    if (tsEvents && Array.isArray(tsEvents)) {
      let rawMatches = tsEvents.map((event: any) => {
        const dateMs = parseTimStreamsTimeToUTC(event.time);
        const now = Date.now();
        const isLive = (now >= dateMs - 30 * 60 * 1000) && (now <= dateMs + 4 * 3600 * 1000);
        const has4k = event.streams && event.streams.some((s: any) => 
          s.name && (s.name.toLowerCase().includes('4k') || s.name.toLowerCase().includes('uhd'))
        );
        const genreName = tsGenres[event.genre] || 'Others';
        const mappedCategory = mapTimStreamsCategory(event.genre, tsGenres);
        const normalizedCat = normalizeSportCategory(mappedCategory === 'other' ? genreName : mappedCategory, event.name);
        const teams = extractTeamsFromTitle(event.name);

        return {
          id: `tim-${event.url}`,
          title: event.name,
          category: normalizedCat,
          date: dateMs,
          poster: event.logo || null,
          popular: !!event.featured,
          teams,
          sources: [{ source: 'timstreams', id: event.url }],
          isLive,
          is4k: !!has4k
        };
      });

      // Apply type filtering
      if (type === 'live') {
        rawMatches = rawMatches.filter((match: any) => {
          const key = getMatchKey(match);
          const existsInStreamedPk = transformedMatches.some(m => getMatchKey(m) === key);
          return match.isLive || existsInStreamedPk;
        });
      } else if (type === 'popular') {
        rawMatches = rawMatches.filter((match: any) => match.popular);
      }

      // Apply sport filtering
      if (sport === '4k') {
        rawMatches = rawMatches.filter((match: any) => match.is4k);
      } else if (sport !== 'all') {
        rawMatches = rawMatches.filter((match: any) => matchesSportFilter(match.category, sport));
      }

      timStreamsMatches = rawMatches;
    }
  } catch (error) {
    console.error('TimStreams sports API error:', error);
  }

  // 3. Fetch Streami.click events
  let streamiMatches: any[] = [];
  try {
    const streamiEvents = await fetchStreamiEvents();

    let rawStreamiMatches = streamiEvents.map((event) => {
      const title = getStreamiTitle(event);
      const mappedCategory = mapStreamiCategory(event.category);
      const normalizedCat = normalizeSportCategory(mappedCategory, title);
      const dateMs = event.startTime * 1000;
      const now = Date.now();
      const isLive = (now >= dateMs - 30 * 60 * 1000) && (now <= dateMs + 4 * 3600 * 1000);
      const has4k = event._embeds?.some(block => {
        const embeds = Array.isArray(block.embeds) ? block.embeds : Object.values(block.embeds);
        return embeds.some((e: any) =>
          e.label && (e.label.toLowerCase().includes('4k') || e.label.toLowerCase().includes('uhd'))
        );
      });

      // Try to extract team names from title (supports "Team A - Team B" format)
      let teams: any = undefined;
      const vsMatch = title.match(/^(.+?)\s*[-–vs.]+\s*(.+)$/i);
      if (vsMatch && mappedCategory !== 'pinned' && mappedCategory !== 'tv') {
        teams = {
          home: { name: vsMatch[1].trim() },
          away: { name: vsMatch[2].trim() },
        };
      }

      return {
        id: `streami-${event.id}`,
        title,
        category: mappedCategory === 'pinned' || mappedCategory === 'tv' ? 'other' : normalizedCat,
        date: dateMs,
        poster: null,
        popular: event.category === 'pilkanozna_wazne' || event.category === 'przypiete',
        teams,
        sources: [{ source: 'streami', id: event.id }],
        isLive,
        is4k: !!has4k,
      };
    });

    // Filter out pinned/TV items for sport queries
    rawStreamiMatches = rawStreamiMatches.filter((m: any) => m.category !== 'pinned' && m.category !== 'tv');

    // Apply type filtering
    if (type === 'live') {
      rawStreamiMatches = rawStreamiMatches.filter((match: any) => {
        const key = getMatchKey(match);
        const existsInOther = transformedMatches.some(m => getMatchKey(m) === key) ||
                              timStreamsMatches.some(m => getMatchKey(m) === key);
        return match.isLive || existsInOther;
      });
    } else if (type === 'popular') {
      rawStreamiMatches = rawStreamiMatches.filter((match: any) => match.popular);
    }

    // Apply sport filtering
    if (sport === '4k') {
      rawStreamiMatches = rawStreamiMatches.filter((match: any) => match.is4k);
    } else if (sport !== 'all') {
      rawStreamiMatches = rawStreamiMatches.filter((match: any) => matchesSportFilter(match.category, sport));
    }

    streamiMatches = rawStreamiMatches;
  } catch (error) {
    console.error('Streami sports API error:', error);
  }

  // 3b. Fetch xyzstreams events
  let xyzMatches: any[] = [];
  try {
    const xyzEvents = await fetchXyzEvents();
    let rawXyzMatches = xyzEvents.map((event) => {
      const dateMs = new Date(event.start).getTime();
      const endMs = new Date(event.end).getTime();
      const isLive = Date.now() >= (dateMs - 30 * 60 * 1000) && Date.now() <= endMs;
      
      const cleanTitle = event.title.replace(/^FIFA\s+WC\s+\d+™\s*-\s*/i, '');
      const normalizedCat = normalizeSportCategory(event.category, cleanTitle);
      let teams: any = undefined;
      const vsMatch = cleanTitle.match(/^(.+?)\s*[-–vs.]+\s*(.+)$/i);
      if (vsMatch) {
        teams = {
          home: { name: vsMatch[1].trim() },
          away: { name: vsMatch[2].trim() },
        };
      }

      const is4k = cleanTitle.toLowerCase().includes('4k') || 
                   cleanTitle.toLowerCase().includes('uhd') || 
                   cleanTitle.toLowerCase().includes('wc') || 
                   cleanTitle.toLowerCase().includes('fifa');

      return {
        id: `xyz-${event.href}-${dateMs}`,
        title: cleanTitle,
        category: normalizedCat,
        date: dateMs,
        poster: event.bg || null,
        popular: event.category === 'Football' || event.category === 'Combat Sports',
        teams,
        sources: [{ source: 'xyzstreams', id: event.href }],
        isLive,
        is4k
      };
    });

    // Apply type filtering
    if (type === 'live') {
      rawXyzMatches = rawXyzMatches.filter((match: any) => {
        const key = getMatchKey(match);
        const existsInOther = transformedMatches.some(m => getMatchKey(m) === key) ||
                              timStreamsMatches.some(m => getMatchKey(m) === key) ||
                              streamiMatches.some(m => getMatchKey(m) === key);
        return match.isLive || existsInOther;
      });
    } else if (type === 'popular') {
      rawXyzMatches = rawXyzMatches.filter((match: any) => match.popular);
    }

    // Apply sport filtering
    if (sport === '4k') {
      rawXyzMatches = rawXyzMatches.filter((match: any) => match.is4k);
    } else if (sport !== 'all') {
      rawXyzMatches = rawXyzMatches.filter((match: any) => matchesSportFilter(match.category, sport));
    }

    xyzMatches = rawXyzMatches;
  } catch (error) {
    console.error('xyzstreams sports API error:', error);
  }

  // 4. Group and merge duplicate matches
  const groupedMap = new Map<string, any>();
  
  for (const match of transformedMatches) {
    const key = getMatchKey(match);
    groupedMap.set(key, match);
  }
  
  for (const match of timStreamsMatches) {
    const key = getMatchKey(match);
    const existing = groupedMap.get(key);
    if (existing) {
      const existingSrcs = existing.sources || [];
      const newSrcs = match.sources || [];
      existing.sources = [...existingSrcs, ...newSrcs.filter((ns: any) => !existingSrcs.some((es: any) => es.source === ns.source && es.id === ns.id))];
      if (!existing.poster) existing.poster = match.poster;
      if (match.is4k) existing.is4k = true;
      if (match.isLive) existing.isLive = true;
      if (!existing.teams && match.teams) existing.teams = match.teams;
    } else {
      groupedMap.set(key, match);
    }
  }

  for (const match of streamiMatches) {
    const key = getMatchKey(match);
    const existing = groupedMap.get(key);
    if (existing) {
      const existingSrcs = existing.sources || [];
      const newSrcs = match.sources || [];
      existing.sources = [...existingSrcs, ...newSrcs.filter((ns: any) => !existingSrcs.some((es: any) => es.source === ns.source && es.id === ns.id))];
      if (match.is4k) existing.is4k = true;
      if (match.isLive) existing.isLive = true;
      if (!existing.teams && match.teams) existing.teams = match.teams;
    } else {
      groupedMap.set(key, match);
    }
  }

  for (const match of xyzMatches) {
    const key = getMatchKey(match);
    const existing = groupedMap.get(key);
    if (existing) {
      const existingSrcs = existing.sources || [];
      const newSrcs = match.sources || [];
      existing.sources = [...existingSrcs, ...newSrcs.filter((ns: any) => !existingSrcs.some((es: any) => es.source === ns.source && es.id === ns.id))];
      if (match.is4k) existing.is4k = true;
      if (match.isLive) existing.isLive = true;
      if (!existing.teams && match.teams) existing.teams = match.teams;
    } else {
      groupedMap.set(key, match);
    }
  }
  
  let combinedMatches = Array.from(groupedMap.values());
  combinedMatches.forEach(enrichMatchPosterAndBadges);

  // Apply optional search query
  if (query) {
    combinedMatches = combinedMatches.filter((m: any) => {
      const titleMatch = m.title?.toLowerCase().includes(query);
      const homeMatch = m.teams?.home?.name?.toLowerCase().includes(query);
      const awayMatch = m.teams?.away?.name?.toLowerCase().includes(query);
      const catMatch = m.category?.toLowerCase().includes(query);
      return titleMatch || homeMatch || awayMatch || catMatch;
    });
  }

  // Sort combined matches: live first, then by date ascending
  combinedMatches.sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return a.date - b.date;
  });

  return NextResponse.json({ matches: combinedMatches });
}

