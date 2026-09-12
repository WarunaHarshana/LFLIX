import { NextResponse } from 'next/server';
import { rescanLibrary } from '@/lib/scanner';
import { apiErrorResponse } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await rescanLibrary();
    return NextResponse.json(result);
  } catch (e) {
    console.error('Rescan error:', e);
    return apiErrorResponse(e);
  }
}

