import { NextResponse } from 'next/server';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

/**
 * Session probe used by the client on load to decide whether to show the
 * login screen.
 *
 * Deliberately *not* in the middleware `publicPaths` list: reaching this
 * handler at all means middleware validated the session cookie, so a 200 here
 * is proof of authentication and a 401 comes back otherwise. (`GET
 * /api/auth/login` cannot serve this purpose — that path is public so the POST
 * can work, which meant it always reported success.)
 */
export async function GET() {
  return NextResponse.json({ authenticated: true });
}
