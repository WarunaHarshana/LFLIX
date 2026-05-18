import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALLOWED_CUSTOM_PROTOCOL_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
]);

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function getAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  if (ALLOWED_CUSTOM_PROTOCOL_ORIGINS.has(origin)) {
    return origin;
  }

  try {
    const originUrl = new URL(origin);
    const requestHost = request.nextUrl.hostname;

    if (originUrl.hostname === requestHost || isLocalHostname(originUrl.hostname)) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

function applySecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  return response;
}

export function middleware(request: NextRequest) {
  const allowedOrigin = getAllowedOrigin(request);

  // Create base response
  const response = applySecurityHeaders(NextResponse.next(), request);

  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Vary', 'Origin');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (request.method === 'OPTIONS') {
    if (request.headers.get('origin') && !allowedOrigin) {
      return applySecurityHeaders(new NextResponse(null, { status: 403 }), request);
    }
    return applySecurityHeaders(new NextResponse(null, { status: 204, headers: response.headers }), request);
  }

  // Skip auth for these paths
  const publicPaths = [
    '/api/setup',
    '/api/browse',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/ping'
  ];

  const isPublic = publicPaths.some(path =>
    request.nextUrl.pathname === path ||
    request.nextUrl.pathname.startsWith(path + '/')
  );

  if (isPublic || request.nextUrl.pathname.startsWith('/_next/')) {
    return response;
  }

  // Check authentication for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const pin = request.cookies.get('app-pin')?.value;
    const expectedPin = process.env.APP_PIN || '1234';

    // Skip auth if token is provided for stream/m3u8
    if (request.nextUrl.pathname.startsWith('/api/stream') && request.nextUrl.searchParams.has('token')) {
      return response;
    }

    // Validate PIN
    if (!pin || pin !== expectedPin) {
      return applySecurityHeaders(NextResponse.json(
        { error: 'Unauthorized. Please provide valid PIN.' },
        {
          status: 401,
          headers: {
            'Access-Control-Allow-Credentials': 'true',
            ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' } : {})
          }
        }
      ), request);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
