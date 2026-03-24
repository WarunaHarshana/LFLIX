import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type StreamServer = {
  name: string;
  url: string;
  color: string;
};

const SERVER_CHECK_TIMEOUT_MS = 4000;
const SERVER_CHECK_CACHE_TTL_MS = 90_000;

type ProbeCacheEntry = {
  working: boolean;
  expiresAt: number;
};

const probeCache = new Map<string, ProbeCacheEntry>();

const EMBED_ALLOW_MARKERS = [
  'iframe',
  'player',
  'embed',
  'video',
  'source',
  'm3u8',
  'jwplayer',
  'hls',
];

const EMBED_BLOCK_MARKERS = [
  'cloudflare',
  'captcha',
  'attention required',
  'access denied',
  'just a moment',
  'forbidden',
  'verify you are human',
];

function looksLikeEmbeddablePage(contentType: string | null, html: string): boolean {
  const normalizedContentType = (contentType || '').toLowerCase();
  const isHtmlLike =
    normalizedContentType === '' ||
    normalizedContentType.includes('text/html') ||
    normalizedContentType.includes('application/xhtml+xml');

  if (!isHtmlLike || !html) {
    return false;
  }

  const hasBlockedMarker = EMBED_BLOCK_MARKERS.some((marker) => html.includes(marker));
  if (hasBlockedMarker) {
    return false;
  }

  const hasHtmlStructure =
    html.includes('<!doctype html') ||
    html.includes('<html') ||
    html.includes('<body');
  const hasEmbedMarker = EMBED_ALLOW_MARKERS.some((marker) => html.includes(marker));

  // Some providers use heavy scripts and hide obvious player markers in initial HTML.
  // Accept non-blocked HTML documents as a fallback signal to avoid over-filtering.
  const hasReasonableHtmlPayload = hasHtmlStructure && html.length > 300;

  return (hasHtmlStructure && hasEmbedMarker) || hasReasonableHtmlPayload;
}

async function isServerWorking(server: StreamServer): Promise<boolean> {
  const now = Date.now();
  const cached = probeCache.get(server.url);
  if (cached && cached.expiresAt > now) {
    return cached.working;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVER_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(server.url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      probeCache.set(server.url, {
        working: false,
        expiresAt: now + SERVER_CHECK_CACHE_TTL_MS,
      });
      return false;
    }

    const text = (await response.text()).slice(0, 30_000).toLowerCase();
    const working = looksLikeEmbeddablePage(response.headers.get('content-type'), text);
    probeCache.set(server.url, {
      working,
      expiresAt: now + SERVER_CHECK_CACHE_TTL_MS,
    });
    return working;
  } catch {
    probeCache.set(server.url, {
      working: false,
      expiresAt: now + SERVER_CHECK_CACHE_TTL_MS,
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function buildServerUrls(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): StreamServer[] {
  const servers: StreamServer[] = [];
  const episodeSuffix = type === 'tv' && season && episode ? `/${season}/${episode}` : '';

  // ZXCSTREAM
  servers.push({
    name: 'ZXCSTREAM',
    url: `https://vidsrc.xyz/embed/${type}/${tmdbId}${episodeSuffix}`,
    color: '#3b82f6', // Blue
  });

  // VIDLINK
  if (type === 'movie') {
    servers.push({
      name: 'VIDLINK',
      url: `https://vidlink.pro/movie/${tmdbId}`,
      color: '#ef4444', // Red
    });
  } else {
    servers.push({
      name: 'VIDLINK',
      url: `https://vidlink.pro/tv/${tmdbId}/${season || 1}/${episode || 1}`,
      color: '#ef4444', // Red
    });
  }

  // FREMBED
  if (type === 'movie') {
    servers.push({
      name: 'FREMBED',
      url: `https://frembed.pro/api/film.php?id=${tmdbId}`,
      color: '#10b981', // Green
    });
  } else {
    servers.push({
      name: 'FREMBED',
      url: `https://frembed.pro/api/serie.php?id=${tmdbId}&sa=${season || 1}&epi=${episode || 1}`,
      color: '#10b981', // Green
    });
  }

  // VIXSRC (Using reliable vidsrc.cc backend)
  servers.push({
    name: 'VIXSRC',
    url: `https://vidsrc.cc/v2/embed/${type}/${tmdbId}${episodeSuffix}`,
    color: '#f97316', // Orange
  });

  // RGSHOWS (Using reliable multiembed backend)
  if (type === 'movie') {
    servers.push({
      name: 'RGSHOWS',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      color: '#8b5cf6', // Purple
    });
  } else {
    servers.push({
      name: 'RGSHOWS',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}`,
      color: '#8b5cf6', // Purple
    });
  }

  // SUPERFLIX (Using vidsrc.xyz backend)
  servers.push({
    name: 'SUPERFLIX',
    url: `https://vidsrc.xyz/embed/${type}/${tmdbId}${episodeSuffix}`,
    color: '#ec4899', // Pink
  });

  // MODOCINE (Using vidsrc.cc backend)
  servers.push({
    name: 'MODOCINE',
    url: `https://vidsrc.cc/v2/embed/${type}/${tmdbId}${episodeSuffix}`,
    color: '#06b6d4', // Cyan
  });

  // 2EMBED (Using multiembed backend)
  if (type === 'movie') {
    servers.push({
      name: '2EMBED',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      color: '#f59e0b', // Yellow
    });
  } else {
    servers.push({
      name: '2EMBED',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}`,
      color: '#f59e0b', // Yellow
    });
  }

  // SMASHYSTREAM
  if (type === 'movie') {
    servers.push({
      name: 'SMASHYSTREAM',
      url: `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}`,
      color: '#8b5cf6', // Purple
    });
  } else {
    servers.push({
      name: 'SMASHYSTREAM',
      url: `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&season=${season || 1}&episode=${episode || 1}`,
      color: '#8b5cf6', // Purple
    });
  }

  return servers;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get('tmdbId');
    const type = searchParams.get('type') as 'movie' | 'tv' | null;
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!tmdbId || !type) {
      return NextResponse.json({ error: 'Missing tmdbId or type' }, { status: 400 });
    }

    if (type !== 'movie' && type !== 'tv') {
      return NextResponse.json({ error: 'Invalid type, must be movie or tv' }, { status: 400 });
    }

    const parsedTmdbId = parseInt(tmdbId, 10);
    if (Number.isNaN(parsedTmdbId) || parsedTmdbId <= 0) {
      return NextResponse.json({ error: 'Invalid tmdbId' }, { status: 400 });
    }

    const servers = buildServerUrls(
      parsedTmdbId,
      type,
      season ? parseInt(season, 10) : undefined,
      episode ? parseInt(episode, 10) : undefined
    );

    const checks = await Promise.all(
      servers.map(async (server) => ({
        server,
        working: await isServerWorking(server),
      }))
    );

    const workingServers = checks
      .filter((check) => check.working)
      .map((check) => check.server);

    console.info(
      `[stream-servers] tmdbId=${parsedTmdbId} type=${type} working=${workingServers.length}/${servers.length}`
    );

    return NextResponse.json({
      servers: workingServers,
      totalCount: servers.length,
      workingCount: workingServers.length,
    });
  } catch (e: any) {
    console.error('Stream servers error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
