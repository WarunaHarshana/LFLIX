import { NextResponse } from 'next/server';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

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

export async function GET() {
  const sports: SportCategory[] = Object.entries(CANONICAL_SPORTS)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, meta]) => ({
      id,
      name: meta.name,
    }));

  return NextResponse.json({ sports });
}
