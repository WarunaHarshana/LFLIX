import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

const dbPath = path.join(process.cwd(), 'localflix.db');

export async function DELETE(req: NextRequest) {
    try {
        const db = new Database(dbPath);
        const result = db.prepare('DELETE FROM iptv_channels').run();
        db.close();

        return NextResponse.json({
            success: true,
            deleted: result.changes
        });
    } catch (error) {
        console.error('Failed to clear IPTV channels:', error);
        return NextResponse.json({ error: 'Failed to clear channels' }, { status: 500 });
    }
}
