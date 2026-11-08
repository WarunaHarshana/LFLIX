import { NextResponse } from 'next/server';
import { torrentStreamManager } from '@/lib/torrentStreamer';
import { apiErrorResponse, rateLimit, readJsonObject } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const limited = rateLimit(req, 'torrent-stream-start', { windowMs: 60 * 1000, max: 20 });
    if (limited) return limited;

    const body = await readJsonObject(req, 8 * 1024);
    const { action, infoHash, magnetUri, fileIndex } = body as {
      action?: string;
      infoHash?: string;
      magnetUri?: string;
      fileIndex?: number;
    };

    if (action === 'heartbeat' && infoHash) {
      const ok = torrentStreamManager.heartbeat(infoHash);
      return NextResponse.json({ success: ok });
    }

    if (action === 'stop' && infoHash) {
      const stopped = await torrentStreamManager.stopStream(infoHash, true);
      return NextResponse.json({ success: stopped });
    }

    if (!magnetUri || typeof magnetUri !== 'string' || !magnetUri.trim().startsWith('magnet:')) {
      return NextResponse.json(
        { error: 'Invalid or missing magnet URI' },
        { status: 400 }
      );
    }

    const safeFileIndex = typeof fileIndex === 'number' && Number.isInteger(fileIndex) && fileIndex >= 0
      ? fileIndex
      : undefined;

    const streamStats = await torrentStreamManager.startStream(magnetUri.trim(), safeFileIndex);
    return NextResponse.json({ success: true, stream: streamStats });
  } catch (err: unknown) {
    return apiErrorResponse(err, 'Failed to initialize torrent stream');
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const infoHash = searchParams.get('infoHash');

    if (infoHash) {
      const stats = torrentStreamManager.getStreamStats(infoHash);
      if (!stats) {
        return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, stream: stats });
    }

    const streams = torrentStreamManager.listStreams();
    return NextResponse.json({ success: true, streams });
  } catch (err: unknown) {
    return apiErrorResponse(err, 'Failed to fetch torrent stream stats');
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await readJsonObject(req, 4 * 1024);
    const { infoHash, fileIndex, currentTime, duration } = body as {
      infoHash?: string;
      fileIndex?: number;
      currentTime?: number;
      duration?: number;
    };

    if (!infoHash || typeof fileIndex !== 'number' || typeof currentTime !== 'number' || typeof duration !== 'number') {
      return NextResponse.json({ error: 'Invalid playhead parameters' }, { status: 400 });
    }

    const updated = torrentStreamManager.setPlayhead(infoHash, fileIndex, currentTime, duration);
    return NextResponse.json({ success: updated });
  } catch (err: unknown) {
    return apiErrorResponse(err, 'Failed to update playhead');
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const infoHash = searchParams.get('infoHash');

    if (!infoHash) {
      return NextResponse.json({ error: 'Missing infoHash' }, { status: 400 });
    }

    const stopped = await torrentStreamManager.stopStream(infoHash, true);
    return NextResponse.json({ success: stopped });
  } catch (err: unknown) {
    return apiErrorResponse(err, 'Failed to stop stream');
  }
}
