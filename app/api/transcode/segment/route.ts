import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { findFFmpeg, getVideoEncoderArgs, resolveMediaFromParams } from '@/lib/ffmpeg';
import { apiErrorResponse } from '@/lib/apiSecurity';

// Produces a single MPEG-TS segment, transcoded on demand, for the HLS playlist
// served by /api/transcode. Each segment is independent: we fast-seek to its start
// time and emit exactly SEGMENT_DURATION seconds. `output_ts_offset` keeps the
// presentation timestamps continuous across segments so playback is seamless.

export const dynamic = 'force-dynamic';

const SEGMENT_DURATION = 6; // must match the playlist route
const MAX_CACHE_SEGMENTS = 50; // keep up to 50 recent segments in memory

// Segment cache: mediaPath:seg:audioIndex -> { data: Buffer, timestamp: number }
const segmentCache = new Map<string, { data: Buffer; timestamp: number }>();
// In-flight transcode promises to prevent duplicate ffmpeg processes for the same segment
const inFlightRequests = new Map<string, Promise<Buffer | null>>();

function pruneCache() {
  if (segmentCache.size > MAX_CACHE_SEGMENTS) {
    const sorted = [...segmentCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, segmentCache.size - MAX_CACHE_SEGMENTS);
    for (const [k] of toRemove) {
      segmentCache.delete(k);
    }
  }
}

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

    const cacheKey = `${resolved.mediaPath}:${seg}:${audioIndex}`;

    // 1. Return from in-memory cache if already produced
    const cached = segmentCache.get(cacheKey);
    if (cached) {
      cached.timestamp = Date.now();
      return new Response(new Uint8Array(cached.data), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp2t',
          'Content-Length': cached.data.length.toString(),
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // 2. If already being transcoded in-flight, await that promise
    let inFlight = inFlightRequests.get(cacheKey);
    if (!inFlight) {
      const start = seg * SEGMENT_DURATION;

      const args = [
        '-v', 'error',
        '-ss', String(start),            // fast input seek to segment start
        '-t', String(SEGMENT_DURATION),  // emit only this segment's worth
        '-i', resolved.mediaPath,
        '-map', '0:v:0',
        '-map', `0:a:${audioIndex}?`,    // selected audio ("?" => optional, no error if absent)
        '-vf', 'scale=min(1920\\,iw):-2', // scale down 4K to 1080p, leaves 1080p/720p untouched
        // GPU encoder when one is genuinely usable, else libx264 ultrafast.
        ...getVideoEncoderArgs(),
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

      inFlight = new Promise<Buffer | null>((resolve) => {
        const chunks: Buffer[] = [];
        const ff = spawn(findFFmpeg(), args, { stdio: ['ignore', 'pipe', 'pipe'] });

        ff.stdout.on('data', (d: Buffer) => {
          chunks.push(d);
        });

        let stderr = '';
        ff.stderr.on('data', (d) => {
          if (stderr.length < 4000) stderr += d.toString();
        });

        ff.on('error', (err) => {
          console.error('Transcode segment spawn error:', err);
          resolve(null);
        });

        // Kill ffmpeg if client aborts
        const abort = () => {
          if (!ff.killed) ff.kill('SIGKILL');
          resolve(null);
        };
        req.signal.addEventListener('abort', abort, { once: true });

        ff.on('close', (code) => {
          req.signal.removeEventListener('abort', abort);
          if (code === 0 && chunks.length > 0) {
            const buf = Buffer.concat(chunks);
            segmentCache.set(cacheKey, { data: buf, timestamp: Date.now() });
            pruneCache();
            resolve(buf);
          } else {
            if (code !== 0 && code !== null) {
              console.warn(`[Transcode] segment ${seg} ffmpeg exited ${code}: ${stderr.slice(0, 500)}`);
            }
            resolve(null);
          }
        });
      });

      inFlightRequests.set(cacheKey, inFlight);
    }

    const data = await inFlight;
    inFlightRequests.delete(cacheKey);

    if (!data) {
      return NextResponse.json({ error: 'Failed to transcode segment' }, { status: 500 });
    }

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Length': data.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    console.error('Transcode segment error:', e);
    return apiErrorResponse(e);
  }
}
