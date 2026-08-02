import { NextResponse } from 'next/server';
import { parsePositiveInt } from '@/lib/security';
import { apiErrorResponse, rateLimit, readJsonObject } from '@/lib/apiSecurity';
import { createStreamToken } from '@/lib/streamTokens';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // Each call persists a 24h row; cap the mint rate.
    const limited = rateLimit(req, 'token', { windowMs: 60 * 1000, max: 60 });
    if (limited) return limited;

    const { contentType, contentId, episodeId } = await readJsonObject(req, 8 * 1024);
    const parsedContentId = parsePositiveInt(contentId);
    const parsedEpisodeId = episodeId ? parsePositiveInt(episodeId) ?? undefined : undefined;

    if ((contentType !== 'movie' && contentType !== 'show') || !parsedContentId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    if (episodeId && !parsedEpisodeId) {
      return NextResponse.json({ error: 'Invalid episodeId' }, { status: 400 });
    }

    // 24 hours is enough for any film plus a few resumed sessions.
    const token = createStreamToken({
      contentType,
      contentId: parsedContentId,
      episodeId: parsedEpisodeId,
    });

    return NextResponse.json({ token });
  } catch (e) {
    return apiErrorResponse(e, 'Failed to create stream token');
  }
}
