import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { findFFmpeg, resolveMediaFromParams } from '@/lib/ffmpeg';
import { getSafeErrorMessage } from '@/lib/security';

// Produces a single MPEG-TS segment, transcoded on demand, for the HLS playlist
// served by /api/transcode. Each segment is independent: we fast-seek to its start
// time and emit exactly SEGMENT_DURATION seconds. `output_ts_offset` keeps the
// presentation timestamps continuous across segments so playback is seamless.

export const dynamic = 'force-dynamic';

const SEGMENT_DURATION = 6; // must match the playlist route

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const resolved = resolveMediaFromParams(searchParams);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const seg = parseInt(searchParams.get('seg') || '', 10);
    if (!Number.isInteger(seg) || seg < 0) {
      return NextResponse.json({ error: 'Invalid segment index' }, { status: 400 });
    }

    // Audio stream index within the file (0-based among audio streams). Defaults to first.
    const audioRaw = parseInt(searchParams.get('audio') || '0', 10);
    const audioIndex = Number.isInteger(audioRaw) && audioRaw >= 0 ? audioRaw : 0;

    const start = seg * SEGMENT_DURATION;

    const args = [
      '-v', 'error',
      '-ss', String(start),            // fast input seek to segment start
      '-t', String(SEGMENT_DURATION),  // emit only this segment's worth
      '-i', resolved.mediaPath,
      '-map', '0:v:0',
      '-map', `0:a:${audioIndex}?`,    // selected audio ("?" => optional, no error if absent)
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-profile:v', 'high',
      '-level', '4.1',
      '-pix_fmt', 'yuv420p',           // ensure broad browser compatibility (no 10-bit/4:4:4)
      '-c:a', 'aac',
      '-ac', '2',
      '-b:a', '160k',
      '-output_ts_offset', String(start),
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-f', 'mpegts',
      'pipe:1',
    ];

    const ff = spawn(findFFmpeg(), args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    ff.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d.toString();
    });
    ff.on('error', (err) => {
      console.error('Transcode segment spawn error:', err);
    });

    // Kill ffmpeg if the client navigates away / aborts the request.
    const abort = () => {
      if (!ff.killed) ff.kill('SIGKILL');
    };
    req.signal.addEventListener('abort', abort);
    ff.on('close', (code) => {
      req.signal.removeEventListener('abort', abort);
      if (code !== 0 && code !== null) {
        console.warn(`[Transcode] segment ${seg} ffmpeg exited ${code}: ${stderr.slice(0, 500)}`);
      }
    });

    return new Response(ff.stdout as any, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('Transcode segment error:', e);
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}
