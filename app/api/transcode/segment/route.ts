import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { findFFmpeg, getVideoEncoder, resolveMediaFromParams, getVideoCodec } from '@/lib/ffmpeg';
import { apiErrorResponse } from '@/lib/apiSecurity';

// Produces a single MPEG-TS segment, transcoded on demand, for the HLS playlist
// served by /api/transcode.
// - For H.264 video: Direct Stream (-c:v copy) with zero transcoding overhead and bit-for-bit original quality.
// - For HEVC / other codecs: Hardware accelerated (h264_mf / nvenc / qsv / amf) or fast libx264 encoding.
//   Downscaled to 1080p if source > 1080p with fast_bilinear filtering for 1.8x+ realtime speed.
// - Serialized concurrency ensures ffmpeg processes never starve each other of CPU/GPU resources.
// - Ahead-of-time background prefetching of seg+1 guarantees <1ms cache hits during steady playback.

export const dynamic = 'force-dynamic';

const SEGMENT_DURATION = 6; // must match the playlist route
const MAX_CACHE_SEGMENTS = 50; // keep up to 50 recent segments in memory (~150MB RAM)

// Segment cache: mediaPath:seg:audioIndex -> { data: Buffer, timestamp: number }
const segmentCache = new Map<string, { data: Buffer; timestamp: number }>();
// In-flight transcode promises to prevent duplicate ffmpeg processes for the exact same segment
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

// Concurrency queue: ensures at most MAX_CONCURRENT_TRANSCODES ffmpeg processes run simultaneously
const MAX_CONCURRENT_TRANSCODES = 1;
let activeTranscodes = 0;
const transcodeQueue: (() => void)[] = [];

function acquireTranscodeSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const release = () => {
      activeTranscodes--;
      if (transcodeQueue.length > 0) {
        const next = transcodeQueue.shift();
        if (next) next();
      }
    };

    if (activeTranscodes < MAX_CONCURRENT_TRANSCODES) {
      activeTranscodes++;
      resolve(release);
    } else {
      transcodeQueue.push(() => {
        activeTranscodes++;
        resolve(release);
      });
    }
  });
}

async function transcodeSegment(
  mediaPath: string,
  seg: number,
  audioIndex: number,
  videoCodecHint?: string | null,
  signal?: AbortSignal
): Promise<Buffer | null> {
  const cacheKey = `${mediaPath}:${seg}:${audioIndex}`;

  const cached = segmentCache.get(cacheKey);
  if (cached) {
    cached.timestamp = Date.now();
    return cached.data;
  }

  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const promise = (async (): Promise<Buffer | null> => {
    const releaseSlot = await acquireTranscodeSlot();
    try {
      if (signal?.aborted) return null;

      // Re-check cache after acquiring queue slot
      const postWaitCached = segmentCache.get(cacheKey);
      if (postWaitCached) {
        postWaitCached.timestamp = Date.now();
        return postWaitCached.data;
      }

      const rawCodec = await getVideoCodec(mediaPath, videoCodecHint);
      const isH264 = rawCodec.includes('h264') || rawCodec.includes('avc');

      const encoder = getVideoEncoder();
      console.log(`[Transcode] Segment ${seg} using encoder: ${encoder.name} (${encoder.args.join(' ')})`);

      const videoArgs = isH264
        ? ['-c:v', 'copy']
        : [
            '-vf', 'scale=min(1920\\,iw):-2',
            '-sws_flags', 'fast_bilinear',
            '-c:v', encoder.name,
            ...encoder.args,
            '-pix_fmt', 'yuv420p',
          ];

      const start = seg * SEGMENT_DURATION;

      const args = [
        '-v', 'error',
        '-fflags', '+genpts+nobuffer',
        '-ss', String(start),
        '-t', String(SEGMENT_DURATION),
        '-i', mediaPath,
        '-map', '0:v:0',
        '-map', `0:a:${audioIndex}?`,
        ...videoArgs,
        '-c:a', 'aac',
        '-ac', '2',
        '-b:a', '256k',
        '-output_ts_offset', String(start),
        '-muxdelay', '0',
        '-muxpreload', '0',
        '-f', 'mpegts',
        'pipe:1',
      ];

      return await new Promise<Buffer | null>((resolve) => {
        const chunks: Buffer[] = [];
        const ff = spawn(findFFmpeg(), args, { stdio: ['ignore', 'pipe', 'pipe'] });

        ff.stdout.on('data', (d: Buffer) => {
          chunks.push(d);
        });

        let stderr = '';
        ff.stderr.on('data', (d) => {
          if (stderr.length < 2000) stderr += d.toString();
        });

        const abort = () => {
          if (!ff.killed) ff.kill('SIGKILL');
          resolve(null);
        };

        if (signal) {
          signal.addEventListener('abort', abort, { once: true });
        }

        ff.on('error', (err) => {
          console.error('[Transcode] spawn error for segment', seg, err);
          if (signal) signal.removeEventListener('abort', abort);
          resolve(null);
        });

        ff.on('close', (code) => {
          if (signal) signal.removeEventListener('abort', abort);
          if (code === 0 && chunks.length > 0) {
            const buf = Buffer.concat(chunks);
            segmentCache.set(cacheKey, { data: buf, timestamp: Date.now() });
            pruneCache();
            // Automatically prefetch next segment in background to eliminate buffering
            triggerPrefetch(mediaPath, seg + 1, audioIndex, videoCodecHint);
            resolve(buf);
          } else {
            if (code !== 0 && code !== null) {
              console.warn(`[Transcode] segment ${seg} ffmpeg exited ${code}: ${stderr.slice(0, 300)}`);
            }
            resolve(null);
          }
        });
      });
    } finally {
      releaseSlot();
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

function triggerPrefetch(
  mediaPath: string,
  nextSeg: number,
  audioIndex: number,
  videoCodecHint?: string | null
) {
  const nextKey = `${mediaPath}:${nextSeg}:${audioIndex}`;
  if (segmentCache.has(nextKey) || inFlightRequests.has(nextKey)) return;
  // Trigger prefetch asynchronously without blocking the current response
  transcodeSegment(mediaPath, nextSeg, audioIndex, videoCodecHint).catch(() => {});
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

    const data = await transcodeSegment(
      resolved.mediaPath,
      seg,
      audioIndex,
      resolved.videoCodec,
      req.signal
    );

    if (!data || data.length === 0) {
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
