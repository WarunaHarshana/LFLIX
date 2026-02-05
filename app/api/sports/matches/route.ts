import { NextResponse } from 'next/server';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Streamed.pk API integration for live sports
const API_BASE = 'https://streamed.pk/api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'live';
  const sport = searchParams.get('sport') || 'all';

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

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const matches = await response.json();
    
    // Transform data to match our format
    const transformedMatches = matches.map((match: any) => ({
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

    return NextResponse.json({ matches: transformedMatches });
  } catch (error) {
    console.error('Sports API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sports matches' },
      { status: 500 }
    );
  }
}
