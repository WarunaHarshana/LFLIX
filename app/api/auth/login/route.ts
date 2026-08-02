import { NextResponse } from 'next/server';
import { apiErrorResponse, readJsonObject, rateLimit } from '@/lib/apiSecurity';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionValue,
  getConfiguredPin,
  sessionCookieOptions,
  verifyPin,
} from '@/lib/session';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// PIN login. On success the client gets a signed session cookie — the PIN
// itself is never stored in a cookie.
export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-login', { windowMs: 5 * 60 * 1000, max: 10 });
    if (limited) return limited;

    if (!getConfiguredPin()) {
      return NextResponse.json(
        { error: 'No PIN configured. Set APP_PIN in .env.local, then restart.' },
        { status: 503 }
      );
    }

    const { pin } = await readJsonObject(req, 1024);

    if (!verifyPin(pin)) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    const sessionValue = await createSessionValue();
    if (!sessionValue) {
      return NextResponse.json({ error: 'Could not start a session' }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });
    const isHttps = new URL(req.url).protocol === 'https:';
    response.cookies.set(SESSION_COOKIE, sessionValue, {
      ...sessionCookieOptions(isHttps),
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return response;
  } catch (e) {
    console.error('Login error:', e);
    return apiErrorResponse(e, 'Login failed');
  }
}

// Reaching this means middleware already validated the session.
export async function GET() {
  return NextResponse.json({ authenticated: true });
}
