import { NextResponse } from 'next/server';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Simple PIN-based login
export async function POST(req: Request) {
  try {
    const { pin } = await req.json();
    const expectedPin = process.env.APP_PIN || '1234';

    console.log('Login attempt:', { receivedPin: pin, expectedPin });

    if (pin === expectedPin) {
      // Set cookie for session
      const response = NextResponse.json({ success: true });
      response.cookies.set('app-pin', pin, {
        httpOnly: true,
        secure: false, // Allow HTTP for local network access
        sameSite: 'lax', // Changed from strict to work across IP addresses
        path: '/', // Ensure cookie is available site-wide
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });
      console.log('Login successful, cookie set');
      return response;
    }

    console.log('Login failed: PIN mismatch');
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  } catch (e: any) {
    console.error('Login error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Check if user is logged in
export async function GET(request: Request) {
  // This endpoint should be protected by middleware
  // If we reach here, user is authenticated
  const cookie = request.headers.get('cookie');
  console.log('GET /api/auth/login - Cookie header:', cookie ? 'present' : 'missing');
  return NextResponse.json({ authenticated: true });
}
