import { NextResponse } from 'next/server';
import { startDlnaServer, stopDlnaServer, getDlnaStatus, getDlnaIp, DLNA_PORT } from '@/lib/dlna';
import { apiErrorResponse } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await startDlnaServer();
    const ip = getDlnaIp();
    return NextResponse.json({ 
      success: true, 
      running: true,
      url: `http://${ip}:${DLNA_PORT}`,
      message: 'DLNA server started. If VLC does not see it, check Windows Firewall.',
      troubleshooting: [
        'Make sure Windows Firewall allows port 3001 and UDP port 1900',
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
  const ip = getDlnaIp();
  return NextResponse.json({ 
    running,
    url: running ? `http://${ip}:${DLNA_PORT}` : null,
    ip: running ? ip : null,
    port: DLNA_PORT,
    status: running ? `DLNA server is running on http://${ip}:${DLNA_PORT}` : 'DLNA server is stopped'
  });
}
