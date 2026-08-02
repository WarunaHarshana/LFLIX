import fs from 'fs';
import path from 'path';
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

// ---- Media path resolution (shared by stream / transcode / subtitle routes) ----

export type StreamContentType = 'movie' | 'show';

function validateId(id: unknown): id is number {
  return Number.isInteger(id) && (id as number) > 0;
}

export function getFilePathById(
  contentType: 'movie' | 'episode',
  id: number,
): string | null {
  try {
    if (contentType === 'movie') {
      const result = db
        .prepare('SELECT filePath FROM movies WHERE id = ?')
        .get(id) as { filePath: string } | undefined;
      return result?.filePath || null;
    }
    const result = db
      .prepare('SELECT filePath FROM episodes WHERE id = ?')
      .get(id) as { filePath: string } | undefined;
    return result?.filePath || null;
  } catch {
    return null;
  }
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
  | { ok: true; mediaPath: string }
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

  const filePath = info.episodeId
    ? getFilePathById('episode', info.episodeId)
    : getFilePathById('movie', info.contentId);

  if (!filePath) return { ok: false, status: 404, error: 'Content not found' };

  const mediaPath = resolveExistingMediaPath(filePath);
  if (!mediaPath) return { ok: false, status: 404, error: 'File not found on disk' };

  return { ok: true, mediaPath };
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
