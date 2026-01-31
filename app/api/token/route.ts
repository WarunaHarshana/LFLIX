import { NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '@/lib/db';

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

    if (!contentType || !contentId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Generate a random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token with 24 hour expiry (enough for any movie + multiple sessions)
    // This is safe for home network use
    tokens.set(token, {
      contentType,
      contentId,
      episodeId,
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    return NextResponse.json({ token });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
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
