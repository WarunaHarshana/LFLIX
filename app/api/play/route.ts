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

// SECURITY: Look up file path by ID instead of receiving it directly
function getFilePathById(contentType: 'movie' | 'episode', id: number): string | null {
  try {
    if (contentType === 'movie') {
      const result = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
      return result?.filePath || null;
    } else {
      const result = db.prepare('SELECT filePath FROM episodes WHERE id = ?').get(id) as { filePath: string } | undefined;
      return result?.filePath || null;
    }
  } catch {
    return null;
  }
}

// Validate ID is a positive integer
function validateId(id: any): id is number {
  return Number.isInteger(id) && id > 0;
}

export async function POST(req: Request) {
  try {
    const { contentType, contentId, episodeId, startTime } = await req.json();

    // SECURITY: Must provide contentType and ID, not filePath
    if (!contentType || !contentId) {
      return NextResponse.json({ error: 'Missing contentType or contentId' }, { status: 400 });
    }

    // Validate contentType
    if (contentType !== 'movie' && contentType !== 'show') {
      return NextResponse.json({ error: 'Invalid contentType. Must be movie or show' }, { status: 400 });
    }

    // Validate IDs are positive integers
    if (!validateId(contentId)) {
      return NextResponse.json({ error: 'Invalid contentId. Must be a positive integer' }, { status: 400 });
    }
    if (episodeId !== undefined && !validateId(episodeId)) {
      return NextResponse.json({ error: 'Invalid episodeId. Must be a positive integer' }, { status: 400 });
    }

    // Look up the actual file path from database
    const filePath = episodeId 
      ? getFilePathById('episode', episodeId)
      : getFilePathById(contentType === 'movie' ? 'movie' : 'episode', contentId);

    if (!filePath) {
      return NextResponse.json({ 
        error: 'Content not found in library',
        hint: 'The item may have been removed. Please refresh your library.'
      }, { status: 404 });
    }

    // Normalize the path for Windows
    const normalizedPath = filePath.replace(/\//g, '\\');

    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json({
        error: 'File not found on disk',
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
