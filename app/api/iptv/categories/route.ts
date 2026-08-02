import { NextResponse } from 'next/server';
import { iptvDb } from '@/lib/db';
import { readJsonObject } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const categories = iptvDb.getCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Failed to get categories:', error);
    return NextResponse.json({ error: 'Failed to get categories' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req);
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'Category name is too long' }, { status: 400 });
    }

    const result = iptvDb.addCategory(name);
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Failed to add category:', error);
    return NextResponse.json({ error: 'Failed to add category' }, { status: 500 });
  }
}
