import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';

// Get file path by ID (same as play API)
function getFilePathById(contentType: 'movie' | 'episode', id: number): string | null {
  try {
    if (contentType === 'movie') {
      const result = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
      return result?.filePath || null;
    } else {
      const result = db.prepare('SELECT filePath FROM episodes WHERE id = ?').get(id) as { filePath: string } | undefined;
      return result?.filePath || null;
    }
  } catch {
    return null;
  }
}

// Validate ID is a positive integer
function validateId(id: any): id is number {
  return Number.isInteger(id) && id > 0;
}

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const contentType = searchParams.get('contentType') as 'movie' | 'show' | null;
    const contentId = searchParams.get('contentId');
    const episodeId = searchParams.get('episodeId');

    // Validate parameters
    if (!contentType || !contentId) {
      return NextResponse.json({ error: 'Missing contentType or contentId' }, { status: 400 });
    }

    if (contentType !== 'movie' && contentType !== 'show') {
      return NextResponse.json({ error: 'Invalid contentType' }, { status: 400 });
    }

    const id = parseInt(contentId, 10);
    if (!validateId(id)) {
      return NextResponse.json({ error: 'Invalid contentId' }, { status: 400 });
    }

    const epId = episodeId ? parseInt(episodeId, 10) : undefined;
    if (episodeId && !validateId(epId)) {
      return NextResponse.json({ error: 'Invalid episodeId' }, { status: 400 });
    }

    // Look up file path
    const filePath = epId
      ? getFilePathById('episode', epId)
      : getFilePathById(contentType === 'movie' ? 'movie' : 'episode', id);

    if (!filePath) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // Normalize path
    const normalizedPath = filePath.replace(/\//g, '\\');

    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
    }

    const stat = fs.statSync(normalizedPath);
    const fileSize = stat.size;
    const mimeType = getMimeType(normalizedPath);

    // Handle range requests (for seeking)
    const range = req.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const file = fs.createReadStream(normalizedPath, { start, end });
      
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
    const file = fs.createReadStream(normalizedPath);
    
    return new Response(file as any, {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (e: any) {
    console.error('Stream error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
