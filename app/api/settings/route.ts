import { NextResponse } from 'next/server';
import path from 'path';
import db from '@/lib/db';
import { validateExistingDirectory, validatePlayerExecutable } from '@/lib/security';
import { apiErrorResponse, readJsonObject } from '@/lib/apiSecurity';
import { isTmdbConfigured } from '@/lib/metadata';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Valid setting keys to prevent injection
const VALID_SETTINGS = [
    'vlcPath', 'tmdbApiKey', 'omdbApiKey', 'downloadPath', 'autoOrganize',
    'gdriveEnabled', 'gdriveRemote', 'gdriveBasePath', 'gdriveTempPath', 'gdriveMountPath', 'gdriveMountDrive',
    'cloudEnabled', 'cloudProvider', 'cloudWorkerUrl', 'cloudWorkerToken', 'gdriveDownloadMode',
    'autoDownloadTarget',
];

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

        // Default autoOrganize to 'true' if not set
        if (settingsObj.autoOrganize === undefined) {
            settingsObj.autoOrganize = 'true';
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

        // Create gdriveTempPath if it doesn't exist (unlike downloadPath, it's OK to create)
        if (settings.gdriveTempPath) {
            const tempPath = String(settings.gdriveTempPath).trim();
            if (!path.isAbsolute(tempPath)) {
                return NextResponse.json({ error: 'Torrent temp path must be absolute' }, { status: 400 });
            }
            try {
                const fs = await import('fs');
                if (!fs.existsSync(tempPath)) {
                    fs.mkdirSync(tempPath, { recursive: true });
                }
            } catch (e: any) {
                return NextResponse.json({ error: `Cannot create temp path: ${e.message}` }, { status: 400 });
            }
        }

        const updateSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

        for (const [key, value] of Object.entries(settings)) {
            if (typeof value === 'string') {
                updateSetting.run(key, value);
            } else if (typeof value === 'boolean') {
                updateSetting.run(key, value ? 'true' : 'false');
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return apiErrorResponse(e, 'Settings request failed');
    }
}
