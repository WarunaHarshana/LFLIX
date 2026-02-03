import { NextResponse } from 'next/server';
import { iptvDb } from '@/lib/db';

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
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const result = iptvDb.addCategory(name);
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Failed to add category:', error);
    return NextResponse.json({ error: 'Failed to add category' }, { status: 500 });
  }
}
