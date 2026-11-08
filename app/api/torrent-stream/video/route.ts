import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { torrentStreamManager } from '@/lib/torrentStreamer';
import { apiErrorResponse, rateLimit } from '@/lib/apiSecurity';
import path from 'path';

export const dynamic = 'force-dynamic';

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.ts': 'video/mp2t',
    '.m4v': 'video/mp4',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.srt': 'text/plain; charset=utf-8',
    '.vtt': 'text/vtt; charset=utf-8',
  };
  return map[ext] || 'application/octet-stream';
}

function nodeOrStreamxToWebStream(stream: any): ReadableStream {
  if (stream && typeof (stream as any)[Symbol.asyncIterator] === 'function') {
    const iterator = (stream as any)[Symbol.asyncIterator]();
    return new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await iterator.next();
          if (done) {
            controller.close();
          } else {
            const chunk = typeof value === 'string' ? Buffer.from(value) : value;
            controller.enqueue(chunk);
          }
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        try {
          if (typeof iterator.return === 'function') {
            iterator.return();
          }
        } catch {}
        try {
          if (typeof (stream as any).destroy === 'function') {
            (stream as any).destroy();
          }
        } catch {}
      },
    });
  }

  return Readable.toWeb(stream) as unknown as ReadableStream;
}

export async function GET(req: Request) {
  try {
    const limited = rateLimit(req, 'torrent-video-stream', { windowMs: 60 * 1000, max: 5000 });
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const infoHash = searchParams.get('infoHash');
    const fileIndexStr = searchParams.get('fileIndex');
    const fileIndex = fileIndexStr ? parseInt(fileIndexStr, 10) : 0;

    if (!infoHash) {
      return NextResponse.json({ error: 'Missing infoHash' }, { status: 400 });
    }

    const item = torrentStreamManager.getFile(infoHash, fileIndex);
    if (!item || !item.file) {
      return NextResponse.json(
        { error: 'File or stream not found. Initialize stream first via POST /api/torrent-stream' },
        { status: 404 }
      );
    }

    const file = item.file as {
      name?: string;
      length?: number;
      createReadStream?: (opts?: { start?: number; end?: number }) => Readable;
    };

    const totalSize = file.length || 0;
    const mimeType = getMimeType(file.name || '');
    const rangeHeader = req.headers.get('range');

    if (!rangeHeader || totalSize === 0) {
      if (typeof file.createReadStream !== 'function') {
        return NextResponse.json({ error: 'Streaming not supported on this file' }, { status: 500 });
      }
      const stream = file.createReadStream();
      const webStream = nodeOrStreamxToWebStream(stream);

      return new Response(webStream as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(totalSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Parse Range header e.g. "bytes=0-1048575" or "bytes=500000-"
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${totalSize}` },
      });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

    if (start >= totalSize || end >= totalSize || start > end) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${totalSize}` },
      });
    }

    const chunkSize = end - start + 1;
    if (typeof file.createReadStream !== 'function') {
      return NextResponse.json({ error: 'Streaming not supported on this file' }, { status: 500 });
    }

    const stream = file.createReadStream({ start, end });
    const webStream = nodeOrStreamxToWebStream(stream);

    return new Response(webStream as unknown as BodyInit, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, 'Failed to stream video chunk');
  }
}

export async function HEAD(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const infoHash = searchParams.get('infoHash');
    const fileIndexStr = searchParams.get('fileIndex');
    const fileIndex = fileIndexStr ? parseInt(fileIndexStr, 10) : 0;

    if (!infoHash) {
      return new Response(null, { status: 400 });
    }

    const item = torrentStreamManager.getFile(infoHash, fileIndex);
    if (!item || !item.file) {
      return new Response(null, { status: 404 });
    }

    const file = item.file as { name?: string; length?: number };
    const totalSize = file.length || 0;
    const mimeType = getMimeType(file.name || '');

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(totalSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
