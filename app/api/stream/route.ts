import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
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

      const file = fs.createReadStream(mediaPath, { start, end });
      
      return new Response(file as any, {
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
    const file = fs.createReadStream(mediaPath);
    
    return new Response(file as any, {
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
