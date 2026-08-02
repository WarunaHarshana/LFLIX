import { NextResponse } from 'next/server';
import { iptvDb } from '@/lib/db';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function DELETE() {
    try {
        // Shared connection — see the note in ../route.ts about the stray
        // ./localflix.db handle this used to open.
        const result = iptvDb.clearAllChannels();

        return NextResponse.json({
            success: true,
            deleted: result.changes
        });
    } catch (error) {
        console.error('Failed to clear IPTV channels:', error);
        return NextResponse.json({ error: 'Failed to clear channels' }, { status: 500 });
    }
}
