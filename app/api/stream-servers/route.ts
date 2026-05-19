import { NextResponse } from 'next/server';
import { streamQualityDb, type StreamQualityValue } from '@/lib/db';

export const dynamic = 'force-dynamic';

type StreamServer = {
  id: string;
  name: string;
  url: string;
  color: string;
  order: number;
  baselineQuality: Exclude<StreamQualityValue, 'unknown'>;
};

type ProbeState = 'cached' | 'fast' | 'deep-pending';

type StreamServerResponse = StreamServer & {
  isReachable: boolean;
  availabilityState: 'reachable' | 'blocked' | 'unreachable';
  probeError: string | null;
  probeCheckedAt: string;
  qualityHint: StreamQualityValue;
  confidence: number;
  probeState: ProbeState;
  lastCheckedAt: string | null;
  latencyMs: number;
};

const BASE_SERVER_CHECK_TIMEOUT_MS = 4500;
const MAX_SERVER_CHECK_TIMEOUT_MS = 10000;
const VPN_SERVER_CHECK_TIMEOUT_MS = 9000;
const MAX_VPN_SERVER_CHECK_TIMEOUT_MS = 18000;
const SERVER_CHECK_CACHE_TTL_MS = 90_000;
const VPN_SERVER_CHECK_CACHE_TTL_MS = 15_000;
const OBSERVATION_STALE_MS = 6 * 60 * 60 * 1000;

type ProbeCacheEntry = {
  working: boolean;
  blocked: boolean;
  htmlSnippet: string;
  checkedAt: number;
  latencyMs: number;
  probeError: string | null;
  expiresAt: number;
};

const probeCache = new Map<string, ProbeCacheEntry>();

const QUALITY_RANK: Record<StreamQualityValue, number> = {
  unknown: 0,
  '720p': 1,
  '1080p': 2,
  '2160p': 3,
};

type ServerRegistryEntry = {
  id: string;
  name: string;
  color: string;
  baselineQuality: Exclude<StreamQualityValue, 'unknown'>;
  buildUrl: (tmdbId: number, type: 'movie' | 'tv', season?: number, episode?: number) => string;
};

