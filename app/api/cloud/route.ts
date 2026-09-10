import { NextResponse } from 'next/server';
import { checkCloudStatus, getCloudConfig, syncCloudDownloads, getLocalRcloneConfig } from '@/lib/cloudDownloader';
import { apiErrorResponse, readJsonObject } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

// GET: Current cloud status and config
export async function GET() {
    try {
        const config = getCloudConfig();
        const status = await checkCloudStatus();
        return NextResponse.json({ config, status });
    } catch (e) {
        return apiErrorResponse(e, 'Failed to retrieve cloud status');
    }
}

// POST: Actions: test connection, sync progress, or export rclone config
export async function POST(req: Request) {
    try {
        const body = await readJsonObject(req, 8 * 1024);
        const action = body.action || 'test';

        if (action === 'test') {
            const testUrl = typeof body.workerUrl === 'string' ? body.workerUrl.trim() : undefined;
            const status = await checkCloudStatus(testUrl);
            return NextResponse.json({ success: status.online, status });
        }

        if (action === 'sync') {
            await syncCloudDownloads();
            return NextResponse.json({ success: true, message: 'Sync triggered' });
        }

        if (action === 'export-rclone') {
            const rclone = getLocalRcloneConfig();
            return NextResponse.json({
                success: rclone.found,
                base64: rclone.base64,
                path: rclone.path,
                error: rclone.found ? undefined : 'No local rclone.conf found on this system.',
            });
        }

        return NextResponse.json({ error: 'Invalid action. Supported: test, sync, export-rclone' }, { status: 400 });
    } catch (e) {
        return apiErrorResponse(e, 'Cloud action failed');
    }
}
