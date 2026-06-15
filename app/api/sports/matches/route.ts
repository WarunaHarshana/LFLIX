import { NextResponse } from 'next/server';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Streamed.pk API integration for live sports
const API_BASE = 'https://streamed.pk/api';

function parseTimStreamsTimeToUTC(dateStr: string): number {
  if (!dateStr) return 0;
  // normalize format to YYYY-MM-DDTHH:mm:ss
  const normalized = dateStr.trim().replace(' ', 'T');
  try {
    return new Date(normalized + 'Z').getTime() || Date.parse(normalized) || Date.now();
  } catch (e) {
    return new Date(normalized).getTime() || Date.now();
  }
}

function getMatchKey(match: any): string {
  if (match.teams?.home?.name && match.teams?.away?.name) {
    const t1 = match.teams.home.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const t2 = match.teams.away.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [t1, t2].sort().join('-vs-');
  }
  const vsMatch = match.title.match(/(.+)\s+vs\s+(.+)/i);
  if (vsMatch) {
    const t1 = vsMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    const t2 = vsMatch[2].toLowerCase().replace(/[^a-z0-9]/g, '');
    return [t1, t2].sort().join('-vs-');
  }
  return match.title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'live';
  const sport = searchParams.get('sport') || 'all';

  let transformedMatches: any[] = [];
  let timStreamsMatches: any[] = [];

  // 1. Fetch streamed.pk matches
  try {
    let url: string;
    
    switch (type) {
      case 'live':
        url = sport === 'all' 
          ? `${API_BASE}/matches/live` 
          : `${API_BASE}/matches/${sport}`;
        break;
      case 'today':
        url = `${API_BASE}/matches/all-today`;
        break;
      case 'popular':
        url = `${API_BASE}/matches/live/popular`;
        break;
      default:
        url = `${API_BASE}/matches/live`;
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (response.ok) {
      const matches = await response.json();
      transformedMatches = matches.map((match: any) => ({
        id: match.id,
        title: match.title,
        category: match.category,
        date: match.date,
        poster: match.poster ? `${API_BASE}/images/${match.poster}` : null,
        popular: match.popular,
        teams: match.teams,
        sources: match.sources,
        isLive: type === 'live' || new Date(match.date).getTime() <= Date.now()
      }));
    }
  } catch (error) {
    console.error('Sports API error:', error);
  }

  // 2. Fetch TimStreams matches
  try {
    const tsResponse = await fetch('https://api.nuevasantino.xyz/api/live-upcoming', {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 60 } // Cache for 60 seconds
    });
    
    if (tsResponse.ok) {
      const tsData = await tsResponse.json();
      if (tsData.events && Array.isArray(tsData.events)) {
        const tsGenres = tsData.genres || {};
        
        let rawMatches = tsData.events.map((event: any) => {
          const dateMs = parseTimStreamsTimeToUTC(event.time);
          const isLive = Date.now() >= (dateMs - 30 * 60 * 1000); // 30 minutes pre-kickoff window
          const has4k = event.streams && event.streams.some((s: any) => 
            s.name && (s.name.toLowerCase().includes('4k') || s.name.toLowerCase().includes('uhd'))
          );
          
          return {
            id: `tim-${event.url}`,
            title: event.name,
            category: tsGenres[event.genre] || 'Others',
            date: dateMs,
            poster: event.logo || null,
            popular: !!event.featured,
            sources: [{ source: 'timstreams', id: event.url }],
            isLive: isLive,
            is4k: has4k
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
          rawMatches = rawMatches.filter((match: any) => {
            const categoryLower = match.category.toLowerCase();
            const sportLower = sport.toLowerCase();
            
            if (sportLower === 'football') {
              return categoryLower.includes('soccer') || categoryLower.includes('football');
            }
            if (sportLower === 'mma') {
              return categoryLower.includes('mma') || categoryLower.includes('combat') || categoryLower.includes('wrestling') || categoryLower.includes('ufc');
            }
            if (sportLower === 'formula1') {
              return categoryLower.includes('motor') || categoryLower.includes('race') || categoryLower.includes('formula');
            }
            return categoryLower.includes(sportLower);
          });
        }

        timStreamsMatches = rawMatches;
      }
    }
  } catch (error) {
    console.error('TimStreams sports API error:', error);
  }

  // 3. Group and merge duplicate matches
  const groupedMap = new Map<string, any>();
  
  for (const match of transformedMatches) {
    const key = getMatchKey(match);
    groupedMap.set(key, match);
  }
  
  for (const match of timStreamsMatches) {
    const key = getMatchKey(match);
    const existing = groupedMap.get(key);
    if (existing) {
      // Merge unique sources
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
  
  const combinedMatches = Array.from(groupedMap.values());

  // Sort combined matches: live first, then by date ascending
  combinedMatches.sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return a.date - b.date;
  });

  return NextResponse.json({ matches: combinedMatches });
}
