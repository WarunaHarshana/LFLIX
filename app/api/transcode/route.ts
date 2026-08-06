import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { findFFprobe, resolveMediaFromParams, forwardAuthParams } from '@/lib/ffmpeg';

import { apiErrorResponse } from '@/lib/apiSecurity';

// On-the-fly HLS transcoding for browser-incompatible files (MKV/AVI, HEVC, DTS, ...).
// This endpoint returns a VOD m3u8 playlist whose segments are produced on demand by
// /api/transcode/segment. Because the playlist is generated up-front from the probed
// duration, the player can seek anywhere immediately.

export const dynamic = 'force-dynamic';

const SEGMENT_DURATION = 6; // seconds per segment

function probeDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      findFFprobe(),
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      { timeout: 30000 },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const dur = parseFloat((stdout || '').trim());
        resolve(Number.isFinite(dur) && dur > 0 ? dur : null);
      },
    );
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const resolved = resolveMediaFromParams(searchParams);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const duration = await probeDuration(resolved.mediaPath);
    if (!duration) {
      return NextResponse.json({ error: 'Could not probe media duration' }, { status: 500 });
    }

    // Optional audio track selection carried through to each segment.
    const audioParam = searchParams.get('audio');
    const authQuery = forwardAuthParams(searchParams);
    const audioSuffix = audioParam ? `&audio=${encodeURIComponent(audioParam)}` : '';

    const segmentCount = Math.ceil(duration / SEGMENT_DURATION);
    const lines: string[] = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
    ];

    for (let i = 0; i < segmentCount; i++) {
      const segLen =
        i === segmentCount - 1 ? duration - i * SEGMENT_DURATION : SEGMENT_DURATION;

      // Every segment is produced by its own ffmpeg process that seeks into the
      // source independently, so each carries its own timeline — that is what
      // EXT-X-DISCONTINUITY is for.
      //
      // Without it the browser appends these to one buffer and compares decode
      // timestamps across the join. Seeking lands on the keyframe at or before
      // the boundary, so a segment can begin a frame or two *before* the
      // previous one ended, and Chrome aborts with
      // "CHUNK_DEMUXER_ERROR_APPEND_FAILED: Parsed buffers not in DTS sequence".
      // Measured on a real 2160p file: segment 1 started 0.048s before segment 0
      // finished, breaking playback at the very first boundary.
      //
      // The tag tells the demuxer to reset its baseline per segment instead of
      // comparing across it. EXTINF still drives the timeline, so seeking and
      // duration are unaffected.
      if (i > 0) {
        lines.push('#EXT-X-DISCONTINUITY');
      }

      lines.push(`#EXTINF:${segLen.toFixed(3)},`);
      lines.push(`/api/transcode/segment?${authQuery}&seg=${i}${audioSuffix}`);
    }
    lines.push('#EXT-X-ENDLIST');

    return new NextResponse(lines.join('\n') + '\n', {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (e) {
    console.error('Transcode playlist error:', e);
    return apiErrorResponse(e);
  }
}
