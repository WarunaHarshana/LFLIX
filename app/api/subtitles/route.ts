import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function srtToVtt(srt: string): string {
  let vtt = "WEBVTT\n\n";
  const lines = srt.replace(/\r\n/g, '\n').split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Timecode conversion: SRT 00:00:01,000 to VTT 00:00:01.000
    if (line.includes('-->')) {
      vtt += line.replace(/,/g, '.') + '\n';
    } else {
      vtt += line + '\n';
    }
  }
  return vtt;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const videoPath = searchParams.get('path');

    if (!videoPath) {
      return new NextResponse('Missing path', { status: 400 });
    }

    if (!fs.existsSync(videoPath)) {
      return new NextResponse('Video not found', { status: 404 });
    }

    const dir = path.dirname(videoPath);
    const ext = path.extname(videoPath);
    const base = path.basename(videoPath, ext);
    
    const possiblePaths = [
      path.join(dir, base + '.srt'),
      path.join(dir, base + '.en.srt'),
      path.join(dir, base + '.eng.srt'),
      path.join(dir, 'subs', base + '.srt')
    ];

    let finalPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        finalPath = p;
        break;
      }
    }

    if (!finalPath) {
      return new NextResponse('No subtitles found', { status: 404 });
    }

    const srtContent = fs.readFileSync(finalPath, 'utf8');
    const vttContent = srtToVtt(srtContent);

    return new NextResponse(vttContent, {
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Subtitle Error:', error);
    return new NextResponse('Internal Subtitle Error', { status: 500 });
  }
}
