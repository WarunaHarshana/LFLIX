import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const movies = db.prepare('SELECT * FROM movies ORDER BY addedAt DESC').all();
    return NextResponse.json(movies);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
