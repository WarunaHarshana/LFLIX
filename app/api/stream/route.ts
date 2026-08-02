import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { resolveMediaFromParams } from '@/lib/ffmpeg';
import { getSafeErrorMessage } from '@/lib/security';
import { apiErrorResponse } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Get MIME type based on file extension
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.ts': 'video/mp2t',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv'
  };
  return mimeTypes[ext] || 'video/mp4';
}

function parseRangeHeader(range: string | null, fileSize: number): { start: number; end: number } | null {
  if (!range) return null;

  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  let start: number;
  let end: number;

  if (!startText) {
    const suffixLength = Number.parseInt(endText, 10);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(startText, 10);
    end = endText ? Number.parseInt(endText, 10) : fileSize - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || start >= fileSize) return null;

  return { start, end: Math.min(end, fileSize - 1) };
}

/**
 * Adapt a Node read stream into a web ReadableStream.
 *
 * Handing the Node stream straight to `new Response(file as any)` throws an
 * uncaught `ERR_INVALID_STATE` ("ReadableStream is already closed") whenever the
 * client goes away mid-transfer — which every seek in a video player does, since
 * the browser abandons the in-flight range request and issues a new one.
 * Converting explicitly lets us destroy the file handle on cancel/abort instead.
 */
function toWebStream(file: fs.ReadStream, req: Request): ReadableStream<Uint8Array> {
  const abort = () => file.destroy();
  req.signal?.addEventListener('abort', abort, { once: true });
  file.once('close', () => req.signal?.removeEventListener('abort', abort));

  return Readable.toWeb(file) as ReadableStream<Uint8Array>;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const resolved = resolveMediaFromParams(searchParams);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const mediaPath = resolved.mediaPath;

    const stat = fs.statSync(mediaPath);
    const fileSize = stat.size;
    const mimeType = getMimeType(mediaPath);

    // Handle range requests (for seeking)
    const range = req.headers.get('range');

    if (range) {
      const parsedRange = parseRangeHeader(range, fileSize);
      if (!parsedRange) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      const { start, end } = parsedRange;
      const chunksize = end - start + 1;

      return new Response(toWebStream(fs.createReadStream(mediaPath, { start, end }), req), {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': mimeType,
        },
      });
    }

    // Full file stream (no range)
    return new Response(toWebStream(fs.createReadStream(mediaPath), req), {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (e) {
    console.error('Stream error:', e);
    return apiErrorResponse(e);
  }
}
