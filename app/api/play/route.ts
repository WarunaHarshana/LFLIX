import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import db from '@/lib/db';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Get player path from settings
function getPlayerPath(): string {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('vlcPath') as { value: string } | undefined;
    return setting?.value || 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
  } catch {
    return 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
  }
}

// Detect player type from executable path
type PlayerType = 'vlc' | 'potplayer' | 'mpc' | 'mpv' | 'generic';

function detectPlayerType(exePath: string): PlayerType {
  const lowerPath = exePath.toLowerCase();
  if (lowerPath.includes('vlc')) return 'vlc';
  if (lowerPath.includes('potplayer') || lowerPath.includes('potpayer')) return 'potplayer';
  if (lowerPath.includes('mpc-hc') || lowerPath.includes('mpc-be') || lowerPath.includes('mpc64')) return 'mpc';
  if (lowerPath.includes('mpv')) return 'mpv';
  return 'generic';
}

// Build player-specific arguments
function buildPlayerArgs(playerType: PlayerType, filePath: string, startTime?: number): string[] {
  switch (playerType) {
    case 'vlc': {
      const args = ['--fullscreen'];
      if (startTime && startTime > 0) {
        args.push(`--start-time=${Math.floor(startTime)}`);
      }
      args.push(filePath);
      return args;
    }
    case 'potplayer': {
      // PotPlayer uses /fullscreen and file path first, no VLC-style -- flags
      const args = [filePath];
      if (startTime && startTime > 0) {
        // PotPlayer seek uses /seek=HH:MM:SS format
        const h = Math.floor(startTime / 3600);
        const m = Math.floor((startTime % 3600) / 60);
        const s = Math.floor(startTime % 60);
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        args.push(`/seek=${timeStr}`);
      }
      return args;
    }
    case 'mpc': {
      // MPC-HC / MPC-BE uses /fullscreen and /start in milliseconds
      const args = [filePath, '/fullscreen'];
      if (startTime && startTime > 0) {
        args.push('/start', String(Math.floor(startTime * 1000)));
      }
      return args;
    }
    case 'mpv': {
      const args = ['--fullscreen'];
      if (startTime && startTime > 0) {
        args.push(`--start=${Math.floor(startTime)}`);
      }
      args.push(filePath);
      return args;
    }
    default: {
      // Generic: just pass the file path, no extra flags
      return [filePath];
    }
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

    const playerPath = getPlayerPath();

    if (!fs.existsSync(playerPath)) {
      return NextResponse.json({
        error: `Player not found at: ${playerPath}. Please update the player path in Settings.`
      }, { status: 500 });
    }

    // Detect player type and build appropriate arguments
    const playerType = detectPlayerType(playerPath);
    const playerArgs = buildPlayerArgs(playerType, normalizedPath, startTime);

    // Spawn player detached so it doesn't block the server
    const child = spawn(playerPath, playerArgs, {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    const playerNames: Record<PlayerType, string> = {
      vlc: 'VLC',
      potplayer: 'PotPlayer',
      mpc: 'MPC',
      mpv: 'mpv',
      generic: 'Player'
    };

    return NextResponse.json({ success: true, message: `${playerNames[playerType]} Launched` });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
