import { NextResponse } from 'next/server';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

const API_BASE = 'https://streamed.pk/api';

export type SportCategory = {
  id: string;
  name: string;
};

const CANONICAL_SPORTS: Record<string, { name: string; order: number }> = {
  football: { name: 'Football', order: 1 },
  basketball: { name: 'Basketball', order: 2 },
  fight: { name: 'MMA & Boxing', order: 3 },
  'motor-sports': { name: 'Motorsport & F1', order: 4 },
  tennis: { name: 'Tennis', order: 5 },
  'american-football': { name: 'American Football', order: 6 },
  baseball: { name: 'Baseball', order: 7 },
  hockey: { name: 'Ice Hockey', order: 8 },
  cricket: { name: 'Cricket', order: 9 },
  billiards: { name: 'Snooker & Pool', order: 10 },
  rugby: { name: 'Rugby & AFL', order: 11 },
  golf: { name: 'Golf', order: 12 },
  darts: { name: 'Darts', order: 13 },
  afl: { name: 'AFL', order: 14 },
  other: { name: 'Other Sports', order: 99 },
};

function enrichSportCategory(sport: { id: string; name?: string }): SportCategory {
  const key = sport.id.toLowerCase();
  const canonical = CANONICAL_SPORTS[key];

  return {
    id: sport.id,
    name: canonical?.name || sport.name || sport.id,
  };
}

export async function GET() {
  try {
    const response = await fetch(`${API_BASE}/sports`, {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const rawSports: Array<{ id: string; name?: string }> = await response.json();

    // Enrich with canonical labels
    const enriched = rawSports.map(enrichSportCategory);

    // Sort according to canonical ordering, then alphabetically
    enriched.sort((a, b) => {
      const orderA = CANONICAL_SPORTS[a.id.toLowerCase()]?.order ?? 50;
      const orderB = CANONICAL_SPORTS[b.id.toLowerCase()]?.order ?? 50;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ sports: enriched });
  } catch (error) {
    console.error('Sports categories API error:', error);

    // Fallback to complete canonical sports list
    const fallbackSports: SportCategory[] = Object.entries(CANONICAL_SPORTS)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([id, meta]) => ({
        id,
        name: meta.name,
      }));

    return NextResponse.json({ sports: fallbackSports });
  }
}
