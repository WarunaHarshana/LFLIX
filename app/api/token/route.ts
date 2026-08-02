import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { parsePositiveInt } from '@/lib/security';
import { apiErrorResponse, rateLimit, readJsonObject } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Simple in-memory token store (tokens expire after 1 hour)
const tokens = new Map<string, { contentType: string; contentId: number; episodeId?: number; expires: number }>();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokens.entries()) {
    if (data.expires < now) {
      tokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

export async function POST(req: Request) {
  try {
    // Each call adds a 24h entry to an in-memory map; cap the mint rate so it
    // cannot be inflated indefinitely.
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

    // Generate a random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token with 24 hour expiry (enough for any movie + multiple sessions)
    // This is safe for home network use
    tokens.set(token, {
      contentType,
      contentId: parsedContentId,
      episodeId: parsedEpisodeId,
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    return NextResponse.json({ token });
  } catch (e) {
    return apiErrorResponse(e, 'Failed to create stream token');
  }
}

// Verify token and return stream info
export function verifyToken(token: string): { contentType: string; contentId: number; episodeId?: number } | null {
  const data = tokens.get(token);
  if (!data || data.expires < Date.now()) {
    return null;
  }
  return data;
}
