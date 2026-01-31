import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import db from '@/lib/db';

// Get VLC path from settings
function getVlcPath(): string {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('vlcPath') as { value: string } | undefined;
    return setting?.value || 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
  } catch {
    return 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
  }
}

export async function POST(req: Request) {
  try {
    const { filePath, startTime } = await req.json();

    if (!filePath) {
      return NextResponse.json({ error: 'No file path provided' }, { status: 400 });
    }

    // Normalize the path for Windows
    const normalizedPath = filePath.replace(/\//g, '\\');

    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json({
        error: `File not found: ${normalizedPath}`,
        hint: 'The file may have been moved, renamed, or the drive is not connected.'
      }, { status: 404 });
    }

    const vlcPath = getVlcPath();

    if (!fs.existsSync(vlcPath)) {
      return NextResponse.json({
        error: `VLC not found at: ${vlcPath}. Please update the VLC path in Settings.`
      }, { status: 500 });
    }

    // Build VLC arguments
    const vlcArgs = ['--fullscreen'];

    // Add start time if provided (for resume functionality)
    if (startTime && startTime > 0) {
      vlcArgs.push(`--start-time=${Math.floor(startTime)}`);
    }

    vlcArgs.push(normalizedPath);

    // Spawn VLC detached so it doesn't block the server
    const child = spawn(vlcPath, vlcArgs, {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    return NextResponse.json({ success: true, message: 'VLC Launched' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
