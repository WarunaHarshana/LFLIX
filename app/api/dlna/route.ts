import { NextResponse } from 'next/server';
import { dlnaServer } from '@/lib/dlna';

export async function POST() {
  try {
    await dlnaServer.start();
    return NextResponse.json({ 
      success: true, 
      message: 'DLNA server started. VLC should now discover "LocalFlix Media Server" automatically.'
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    dlnaServer.stop();
    return NextResponse.json({ success: true, message: 'DLNA server stopped' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'DLNA server available. Use POST to start, DELETE to stop.'
  });
}