const SERVER_REGISTRY: ServerRegistryEntry[] = [
  {
    id: 'zxcstream-1',
    name: 'ZXCSTREAM',
    color: '#3b82f6',
    baselineQuality: '1080p',
    buildUrl: (tmdbId, type, season, episode) =>
      `https://vidsrc.xyz/embed/${type}/${tmdbId}${type === 'tv' ? `/${season || 1}/${episode || 1}` : ''}`,
  },
  {
    id: 'vidlink',
    name: 'VIDLINK',
    color: '#ef4444',
    baselineQuality: '2160p',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://vidlink.pro/movie/${tmdbId}`
        : `https://vidlink.pro/tv/${tmdbId}/${season || 1}/${episode || 1}`,
  },
  {
    id: 'frembed',
    name: 'FREMBED',
    color: '#10b981',
    baselineQuality: '1080p',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://frembed.pro/api/film.php?id=${tmdbId}`
        : `https://frembed.pro/api/serie.php?id=${tmdbId}&sa=${season || 1}&epi=${episode || 1}`,
  },
  {
    id: 'vixsrc',
    name: 'VIXSRC',
    color: '#f97316',
    baselineQuality: '1080p',
    buildUrl: (tmdbId, type, season, episode) =>
      `https://vidsrc.cc/v2/embed/${type}/${tmdbId}${type === 'tv' ? `/${season || 1}/${episode || 1}` : ''}`,
  },
  {
    id: 'rgshows',
    name: 'RGSHOWS',
    color: '#8b5cf6',
    baselineQuality: '2160p',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`
        : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}`,
  },
  {
    id: 'superflix',
    name: 'SUPERFLIX',
    color: '#ec4899',
    baselineQuality: '1080p',
    buildUrl: (tmdbId, type, season, episode) =>
      `https://vidsrc.xyz/embed/${type}/${tmdbId}${type === 'tv' ? `/${season || 1}/${episode || 1}` : ''}`,
  },
  {
    id: 'modocine',
    name: 'MODOCINE',
    color: '#06b6d4',
    baselineQuality: '1080p',
    buildUrl: (tmdbId, type, season, episode) =>
      `https://vidsrc.cc/v2/embed/${type}/${tmdbId}${type === 'tv' ? `/${season || 1}/${episode || 1}` : ''}`,
  },
  {
    id: 'zxcstream-2',
    name: 'ZXCSTREAM',
    color: '#60a5fa',
    baselineQuality: '720p',
    buildUrl: (tmdbId, type, season, episode) =>
      `https://vidsrc.me/embed/${type}/${tmdbId}${type === 'tv' ? `/${season || 1}/${episode || 1}` : ''}`,
  },
  {
    id: 'vidsrcme-ru',
    name: 'VIDSRCME',
    color: '#22d3ee',
    baselineQuality: '1080p',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://vidsrc-embed.ru/embed/movie/${tmdbId}`
        : `https://vidsrc-embed.ru/embed/tv/${tmdbId}/${season || 1}-${episode || 1}`,
  },
  {
    id: '2embed',
    name: '2EMBED',
    color: '#f59e0b',
    baselineQuality: '1080p',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`
        : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}`,
  },
  {
    id: 'smashystream',
    name: 'SMASHYSTREAM',
    color: '#a855f7',
    baselineQuality: '1080p',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}`
        : `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&season=${season || 1}&episode=${episode || 1}`,
  },
];

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
  'checking your browser',
  'checking connection security',
  'request blocked',
  'enable javascript and cookies',
  'waf',
  'cf-browser-verification',
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

function hasBlockedMarker(html: string): boolean {
  return EMBED_BLOCK_MARKERS.some((marker) => html.includes(marker));
}

function normalizeConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function detectQualityFromHtml(htmlSnippet: string): { quality: StreamQualityValue; confidence: number } {
  const html = htmlSnippet.toLowerCase();
  if (!html) {
    return { quality: 'unknown', confidence: 0.2 };
  }

  const m3u8Matches = [...html.matchAll(/resolution\s*=\s*(\d+)x(\d+)/gi)];
  if (m3u8Matches.length > 0) {
    let maxHeight = 0;
    for (const match of m3u8Matches) {
      const height = Number.parseInt(match[2], 10);
      if (!Number.isNaN(height) && height > maxHeight) {
        maxHeight = height;
      }
    }

    if (maxHeight >= 1800) {
      return { quality: '2160p', confidence: 0.95 };
    }
    if (maxHeight >= 900) {
      return { quality: '1080p', confidence: 0.9 };
    }
    if (maxHeight >= 600) {
      return { quality: '720p', confidence: 0.85 };
    }
  }

  if (/2160|4k|uhd|3840x2160/.test(html)) {
    return { quality: '2160p', confidence: 0.85 };
  }
  if (/1080|full\s*hd|1920x1080|fhd/.test(html)) {
    return { quality: '1080p', confidence: 0.78 };
  }
  if (/720|1280x720|hd/.test(html)) {
    return { quality: '720p', confidence: 0.7 };
  }

  return { quality: 'unknown', confidence: 0.35 };
}

function inferFastQuality(server: StreamServer): { quality: StreamQualityValue; confidence: number } {
  if (/4k|2160/.test(server.url.toLowerCase())) {
    return { quality: '2160p', confidence: 0.7 };
  }

  return {
    quality: server.baselineQuality,
    confidence: server.baselineQuality === '2160p' ? 0.58 : 0.5,
  };
}

function isObservationStale(checkedAt: string): boolean {
  const timestamp = Date.parse(checkedAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > OBSERVATION_STALE_MS;
}

function pickBestQualityCandidate(
  cached: { maxQuality: StreamQualityValue; confidence: number; checkedAt: string } | null,
  fast: { quality: StreamQualityValue; confidence: number }
): {
  qualityHint: StreamQualityValue;
  confidence: number;
  probeState: ProbeState;
  lastCheckedAt: string | null;
  shouldDeepProbe: boolean;
} {
  if (cached && !isObservationStale(cached.checkedAt)) {
    return {
      qualityHint: cached.maxQuality,
      confidence: normalizeConfidence(cached.confidence),
      probeState: 'cached',
      lastCheckedAt: cached.checkedAt,
      shouldDeepProbe: false,
    };
  }

  if (cached) {
    const cachedRank = QUALITY_RANK[cached.maxQuality] ?? 0;
    const fastRank = QUALITY_RANK[fast.quality] ?? 0;
    if (cachedRank >= fastRank) {
      return {
        qualityHint: cached.maxQuality,
        confidence: normalizeConfidence(Math.max(cached.confidence * 0.9, fast.confidence)),
        probeState: 'deep-pending',
        lastCheckedAt: cached.checkedAt,
        shouldDeepProbe: true,
      };
    }
  }

  return {
    qualityHint: fast.quality,
    confidence: normalizeConfidence(fast.confidence),
    probeState: 'deep-pending',
    lastCheckedAt: cached?.checkedAt || null,
    shouldDeepProbe: true,
  };
}

function getQualityRank(value: StreamQualityValue): number {
  return QUALITY_RANK[value] ?? 0;
}

async function isServerWorking(
  server: StreamServer,
  options: { vpnMode?: boolean; refresh?: boolean } = {}
): Promise<ProbeCacheEntry> {
  const now = Date.now();
  const cacheKey = `${options.vpnMode ? 'vpn' : 'standard'}:${server.url}`;
  const cached = probeCache.get(cacheKey);
  if (!options.refresh && cached && cached.expiresAt > now) {
    return cached;
  }

  const baseTimeoutMs = options.vpnMode ? VPN_SERVER_CHECK_TIMEOUT_MS : BASE_SERVER_CHECK_TIMEOUT_MS;
  const maxTimeoutMs = options.vpnMode ? MAX_VPN_SERVER_CHECK_TIMEOUT_MS : MAX_SERVER_CHECK_TIMEOUT_MS;
  const cacheTtlMs = options.vpnMode ? VPN_SERVER_CHECK_CACHE_TTL_MS : SERVER_CHECK_CACHE_TTL_MS;
  const adaptiveTimeoutMs = cached
    ? Math.min(
        maxTimeoutMs,
        Math.max(baseTimeoutMs, Math.round(cached.latencyMs * (options.vpnMode ? 3 : 2.2)))
      )
    : baseTimeoutMs;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), adaptiveTimeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(server.url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      const entry = {
        working: false,
        blocked: response.status === 401 || response.status === 403 || response.status === 429,
        htmlSnippet: '',
        checkedAt: now,
        latencyMs: Date.now() - startedAt,
        probeError: `http_${response.status}`,
        expiresAt: now + cacheTtlMs,
      };
      probeCache.set(cacheKey, entry);
      return entry;
    }

    const text = (await response.text()).slice(0, 30_000).toLowerCase();
    const blocked = hasBlockedMarker(text);
    const working = looksLikeEmbeddablePage(response.headers.get('content-type'), text);
    const entry = {
      working,
      blocked,
      htmlSnippet: text,
      checkedAt: now,
      latencyMs: Date.now() - startedAt,
      probeError: blocked ? 'blocked_page' : null,
      expiresAt: now + cacheTtlMs,
    };
    probeCache.set(cacheKey, entry);
    return entry;
  } catch {
    const entry = {
      working: false,
      blocked: false,
      htmlSnippet: '',
      checkedAt: now,
      latencyMs: adaptiveTimeoutMs,
      probeError: 'network_error',
      expiresAt: now + cacheTtlMs,
    };
    probeCache.set(cacheKey, entry);
    return entry;
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
  return SERVER_REGISTRY.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    url: entry.buildUrl(tmdbId, type, season, episode),
    color: entry.color,
    order: index,
    baselineQuality: entry.baselineQuality,
  }));
}

function startDeepProbeForServer(
  server: StreamServer,
  tmdbId: number,
  type: 'movie' | 'tv',
  season: number | undefined,
  episode: number | undefined,
  htmlSnippet: string
) {
  // Fire-and-forget: enrich quality cache without delaying response.
  void Promise.resolve().then(() => {
    const deepQuality = detectQualityFromHtml(htmlSnippet);
    if (deepQuality.quality === 'unknown' && deepQuality.confidence < 0.5) {
      return;
    }

    try {
      streamQualityDb.upsertObservation({
        serverId: server.id,
        tmdbId,
        mediaType: type,
        seasonNumber: season,
        episodeNumber: episode,
        maxQuality: deepQuality.quality,
        confidence: normalizeConfidence(deepQuality.confidence),
        source: 'deep',
      });
    } catch (error) {
      console.warn(`[stream-servers] deep-probe-cache-failed server=${server.id}`, error);
    }
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get('tmdbId');
    const type = searchParams.get('type') as 'movie' | 'tv' | null;
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');
    const vpnMode = searchParams.get('vpn') === '1' || searchParams.get('networkMode') === 'vpn';
    const refreshProbe = searchParams.get('refresh') === '1' || vpnMode;

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
        probe: await isServerWorking(server, { vpnMode, refresh: refreshProbe }),
      }))
    );

    const responseServers: StreamServerResponse[] = [];
    for (const check of checks) {
      const cachedObservation = streamQualityDb.getObservation({
        serverId: check.server.id,
        tmdbId: parsedTmdbId,
        mediaType: type,
        seasonNumber: season ? parseInt(season, 10) : 0,
        episodeNumber: episode ? parseInt(episode, 10) : 0,
      });

      const fastQuality = inferFastQuality(check.server);
      const qualityDecision = pickBestQualityCandidate(
        cachedObservation
          ? {
              maxQuality: cachedObservation.maxQuality,
              confidence: cachedObservation.confidence,
              checkedAt: cachedObservation.checkedAt,
            }
          : null,
        fastQuality
      );

      if (!cachedObservation) {
        try {
          streamQualityDb.upsertObservation({
            serverId: check.server.id,
            tmdbId: parsedTmdbId,
            mediaType: type,
            seasonNumber: season ? parseInt(season, 10) : undefined,
            episodeNumber: episode ? parseInt(episode, 10) : undefined,
            maxQuality: qualityDecision.qualityHint,
            confidence: qualityDecision.confidence,
            source: 'fast',
          });
        } catch (error) {
          console.warn(`[stream-servers] fast-cache-upsert-failed server=${check.server.id}`, error);
        }
      }

      if (check.probe.working && qualityDecision.shouldDeepProbe) {
        startDeepProbeForServer(
          check.server,
          parsedTmdbId,
          type,
          season ? parseInt(season, 10) : undefined,
          episode ? parseInt(episode, 10) : undefined,
          check.probe.htmlSnippet
        );
      }

      responseServers.push({
        ...check.server,
        isReachable: check.probe.working,
        availabilityState: check.probe.working
          ? 'reachable'
          : check.probe.blocked
            ? 'blocked'
            : 'unreachable',
        probeError: check.probe.probeError,
        probeCheckedAt: new Date(check.probe.checkedAt).toISOString(),
        qualityHint: qualityDecision.qualityHint,
        confidence: qualityDecision.confidence,
        probeState: qualityDecision.probeState,
        lastCheckedAt: qualityDecision.lastCheckedAt,
        latencyMs: check.probe.latencyMs,
      });
    }

    responseServers.sort((a, b) => {
      const qualityDiff = getQualityRank(b.qualityHint) - getQualityRank(a.qualityHint);
      if (qualityDiff !== 0) {
        return qualityDiff;
      }

      const reachableDiff = Number(b.isReachable) - Number(a.isReachable);
      if (reachableDiff !== 0) {
        return reachableDiff;
      }

      const latencyA = Number.isFinite(a.latencyMs) ? a.latencyMs : Number.MAX_SAFE_INTEGER;
      const latencyB = Number.isFinite(b.latencyMs) ? b.latencyMs : Number.MAX_SAFE_INTEGER;
      if (latencyA !== latencyB) {
        return latencyA - latencyB;
      }

      if (Math.abs(b.confidence - a.confidence) > 0.01) {
        return b.confidence - a.confidence;
      }

      return a.order - b.order;
    });

    const workingCount = checks.filter((check) => check.probe.working).length;
    const bestServerIndex = responseServers.length > 0 ? 0 : -1;

    console.info(
      `[stream-servers] tmdbId=${parsedTmdbId} type=${type} network=${vpnMode ? 'vpn' : 'standard'} reachable=${workingCount}/${servers.length}`
    );

    return NextResponse.json({
      servers: responseServers,
      totalCount: servers.length,
      workingCount,
      bestServerIndex,
      qualityMode: 'hybrid',
      filterMode: vpnMode ? 'vpn-friendly' : 'all',
      networkMode: vpnMode ? 'vpn' : 'standard',
      probeCacheTtlMs: vpnMode ? VPN_SERVER_CHECK_CACHE_TTL_MS : SERVER_CHECK_CACHE_TTL_MS,
    });
  } catch (e: any) {
    console.error('Stream servers error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
