import releaseMonitor from '@/lib/releaseMonitor';

export const dynamic = 'force-dynamic';

// GET — SSE endpoint for real-time notification push
export async function GET() {
  const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`));

      // Send current unread count
      const unreadCount = releaseMonitor.getUnreadCount();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'unread_count', count: unreadCount })}\n\n`));

      // Register this client for broadcasts
      releaseMonitor.addSSEClient(clientId, controller);

      // Keepalive ping every 30 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          clearInterval(keepalive);
          releaseMonitor.removeSSEClient(clientId);
        }
      }, 30000);

      // Cleanup when the stream is cancelled
      const originalCancel = controller.close.bind(controller);
      controller.close = () => {
        clearInterval(keepalive);
        releaseMonitor.removeSSEClient(clientId);
        try { originalCancel(); } catch { /* already closed */ }
      };
    },

    cancel() {
      releaseMonitor.removeSSEClient(clientId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
