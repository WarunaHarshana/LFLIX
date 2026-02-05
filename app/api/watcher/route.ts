import { NextResponse } from 'next/server';
import { folderWatcher, WatcherEvent } from '@/lib/watcher';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// SSE endpoint for real-time notifications
export async function GET() {
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection message
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

            // Subscribe to watcher events
            unsubscribe = folderWatcher.subscribe((event: WatcherEvent) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch (e) {
                    // Stream might be closed, unsubscribe to prevent memory leak
                    if (unsubscribe) {
                        unsubscribe();
                        unsubscribe = null;
                    }
                }
            });

            // Start the watcher if not already running
            if (!folderWatcher.isWatching()) {
                folderWatcher.start().catch(console.error);
            }
        },
        cancel() {
            // Called when client disconnects - clean up subscription
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
            console.log('SSE client disconnected, cleaned up subscription');
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

// POST to manually trigger watcher restart
export async function POST() {
    try {
        await folderWatcher.start();
        return NextResponse.json({
            success: true,
            watching: folderWatcher.isWatching(),
            paths: folderWatcher.getWatchedPaths()
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// DELETE to stop watcher
export async function DELETE() {
    try {
        await folderWatcher.stop();
        return NextResponse.json({ success: true, watching: false });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
