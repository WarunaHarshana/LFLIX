import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSafeErrorMessage, parsePositiveInt } from '@/lib/security';

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
    const { contentType, contentId, episodeId } = await req.json();
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
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
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
