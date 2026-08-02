import { NextResponse } from 'next/server';
import { startDlnaServer, stopDlnaServer, getDlnaStatus } from '@/lib/dlna';
import { apiErrorResponse } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await startDlnaServer();
    return NextResponse.json({ 
      success: true, 
      running: true,
      message: 'DLNA server started. If VLC does not see it, check Windows Firewall.',
      troubleshooting: [
        'Make sure Windows Firewall allows port 3001',
        'Make sure your phone and PC are on the same WiFi',
        'Some routers block DLNA - check router settings'
      ]
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function DELETE() {
  try {
    stopDlnaServer();
    return NextResponse.json({ 
      success: true, 
      running: false,
      message: 'DLNA server stopped' 
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function GET() {
  const running = getDlnaStatus();
  return NextResponse.json({ 
    running,
    url: running ? 'http://YOUR-PC-IP:3001' : null,
    status: running ? 'DLNA server is running on port 3001' : 'DLNA server is stopped'
  });
}
