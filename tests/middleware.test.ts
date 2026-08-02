import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { SESSION_COOKIE, createSessionValue } from '@/lib/session';

const PIN = '4321';

function req(
  pathname: string,
  init?: { session?: string; method?: string; origin?: string; host?: string }
) {
  const host = init?.host ?? 'localhost:3000';
  const request = new NextRequest(new URL(pathname, `http://${host}`), {
    method: init?.method ?? 'GET',
    headers: init?.origin ? { origin: init.origin } : {},
  });
  if (init?.session !== undefined) request.cookies.set(SESSION_COOKIE, init.session);
  return request;
}

/** Middleware returns NextResponse.next() (status 200) when it lets a request pass. */
function isAllowed(response: Response) {
  return response.status !== 401 && response.status !== 403;
}

async function validSession(): Promise<string> {
  return (await createSessionValue())!;
}

beforeEach(() => {
  process.env.APP_PIN = PIN;
});

describe('API authentication', () => {
  it('rejects an unauthenticated API request', async () => {
    expect((await middleware(req('/api/content'))).status).toBe(401);
  });

  it('rejects a forged session', async () => {
    expect((await middleware(req('/api/content', { session: 'forged.value' }))).status).toBe(401);
  });

  it('rejects the legacy plaintext PIN as a session value', async () => {
    expect((await middleware(req('/api/content', { session: PIN }))).status).toBe(401);
  });

  it('allows a valid session', async () => {
    expect(isAllowed(await middleware(req('/api/content', { session: await validSession() })))).toBe(true);
  });

  it('stops accepting a session after the PIN changes', async () => {
    const session = await validSession();
    process.env.APP_PIN = '9999';
    expect((await middleware(req('/api/content', { session }))).status).toBe(401);
  });

  it.each([
    '/api/play',
    '/api/settings',
    '/api/delete',
    '/api/scan',
    '/api/folders',
    '/api/downloads',
    '/api/watchlist',
  ])('guards %s', async (route) => {
    expect((await middleware(req(route))).status).toBe(401);
  });
});

describe('routes that must stay reachable', () => {
  it.each(['/api/auth/login', '/api/auth/logout', '/api/ping', '/api/sports/streams/resolve'])(
    'allows %s without a session',
    async (route) => expect(isAllowed(await middleware(req(route)))).toBe(true)
  );

  // /api/browse and /api/setup bypass middleware on purpose so the first-run
  // wizard can reach them; they enforce auth themselves via guardSetupRoute.
  it.each(['/api/browse', '/api/setup'])('lets %s through to its own in-route guard', async (route) => {
    expect(isAllowed(await middleware(req(route)))).toBe(true);
  });

  it('allows Next internals', async () => {
    expect(isAllowed(await middleware(req('/_next/static/chunk.js')))).toBe(true);
  });

  it('does not gate page routes behind the API check', async () => {
    expect(isAllowed(await middleware(req('/settings')))).toBe(true);
  });
});

describe('stream token bypass', () => {
  it('allows /api/stream when a token is supplied', async () => {
    expect(isAllowed(await middleware(req('/api/stream?token=abc')))).toBe(true);
  });

  it('rejects /api/stream with no token and no session', async () => {
    expect((await middleware(req('/api/stream'))).status).toBe(401);
  });
});

describe('security headers', () => {
  it('sets the baseline hardening headers', async () => {
    const headers = (await middleware(req('/api/ping'))).headers;
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('sets them on rejections too, not just successes', async () => {
    const response = await middleware(req('/api/content'));
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('CORS origin handling', () => {
  it('reflects a LAN origin', async () => {
    const response = await middleware(req('/api/ping', { origin: 'http://192.168.1.50:3000' }));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://192.168.1.50:3000');
  });

  it('reflects the Capacitor custom scheme', async () => {
    const response = await middleware(req('/api/ping', { origin: 'capacitor://localhost' }));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
  });

  it('does not reflect an arbitrary external origin', async () => {
    const response = await middleware(req('/api/ping', { origin: 'https://evil.example.com' }));
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects a preflight from an untrusted origin', async () => {
    const response = await middleware(
      req('/api/content', { method: 'OPTIONS', origin: 'https://evil.example.com' })
    );
    expect(response.status).toBe(403);
  });

  it('accepts a preflight from an allowed origin', async () => {
    const response = await middleware(
      req('/api/content', { method: 'OPTIONS', origin: 'http://192.168.1.50:3000' })
    );
    expect(response.status).toBe(204);
  });
});
