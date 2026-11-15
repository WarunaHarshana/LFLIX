import { NextResponse } from 'next/server';
import { fetchPpvEvents, mapPpvCategory, extractTeamsFromPpv, PpvItem } from '@/lib/ppv';
import { fetchStrmFreeStreams, mapStrmFreeCategory, extractTeamsFromStrmFree, StrmFreeStream } from '@/lib/strmfree';
import { fetchTimStreamsEvents, parseTimStreamsTimeToUTC, mapTimStreamsCategory, extractTeamsFromTitle, TIMSTREAMS_BASE, TimStreamsEvent } from '@/lib/timstreams';
import { fetchPitSportLiveNow, mapPitSportCategory, extractTeamsFromPitSport, PitSportProgramSummary } from '@/lib/pitsport';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export function normalizeSportCategory(category?: string | null, title?: string | null): string {
  const cat = (category || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();

  // 1. Tennis detection
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

  // 2. Billiards & Snooker
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
    cat === 'motogp' ||
    cat === 'nascar' ||
    cat === 'indycar' ||
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
    cat === 'american football' ||
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
  if (req === 'motor-sports' && ['motorsport', 'formula1', 'formula', 'f1', 'motogp', 'nascar', 'indycar'].includes(matchCat)) return true;
  if (['formula1', 'motorsport', 'formula', 'f1', 'motogp', 'nascar', 'indycar'].includes(req) && matchCat === 'motor-sports') return true;

  // Aliases for American Football
  if (req === 'american-football' && ['nfl', 'american football', 'americanfootball'].includes(matchCat)) return true;
  if (['nfl', 'american football', 'americanfootball'].includes(req) && matchCat === 'american-football') return true;

  // Aliases for Basketball
  if (req === 'basketball' && ['nba', 'wnba'].includes(matchCat)) return true;
  if (['nba', 'wnba'].includes(req) && matchCat === 'basketball') return true;

  // Aliases for Billiards / Snooker
  if (req === 'billiards' && ['snooker', 'pool'].includes(matchCat)) return true;
  if (['snooker', 'pool'].includes(req) && matchCat === 'billiards') return true;

  // Aliases for Rugby / AFL
  if (req === 'rugby' && matchCat === 'afl') return true;
  if (req === 'afl' && matchCat === 'rugby') return true;

  // Aliases for Football
  if (req === 'football' && ['soccer', 'futsal'].includes(matchCat)) return true;
  if (['soccer', 'futsal'].includes(req) && matchCat === 'football') return true;

  return false;
}

export function getMatchKey(match: any): string {
  if (match.teams?.home?.name && match.teams?.away?.name) {
    const t1 = match.teams.home.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const t2 = match.teams.away.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [t1, t2].sort().join('-vs-');
  }
  const vsMatch = (match.title || '').match(/(.+?)\s*(?:vs\.?|v\.|@|\sat\s|[-–])\s*(.+)/i);
  if (vsMatch) {
    const t1 = vsMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    const t2 = vsMatch[2].toLowerCase().replace(/[^a-z0-9]/g, '');
    return [t1, t2].sort().join('-vs-');
  }
  const cat = (match.category || 'other').toLowerCase();
  return `${cat}-${(match.title || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'live';
  const sport = searchParams.get('sport') || 'all';
  const query = searchParams.get('q')?.toLowerCase().trim();

  const now = Date.now();

  // Fetch all 4 providers in parallel with safe error isolation
  const [ppvResult, strmFreeResult, timStreamsResult, pitSportResult] = await Promise.allSettled([
    fetchPpvEvents(),
    fetchStrmFreeStreams(),
    fetchTimStreamsEvents(),
    fetchPitSportLiveNow()
  ]);

  const rawMatches: any[] = [];

  // 1. Process PPV.st events
  if (ppvResult.status === 'fulfilled' && Array.isArray(ppvResult.value)) {
    for (const item of ppvResult.value) {
      const dateMs = item.starts_at ? item.starts_at * 1000 : now;
      const endMs = item.ends_at ? item.ends_at * 1000 : dateMs + 3.5 * 3600 * 1000;
      const isLive = now >= dateMs - 20 * 60 * 1000 && now <= endMs;
      const mappedCategory = mapPpvCategory(item.category_name, item.name);
      const normalizedCat = normalizeSportCategory(mappedCategory, item.name);
      const teams = extractTeamsFromPpv(item.name);
      const sourceTag = (item.source_tag || item.tag || '').toUpperCase();
      const is4k = sourceTag.includes('4K') || sourceTag.includes('UHD');

      rawMatches.push({
        id: `ppv-${item.id}`,
        title: item.name,
        category: normalizedCat,
        date: dateMs,
        poster: item.poster || null,
        popular: Number(item.viewers || 0) > 20 || !!item.tag,
        teams,
        sources: [{ source: 'ppv', id: String(item.id) }],
        isLive,
        is4k
      });
    }
  } else if (ppvResult.status === 'rejected') {
    console.error('PPV.st fetch error:', ppvResult.reason);
  }

  // 2. Process StrmFree.pk events
  if (strmFreeResult.status === 'fulfilled' && Array.isArray(strmFreeResult.value)) {
    for (const stream of strmFreeResult.value) {
      const dateMs = stream.match_timestamp ? stream.match_timestamp * 1000 : now;
      const isLive = (now >= dateMs - 25 * 60 * 1000 && now <= dateMs + 3.5 * 3600 * 1000) ||
        (stream.sources && stream.sources.some(s => s.live));
      const mappedCategory = mapStrmFreeCategory(stream.category, stream.name);
      const normalizedCat = normalizeSportCategory(mappedCategory, stream.name);
      const teams = extractTeamsFromStrmFree(stream);
      const is4k = (stream.sources && stream.sources.some(s => s.quality?.toUpperCase().includes('4K'))) ||
        stream.name.toUpperCase().includes('4K');

      rawMatches.push({
        id: `strmfree-${stream.stream_key}`,
        title: stream.name,
        category: normalizedCat,
        date: dateMs,
        poster: stream.thumbnail_url || null,
        popular: !!stream.league,
        teams,
        sources: [{ source: 'strmfree', id: stream.stream_key }],
        isLive,
        is4k
      });
    }
  } else if (strmFreeResult.status === 'rejected') {
    console.error('StrmFree fetch error:', strmFreeResult.reason);
  }

  // 3. Process TimStreams events
  if (timStreamsResult.status === 'fulfilled' && timStreamsResult.value) {
    const { events, genres } = timStreamsResult.value;
    if (Array.isArray(events)) {
      for (const event of events) {
        const dateMs = parseTimStreamsTimeToUTC(event.time);
        const isLive = now >= dateMs - 30 * 60 * 1000 && now <= dateMs + 4 * 3600 * 1000;
        const genreName = genres[event.genre] || 'Others';
        const mappedCategory = mapTimStreamsCategory(event.genre, genres);
        const normalizedCat = normalizeSportCategory(mappedCategory === 'other' ? genreName : mappedCategory, event.name);
        const teams = extractTeamsFromTitle(event.name);
        const has4k = event.streams && event.streams.some(s =>
          s.name && (s.name.toUpperCase().includes('4K') || s.name.toUpperCase().includes('UHD'))
        );

        let poster = event.logo || null;
        if (poster && !poster.startsWith('http://') && !poster.startsWith('https://')) {
          poster = `${TIMSTREAMS_BASE}${poster.startsWith('/') ? '' : '/'}${poster}`;
        }

        rawMatches.push({
          id: `tim-${event.url}`,
          title: event.name,
          category: normalizedCat,
          date: dateMs,
          poster,
          popular: !!event.featured,
          teams,
          sources: [{ source: 'timstreams', id: event.url }],
          isLive,
          is4k: !!has4k
        });
      }
    }
  } else if (timStreamsResult.status === 'rejected') {
    console.error('TimStreams fetch error:', timStreamsResult.reason);
  }

  // 4. Process PitSport.st events
  if (pitSportResult.status === 'fulfilled' && pitSportResult.value) {
    const { live: psLive, upcoming: psUpcoming } = pitSportResult.value;
    const allPitPrograms = [...psLive, ...psUpcoming];

    for (const prog of allPitPrograms) {
      const dateMs = prog.sessionStart ? prog.sessionStart * 1000 : now;
      const isLive = prog.liveState === 'live' || (now >= dateMs - 15 * 60 * 1000 && now <= dateMs + 3.5 * 3600 * 1000);
      const mappedCategory = mapPitSportCategory(prog.footer || prog.competitionSlug, prog.titleText);
      const normalizedCat = normalizeSportCategory(mappedCategory, prog.titleText);
      const teams = extractTeamsFromPitSport(prog.titleText);
      const is4k = prog.titleText.toUpperCase().includes('4K') || prog.titleText.toUpperCase().includes('UHD');

      rawMatches.push({
        id: `pitsport-${prog.programId}`,
        title: prog.titleText,
        category: normalizedCat,
        date: dateMs,
        poster: prog.background || prog.logo || null,
        popular: mappedCategory === 'motor-sports' || mappedCategory === 'tennis',
        teams,
        sources: [{ source: 'pitsport', id: String(prog.programId) }],
        isLive,
        is4k
      });
    }
  } else if (pitSportResult.status === 'rejected') {
    console.error('PitSport fetch error:', pitSportResult.reason);
  }

  // Deduplicate and merge matches across all 4 providers
  const groupedMap = new Map<string, any>();

  for (const match of rawMatches) {
    const key = getMatchKey(match);
    const existing = groupedMap.get(key);

    if (existing) {
      // Merge sources without duplicates
      const existingSrcs = existing.sources || [];
      const newSrcs = match.sources || [];
      for (const ns of newSrcs) {
        if (!existingSrcs.some((es: any) => es.source === ns.source && es.id === ns.id)) {
          existingSrcs.push(ns);
        }
      }
      existing.sources = existingSrcs;

      // Enhance metadata
      if (!existing.poster && match.poster) existing.poster = match.poster;
      if (!existing.teams && match.teams) existing.teams = match.teams;
      if (match.is4k) existing.is4k = true;
      if (match.isLive) existing.isLive = true;
      if (match.popular) existing.popular = true;
      if (match.date && (!existing.date || match.date < existing.date)) {
        existing.date = match.date;
      }
    } else {
      groupedMap.set(key, { ...match });
    }
  }

  let combinedMatches = Array.from(groupedMap.values());

  // Apply type filtering
  if (type === 'live') {
    combinedMatches = combinedMatches.filter(m => m.isLive);
  } else if (type === 'popular') {
    combinedMatches = combinedMatches.filter(m => m.popular);
  } else if (type === 'today') {
    // Started in last 4 hours or starting in next 30 hours
    combinedMatches = combinedMatches.filter(m => {
      return m.date >= now - 4 * 3600 * 1000 && m.date <= now + 30 * 3600 * 1000;
    });
  }

  // Apply sport filtering
  if (sport === '4k') {
    combinedMatches = combinedMatches.filter(m => m.is4k);
  } else if (sport !== 'all') {
    combinedMatches = combinedMatches.filter(m => matchesSportFilter(m.category, sport));
  }

  // Apply search query
  if (query) {
    combinedMatches = combinedMatches.filter(m => {
      const titleMatch = m.title?.toLowerCase().includes(query);
      const homeMatch = m.teams?.home?.name?.toLowerCase().includes(query);
      const awayMatch = m.teams?.away?.name?.toLowerCase().includes(query);
      const catMatch = m.category?.toLowerCase().includes(query);
      return titleMatch || homeMatch || awayMatch || catMatch;
    });
  }

  // Sort matches: live first, then date ascending
  combinedMatches.sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return a.date - b.date;
  });

  return NextResponse.json({ matches: combinedMatches });
}
