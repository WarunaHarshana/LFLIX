import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { validateExistingDirectory, validatePlayerExecutable } from '@/lib/security';
import { apiErrorResponse, readJsonObject } from '@/lib/apiSecurity';
import { isTmdbConfigured } from '@/lib/metadata';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Valid setting keys to prevent injection
const VALID_SETTINGS = ['vlcPath', 'tmdbApiKey', 'omdbApiKey', 'downloadPath'];

// Validate the configured player path points at a real, recognised player binary
const validateVlcPath = validatePlayerExecutable;

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

        return NextResponse.json({ ...settingsObj, tmdbConfigured: isTmdbConfigured() });
    } catch (e) {
        return apiErrorResponse(e, 'Settings request failed');
    }
}

// Update settings
export async function POST(req: Request) {
    try {
        const settings = await readJsonObject(req, 32 * 1024);

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

        if (settings.downloadPath) {
            const validation = validateExistingDirectory(settings.downloadPath);
            if (validation.error) {
                return NextResponse.json({ error: validation.error }, { status: 400 });
            }
            settings.downloadPath = validation.path;
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
    } catch (e) {
        return apiErrorResponse(e, 'Settings request failed');
    }
}
