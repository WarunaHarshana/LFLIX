import { NextResponse } from 'next/server';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Streamed.pk API integration for live sports
const API_BASE = 'https://streamed.pk/api';

function parseEasternTimeToUTC(dateStr: string): number {
  if (!dateStr) return 0;
  // normalize format to YYYY-MM-DDTHH:mm:ss
  const normalized = dateStr.trim().replace(' ', 'T');
  try {
    const tzDate = new Date(normalized + 'Z');
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(tzDate);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    
    const formattedDate = new Date(Date.UTC(
      parseInt(partMap.year),
      parseInt(partMap.month) - 1,
      parseInt(partMap.day),
      parseInt(partMap.hour),
      parseInt(partMap.minute),
      parseInt(partMap.second || '0')
    ));
    
    const diff = tzDate.getTime() - formattedDate.getTime();
    return tzDate.getTime() + diff;
  } catch (e) {
    return new Date(normalized).getTime() || Date.now();
  }
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
          const dateMs = parseEasternTimeToUTC(event.time);
          const isLive = Date.now() >= dateMs;
          
          return {
            id: `tim-${event.url}`,
            title: event.name,
            category: tsGenres[event.genre] || 'Others',
            date: dateMs,
            poster: event.logo || null,
            popular: !!event.featured,
            sources: [{ source: 'timstreams', id: event.url }],
            isLive: isLive
          };
        });

        // Apply type filtering
        if (type === 'live') {
          rawMatches = rawMatches.filter((match: any) => match.isLive);
        } else if (type === 'popular') {
          rawMatches = rawMatches.filter((match: any) => match.popular);
        }

        // Apply sport filtering
        if (sport !== 'all') {
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

  const combinedMatches = [...transformedMatches, ...timStreamsMatches];

  // Sort combined matches: live first, then by date ascending
  combinedMatches.sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return a.date - b.date;
  });

  return NextResponse.json({ matches: combinedMatches });
}
