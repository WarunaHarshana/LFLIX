import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple PIN authentication middleware
export function middleware(request: NextRequest) {
  // Skip auth for setup, browse, login, and static files (browse needed during setup)
  if (request.nextUrl.pathname === '/api/setup' ||
      request.nextUrl.pathname.startsWith('/api/browse') ||
      request.nextUrl.pathname === '/api/auth/login' || 
      request.nextUrl.pathname.startsWith('/_next/') ||
      request.nextUrl.pathname.startsWith('/api/') === false) {
    return NextResponse.next();
  }

  // Get PIN from header
  const pin = request.headers.get('x-app-pin') || request.cookies.get('app-pin')?.value;
  const expectedPin = process.env.APP_PIN || '1234';

  // Skip auth if no PIN is set (development mode)
  if (!expectedPin || expectedPin === '1234') {
    return NextResponse.next();
  }

  // Check PIN
  if (pin !== expectedPin) {
    return NextResponse.json(
      { error: 'Unauthorized. Please provide valid PIN.' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};
