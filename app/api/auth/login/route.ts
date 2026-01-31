import { NextResponse } from 'next/server';

// Simple PIN-based login
export async function POST(req: Request) {
  try {
    const { pin } = await req.json();
    const expectedPin = process.env.APP_PIN || '1234';

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
      return response;
    }

    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Check if user is logged in
export async function GET() {
  // Middleware handles the actual check, this just returns success
  return NextResponse.json({ authenticated: true });
}
