import { NextResponse } from 'next/server';
import { torrentStreamManager } from '@/lib/torrentStreamer';
import { apiErrorResponse, rateLimit } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const limited = rateLimit(req, 'torrent-cache-stats', { windowMs: 60 * 1000, max: 60 });
    if (limited) return limited;

    const stats = torrentStreamManager.getCacheStats();
    return NextResponse.json({ success: true, ...stats });
  } catch (err: unknown) {
    return apiErrorResponse(err, 'Failed to retrieve torrent stream cache stats');
  }
}

export async function DELETE(req: Request) {
  try {
    const limited = rateLimit(req, 'torrent-cache-clear', { windowMs: 60 * 1000, max: 10 });
    if (limited) return limited;

    const result = await torrentStreamManager.clearAllCache();
    return NextResponse.json(result);
  } catch (err: unknown) {
    return apiErrorResponse(err, 'Failed to clear torrent stream cache');
  }
}
