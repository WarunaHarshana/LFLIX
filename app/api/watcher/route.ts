import { NextResponse } from 'next/server';
import { folderWatcher, WatcherEvent } from '@/lib/watcher';

// SSE endpoint for real-time notifications
export async function GET() {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection message
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

            // Subscribe to watcher events
            const unsubscribe = folderWatcher.subscribe((event: WatcherEvent) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch (e) {
                    // Stream might be closed
                }
            });

            // Start the watcher if not already running
            if (!folderWatcher.isWatching()) {
                folderWatcher.start().catch(console.error);
            }

            // Cleanup on close - note: this doesn't work perfectly with SSE
            // The stream will eventually be garbage collected
        },
        cancel() {
            // Called when client disconnects
            console.log('SSE client disconnected');
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
