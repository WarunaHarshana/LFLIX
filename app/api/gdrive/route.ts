/**
 * Google Drive API — status, test connection, setup, mount/unmount
 */

import { NextResponse } from 'next/server';
import { apiErrorResponse, readJsonObject } from '@/lib/apiSecurity';
import {
    getStatus,
    testConnection,
    setupFolders,
    mountDrive,
    unmountDrive,
    getDriveUsage,
    getGdriveConfig,
} from '@/lib/gdriveUploader';

export const dynamic = 'force-dynamic';

// GET — current GDrive status
export async function GET() {
    try {
        const status = await getStatus();
        const config = getGdriveConfig();
        const usage = status.connected ? await getDriveUsage() : null;

        return NextResponse.json({
            ...status,
            enabled: config.enabled,
            tempPath: config.tempPath,
            mountDrive: config.mountDrive,
            usage,
        });
    } catch (e) {
        return apiErrorResponse(e, 'GDrive status check failed');
    }
}

// POST — actions: test, setup, mount, unmount
export async function POST(req: Request) {
    try {
        const { action } = await readJsonObject(req, 4096);

        if (action === 'test') {
            const result = await testConnection();
            return NextResponse.json(result);
        }

        if (action === 'setup') {
            const result = await setupFolders();
            return NextResponse.json(result);
        }

        if (action === 'mount') {
            return new Promise<Response>((resolve) => {
                const timeout = setTimeout(() => {
                    resolve(NextResponse.json({ success: false, message: 'Mount timed out after 15s' }, { status: 504 }));
                }, 15000);

                mountDrive(
                    () => {
                        clearTimeout(timeout);
                        resolve(NextResponse.json({ success: true, message: 'Google Drive mounted' }));
                    },
                    (error) => {
                        clearTimeout(timeout);
                        resolve(NextResponse.json({ success: false, message: error }, { status: 500 }));
                    },
                );
            });
        }

        if (action === 'unmount') {
            const result = unmountDrive();
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Invalid action. Use: test, setup, mount, unmount' }, { status: 400 });
    } catch (e) {
        return apiErrorResponse(e, 'GDrive action failed');
    }
}
