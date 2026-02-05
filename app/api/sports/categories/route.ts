import { NextResponse } from 'next/server';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Get available sports categories
const API_BASE = 'https://streamed.pk/api';

export async function GET() {
  try {
    const response = await fetch(`${API_BASE}/sports`, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const sports = await response.json();
    return NextResponse.json({ sports });
  } catch (error) {
    console.error('Sports categories API error:', error);
    
    // Return default sports if API fails
    const defaultSports = [
      { id: 'football', name: 'Football', icon: '⚽' },
      { id: 'basketball', name: 'Basketball', icon: '🏀' },
      { id: 'tennis', name: 'Tennis', icon: '🎾' },
      { id: 'cricket', name: 'Cricket', icon: '🏏' },
      { id: 'boxing', name: 'Boxing', icon: '🥊' },
      { id: 'mma', name: 'MMA', icon: '🥋' },
      { id: 'formula1', name: 'Formula 1', icon: '🏎️' },
      { id: 'american-football', name: 'American Football', icon: '🏈' },
    ];
    
    return NextResponse.json({ sports: defaultSports });
  }
}
