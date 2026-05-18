import { NextResponse } from 'next/server';
import { apiErrorResponse, readJsonObject, rateLimit } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Simple PIN-based login
export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'auth-login', { windowMs: 5 * 60 * 1000, max: 10 });
    if (limited) return limited;

    const { pin } = await readJsonObject(req, 1024);
    const expectedPin = process.env.APP_PIN || '1234';

    if (typeof pin === 'string' && pin.length <= 64 && pin === expectedPin) {
      // Set cookie for session
      const response = NextResponse.json({ success: true });
      const isHttps = new URL(req.url).protocol === 'https:';
      response.cookies.set('app-pin', pin, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax', // Changed from strict to work across IP addresses
        path: '/', // Ensure cookie is available site-wide
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });
      return response;
    }

    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  } catch (e) {
    console.error('Login error:', e);
    return apiErrorResponse(e, 'Login failed');
  }
}

// Check if user is logged in
export async function GET() {
  // This endpoint should be protected by middleware
  // If we reach here, user is authenticated
  return NextResponse.json({ authenticated: true });
}
