import { NextResponse } from 'next/server';
import path from 'path';
import db from '@/lib/db';
import { validateExistingDirectory, validatePlayerExecutable } from '@/lib/security';
import { apiErrorResponse, readJsonObject } from '@/lib/apiSecurity';
import { isTmdbConfigured } from '@/lib/metadata';
import {
    findInstalledPlayers,
    isMpvConfigOptimized,
    getMpvConfigPath,
    deployMpvConfig,
    findMpvExecutable,
} from '@/lib/playerConfig';

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

        // Validate current VLC/Player path and add warning if invalid
        if (settingsObj.vlcPath) {
            const validation = validateVlcPath(settingsObj.vlcPath);
            if (!validation.valid) {
                (settingsObj as any).vlcPathError = validation.error;
            }
        }

        const detectedPlayers = findInstalledPlayers();
        const mpvOptimized = isMpvConfigOptimized();
        const mpvConfigPath = getMpvConfigPath();

        return NextResponse.json({
            ...settingsObj,
            tmdbConfigured: isTmdbConfigured(),
            detectedPlayers,
            mpvOptimized,
            mpvConfigPath,
        });
    } catch (e) {
        return apiErrorResponse(e, 'Settings request failed');
    }
}

// Update settings
export async function POST(req: Request) {
    try {
        const settings = await readJsonObject(req, 32 * 1024);

        // Action handler for MPV streaming config deployment
        if (settings.action === 'deploy-mpv-conf' || settings.action === 'setup-mpv') {
            const mpvExe = typeof settings.playerPath === 'string' && settings.playerPath
                ? settings.playerPath
                : findMpvExecutable();

            const deployRes = deployMpvConfig(mpvExe || undefined);
            if (mpvExe) {
                db.prepare(`
                    INSERT INTO settings (key, value) VALUES ('vlcPath', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                `).run(mpvExe);
            }
            return NextResponse.json({
                success: deployRes.success,
                message: deployRes.success
                    ? 'MPV streaming configuration deployed successfully!'
                    : (deployRes.error || 'Failed to deploy configuration'),
                mpvPath: mpvExe,
                configPath: deployRes.path,
            });
        }

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
            let val = value;
            if (typeof val === 'string' && (key === 'gdriveMountPath' || key === 'gdriveTempPath' || key === 'downloadPath')) {
                val = path.normalize(val.replace(/\\\\+/g, '\\'));
            }
            if (typeof val === 'string') {
                updateSetting.run(key, val);
            } else if (typeof val === 'boolean') {
                updateSetting.run(key, val ? 'true' : 'false');
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return apiErrorResponse(e, 'Settings request failed');
    }
}
