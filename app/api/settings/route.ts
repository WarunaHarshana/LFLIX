import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Valid setting keys to prevent injection
const VALID_SETTINGS = ['vlcPath', 'tmdbApiKey'];

// Validate VLC path exists
function validateVlcPath(path: string): { valid: boolean; error?: string } {
  if (!path) {
    return { valid: false, error: 'VLC path is required' };
  }
  
  if (!fs.existsSync(path)) {
    return { valid: false, error: `VLC not found at: ${path}. Please check the path.` };
  }
  
  // Check if it's actually vlc.exe
  if (!path.toLowerCase().includes('vlc')) {
    console.warn(`Warning: VLC path "${path}" doesn't contain "vlc" in filename`);
  }
  
  return { valid: true };
}

// Get all settings
export async function GET() {
    try {
        const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];

        const settingsObj: Record<string, string> = {};
        for (const s of settings) {
            settingsObj[s.key] = s.value;
        }

        // Validate current VLC path and add warning if invalid
        if (settingsObj.vlcPath) {
            const validation = validateVlcPath(settingsObj.vlcPath);
            if (!validation.valid) {
                (settingsObj as any).vlcPathError = validation.error;
            }
        }

        return NextResponse.json(settingsObj);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// Update settings
export async function POST(req: Request) {
    try {
        const settings = await req.json();

        // Validate setting keys
        for (const key of Object.keys(settings)) {
            if (!VALID_SETTINGS.includes(key)) {
                return NextResponse.json({ error: `Invalid setting key: ${key}` }, { status: 400 });
            }
        }

        // Validate VLC path if being updated
        if (settings.vlcPath) {
            const validation = validateVlcPath(settings.vlcPath);
            if (!validation.valid) {
                return NextResponse.json({ error: validation.error }, { status: 400 });
            }
        }

        const updateSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

        for (const [key, value] of Object.entries(settings)) {
            if (typeof value === 'string') {
                updateSetting.run(key, value);
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
