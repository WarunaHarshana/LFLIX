import fs from 'fs';
import path from 'path';
import { spawnSync, execFile } from 'child_process';
import db from '@/lib/db';
import { verifyStreamToken } from './streamTokens';

/**
 * Locate the ffmpeg / ffprobe binaries.
 * Order: explicit settings override -> common Windows install paths -> PATH lookup.
 * Mirrors the heuristic already used in lib/mediainfo.ts so behaviour is consistent.
 */
function findBinary(name: 'ffmpeg' | 'ffprobe'): string {
  // 1. Settings override (lets the user point at a custom install, same idea as vlcPath)
  try {
    const row = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(`${name}Path`) as { value: string } | undefined;
    if (row?.value && fs.existsSync(row.value)) return row.value;
  } catch {
    /* settings table may not be ready yet */
  }

  // 2. Common locations
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const commonPaths = [
    `C:\\ffmpeg\\${exe}`,
    `C:\\ffmpeg\\bin\\${exe}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    path.join(process.cwd(), exe),
  ];
  for (const p of commonPaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }

  // 3. Fall back to PATH resolution
  return name;
}

export function findFFmpeg(): string {
  return findBinary('ffmpeg');
}

export function findFFprobe(): string {
  return findBinary('ffprobe');
}

// ---- Video encoder selection ----

/**
 * Hardware H.264 encoders, best first. Software transcoding pegs a CPU core per
 * stream; offloading to a GPU is the single biggest win available to the
 * transcode path when the hardware is actually usable.
 */
const HW_ENCODER_CANDIDATES = [
  { name: 'h264_nvenc', args: ['-preset', 'p1', '-tune', 'zerolatency'] },
  { name: 'h264_qsv', args: ['-preset', 'veryfast', '-global_quality', '23'] },
  { name: 'h264_amf', args: ['-quality', 'speed', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23'] },
  { name: 'h264_videotoolbox', args: ['-q:v', '55'] },
];

const SOFTWARE_ENCODER = {
  name: 'libx264',
  args: ['-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '21', '-threads', '0'],
};

type EncoderChoice = { name: string; args: string[] };

let cachedEncoder: EncoderChoice | null = null;

/**
 * Probe an encoder by actually initialising it on a synthetic clip.
 *
 * Listing `ffmpeg -encoders` is not enough: builds advertise every encoder they
 * were compiled with, whether or not the machine has the driver or GPU. The
 * only reliable signal is trying to encode a frame.
 */
function encoderWorks(encoder: string): boolean {
  try {
    const result = spawnSync(
      findFFmpeg(),
      [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=0.2',
        '-c:v', encoder,
        '-f', 'null', '-',
      ],
      { timeout: 15000, encoding: 'utf8' }
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * The encoder to transcode with, resolved once per process.
 * Set `LFLIX_FORCE_SOFTWARE_ENCODER=1` to skip hardware entirely.
 */
export function getVideoEncoder(): EncoderChoice {
  if (cachedEncoder) return cachedEncoder;

  if (process.env.LFLIX_FORCE_SOFTWARE_ENCODER === '1') {
    cachedEncoder = SOFTWARE_ENCODER;
    return cachedEncoder;
  }

  for (const candidate of HW_ENCODER_CANDIDATES) {
    if (encoderWorks(candidate.name)) {
      console.log(`[Transcode] Using hardware encoder: ${candidate.name}`);
      cachedEncoder = candidate;
      return cachedEncoder;
    }
  }

  console.log('[Transcode] No usable hardware encoder, falling back to libx264');
  cachedEncoder = SOFTWARE_ENCODER;
  return cachedEncoder;
}

/** Flags for the chosen encoder, ready to splice into an ffmpeg argument list. */
export function getVideoEncoderArgs(): string[] {
  const encoder = getVideoEncoder();
  return ['-c:v', encoder.name, ...encoder.args];
}

// ---- Media path resolution (shared by stream / transcode / subtitle routes) ----

export type StreamContentType = 'movie' | 'show';

function validateId(id: unknown): id is number {
  return Number.isInteger(id) && (id as number) > 0;
}

export function getMediaInfoById(
  contentType: 'movie' | 'episode',
  id: number,
): { filePath: string; videoCodec: string | null; duration: number | null } | null {
  try {
    if (contentType === 'movie') {
      const result = db
        .prepare('SELECT filePath, videoCodec, duration FROM movies WHERE id = ?')
        .get(id) as { filePath: string; videoCodec: string | null; duration: number | null } | undefined;
      return result ? { filePath: result.filePath, videoCodec: result.videoCodec || null, duration: result.duration || null } : null;
    }
    const result = db
      .prepare('SELECT filePath, videoCodec, duration FROM episodes WHERE id = ?')
      .get(id) as { filePath: string; videoCodec: string | null; duration: number | null } | undefined;
    return result ? { filePath: result.filePath, videoCodec: result.videoCodec || null, duration: result.duration || null } : null;
  } catch {
    return null;
  }
}

export function getFilePathById(
  contentType: 'movie' | 'episode',
  id: number,
): string | null {
  return getMediaInfoById(contentType, id)?.filePath || null;
}

const probedCodecCache = new Map<string, string>();

export async function getVideoCodec(filePath: string, initialCodec?: string | null): Promise<string> {
  if (initialCodec) return initialCodec.toLowerCase();
  const cached = probedCodecCache.get(filePath);
  if (cached) return cached;
  return new Promise((resolve) => {
    execFile(
      findFFprobe(),
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', filePath],
      { timeout: 10000 },
      (error, stdout) => {
        const codec = (stdout || '').trim().toLowerCase();
        if (codec) {
          probedCodecCache.set(filePath, codec);
        }
        resolve(codec);
      }
    );
  });
}

/** Try a few separator variants so Windows-style and POSIX paths both resolve. */
export function resolveExistingMediaPath(filePath: string): string | null {
  const candidates = [
    filePath,
    filePath.replace(/\//g, '\\'),
    filePath.replace(/\\/g, '/'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export type ResolveResult =
  | { ok: true; mediaPath: string; videoCodec?: string | null; duration?: number | null }
  | { ok: false; status: number; error: string };

/**
 * Resolve the on-disk media file for a stream/transcode/subtitle request.
 * Accepts either a signed `token` or `contentType`+`contentId`(+`episodeId`),
 * matching the existing /api/stream contract.
 */
export function resolveMediaFromParams(searchParams: URLSearchParams): ResolveResult {
  const token = searchParams.get('token');
  const contentType = searchParams.get('contentType') as StreamContentType | null;
  const contentId = searchParams.get('contentId');
  const episodeId = searchParams.get('episodeId');

  let info: { contentType: string; contentId: number; episodeId?: number } | null = null;

  if (token) {
    info = verifyStreamToken(token);
    if (!info) return { ok: false, status: 401, error: 'Invalid or expired token' };
  } else if (contentType && contentId) {
    info = {
      contentType,
      contentId: parseInt(contentId, 10),
      episodeId: episodeId ? parseInt(episodeId, 10) : undefined,
    };
  } else {
    return { ok: false, status: 400, error: 'Missing contentType/contentId or token' };
  }

  if (info.contentType !== 'movie' && info.contentType !== 'show') {
    return { ok: false, status: 400, error: 'Invalid contentType' };
  }
  if (!validateId(info.contentId)) {
    return { ok: false, status: 400, error: 'Invalid contentId' };
  }
  if (info.episodeId !== undefined && !validateId(info.episodeId)) {
    return { ok: false, status: 400, error: 'Invalid episodeId' };
  }

  if (info.contentType === 'show' && !info.episodeId) {
    return { ok: false, status: 400, error: 'episodeId is required for TV shows' };
  }

  const mediaInfo = info.episodeId
    ? getMediaInfoById('episode', info.episodeId)
    : getMediaInfoById('movie', info.contentId);

  if (!mediaInfo) return { ok: false, status: 404, error: 'Content not found' };

  const mediaPath = resolveExistingMediaPath(mediaInfo.filePath);
  if (!mediaPath) return { ok: false, status: 404, error: 'File not found on disk' };

  return { ok: true, mediaPath, videoCodec: mediaInfo.videoCodec, duration: mediaInfo.duration };
}

/** Build a query string that carries the same auth params (token OR ids) forward. */
export function forwardAuthParams(searchParams: URLSearchParams): string {
  const out = new URLSearchParams();
  const token = searchParams.get('token');
  if (token) {
    out.set('token', token);
  } else {
    const contentType = searchParams.get('contentType');
    const contentId = searchParams.get('contentId');
    const episodeId = searchParams.get('episodeId');
    if (contentType) out.set('contentType', contentType);
    if (contentId) out.set('contentId', contentId);
    if (episodeId) out.set('episodeId', episodeId);
  }
  return out.toString();
}
