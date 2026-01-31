import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Get the origin for CORS
  const origin = request.headers.get('origin') || '*';
  
  // Create base response
  const response = NextResponse.next();
  
  // Set CORS headers for all requests
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-app-pin');
  
  // Handle preflight
  if (request.method === 'OPTIONS') {
    return response;
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

    // Skip auth if PIN is default (setup mode)
    if (expectedPin === '1234') {
      return response;
    }

    // Validate PIN
    if (!pin || pin !== expectedPin) {
      console.log('Auth failed:', { hasPin: !!pin, expectedPin });
      return NextResponse.json(
        { error: 'Unauthorized. Please provide valid PIN.' },
        { 
          status: 401,
          headers: {
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Origin': origin
          }
        }
      );
    }
    
    console.log('Auth success');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
