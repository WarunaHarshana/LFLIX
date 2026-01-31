import { NextResponse } from 'next/server';
import { startDlnaServer, stopDlnaServer, getDlnaStatus } from '@/lib/dlna';

export async function POST() {
  try {
    await startDlnaServer();
    return NextResponse.json({ 
      success: true, 
      running: true,
      message: 'DLNA server started. VLC should discover "LocalFlix" in 10-30 seconds.'
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  const running = getDlnaStatus();
  return NextResponse.json({ 
    running,
    status: running ? 'DLNA server is running' : 'DLNA server is stopped'
  });
}
