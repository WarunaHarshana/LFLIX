import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const response = NextResponse.json({ success: true });
  const isHttps = new URL(req.url).protocol === 'https:';

  // Expire the session cookie.
  response.cookies.set(SESSION_COOKIE, '', {
    ...sessionCookieOptions(isHttps),
    maxAge: 0,
  });

  // Also clear the pre-hardening cookie, which held the PIN in plain text, so
  // upgrading installs do not leave it sitting in the browser.
  response.cookies.set('app-pin', '', {
    ...sessionCookieOptions(isHttps),
    maxAge: 0,
  });

  return response;
}
