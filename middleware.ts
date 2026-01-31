import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple PIN authentication middleware
export function middleware(request: NextRequest) {
  // Allow CORS for local network access
  const origin = request.headers.get('origin');
  const response = NextResponse.next();
  
  // Set CORS headers for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-app-pin');
    
    // Allow any origin on local network
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return response;
    }
  }

  // Skip auth for setup, browse, login, ping, and static files
  if (request.nextUrl.pathname === '/api/setup' ||
      request.nextUrl.pathname.startsWith('/api/browse') ||
      request.nextUrl.pathname === '/api/auth/login' ||
      request.nextUrl.pathname === '/api/ping' ||
      request.nextUrl.pathname.startsWith('/_next/') ||
      request.nextUrl.pathname.startsWith('/api/') === false) {
    return response;
  }

  // Get PIN from header or cookie
  const pin = request.headers.get('x-app-pin') || request.cookies.get('app-pin')?.value;
  const expectedPin = process.env.APP_PIN || '1234';

  // Skip auth if no PIN is set (development mode) - but only if PIN is still default
  if (expectedPin === '1234') {
    return response;
  }

  // Check PIN
  if (pin !== expectedPin) {
    response.headers.set('Content-Type', 'application/json');
    return NextResponse.json(
      { error: 'Unauthorized. Please provide valid PIN.' },
      { status: 401, headers: response.headers }
    );
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*']
};
