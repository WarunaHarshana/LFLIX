import { NextResponse } from 'next/server';
import { streamQualityDb, type StreamQualityValue } from '@/lib/db';
import { cachedTmdbCall, getTmdbClient } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

type StreamServer = {
  id: string;
  name: string;
  url: string;
  color: string;
  order: number;
  baselineQuality: Exclude<StreamQualityValue, 'unknown'>;
  tier?: 'best' | 'great' | 'good' | 'ok';
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
  isDirect?: boolean;
  directSubtitles?: { label: string; url: string; language?: string }[];
};

const BASE_SERVER_CHECK_TIMEOUT_MS = 4500;
const MAX_SERVER_CHECK_TIMEOUT_MS = 10000;
const VPN_SERVER_CHECK_TIMEOUT_MS = 9000;
const MAX_VPN_SERVER_CHECK_TIMEOUT_MS = 18000;
const SERVER_CHECK_CACHE_TTL_MS = 90_000;
const VPN_SERVER_CHECK_CACHE_TTL_MS = 5_000;
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
  tier?: 'best' | 'great' | 'good' | 'ok';
  buildUrl: (tmdbId: number, type: 'movie' | 'tv', season?: number, episode?: number) => string;
};

const SERVER_REGISTRY: ServerRegistryEntry[] = [
  {
    id: 'vidsrc-wtf',
    name: 'VIDSRC WTF',
    color: '#ef4444',
    baselineQuality: '1080p',
    tier: 'best',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://vidsrc.wtf/1/movie/${tmdbId}`
        : `https://vidsrc.wtf/1/tv/${tmdbId}/${season || 1}/${episode || 1}`,
  },
  {
    id: 'flux',
    name: 'FLUX',
    color: '#a855f7',
    baselineQuality: '1080p',
    tier: 'best',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://beta.player.fluxtv.cc/player?type=movie&id=${tmdbId}`
        : `https://beta.player.fluxtv.cc/player?type=tv&id=${tmdbId}&season=${season || 1}&episode=${episode || 1}`,
  },
  {
    id: 'vidlink',
    name: 'VIDLINK',
    color: '#ef4444',
    baselineQuality: '2160p',
    tier: 'great',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://vidlink.pro/movie/${tmdbId}`
        : `https://vidlink.pro/tv/${tmdbId}/${season || 1}/${episode || 1}`,
  },
  {
    id: 'vidsrc-to',
    name: 'VIDSRC TO',
    color: '#3b82f6',
    baselineQuality: '1080p',
    tier: 'great',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://vidsrc.to/embed/movie/${tmdbId}`
        : `https://vidsrc.to/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`,
  },
  {
    id: 'autoembed',
    name: 'AUTOEMBED',
    color: '#f43f5e',
    baselineQuality: '1080p',
    tier: 'great',
    buildUrl: (tmdbId, type, season, episode) =>
      type === 'movie'
        ? `https://autoembed.cc/embed/movie/${tmdbId}`
        : `https://autoembed.cc/embed/tv/${tmdbId}/${season || 1}/${episode || 1}`,
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
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

// IMDB ID cache for SmashyStream (TMDB ID -> IMDB ID)
const imdbIdCache = new Map<string, { imdbId: string | null; expiresAt: number }>();
const IMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function resolveImdbId(tmdbId: number, type: 'movie' | 'tv'): Promise<string | null> {
  const cacheKey = `${type}-${tmdbId}`;
  const cached = imdbIdCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.imdbId;
  }

  try {
    const moviedb = getTmdbClient();
    const externalIds = await cachedTmdbCall(`${type}-external-ids-${tmdbId}`, () =>
      type === 'movie'
        ? moviedb.movieExternalIds({ id: tmdbId })
        : moviedb.tvExternalIds({ id: tmdbId })
    );
    const imdbId = (externalIds as any).imdb_id || null;
    imdbIdCache.set(cacheKey, { imdbId, expiresAt: Date.now() + IMDB_CACHE_TTL_MS });
    return imdbId;
  } catch (error) {
    console.warn(`[stream-servers] Failed to resolve IMDB ID for ${type}/${tmdbId}:`, error);
    imdbIdCache.set(cacheKey, { imdbId: null, expiresAt: Date.now() + 5 * 60 * 1000 }); // cache failure for 5 min
    return null;
  }
}

async function buildServerUrls(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<StreamServer[]> {
  // Resolve IMDB ID in background for SmashyStream
  const imdbId = await resolveImdbId(tmdbId, type).catch(() => null);

  const smashyEntry: ServerRegistryEntry | null = imdbId
    ? {
        id: 'smashystream',
        name: 'SMASHYSTREAM',
        color: '#facc15',
        baselineQuality: '1080p',
        tier: 'great',
        buildUrl: (_tmdbId, t, s, e) =>
          t === 'movie'
            ? `https://player.smashy.stream/movie/${imdbId}`
            : `https://player.smashy.stream/tv/${imdbId}?s=${s || 1}&e=${e || 1}`,
      }
    : null;

  const registry = smashyEntry ? [...SERVER_REGISTRY, smashyEntry] : SERVER_REGISTRY;

  return registry.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    url: entry.buildUrl(tmdbId, type, season, episode),
    color: entry.color,
    order: index,
    baselineQuality: entry.baselineQuality,
    tier: entry.tier || 'ok',
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

    const servers = await buildServerUrls(
      parsedTmdbId,
      type,
      season ? parseInt(season, 10) : undefined,
      episode ? parseInt(episode, 10) : undefined
    );

    const checks = vpnMode
      ? servers.map((server) => ({
          server,
          probe: {
            working: true,
            blocked: false,
            htmlSnippet: '',
            checkedAt: Date.now(),
            latencyMs: 0,
            probeError: null,
            expiresAt: Date.now() + VPN_SERVER_CHECK_CACHE_TTL_MS,
          } as ProbeCacheEntry,
        }))
      : await Promise.all(
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

    const coorenApiUrl = process.env.COOREN_API_URL;
    if (coorenApiUrl) {
      try {
        const coorenType = type === 'movie' ? 'movie' : 'tv';
        const url = coorenType === 'movie'
          ? `${coorenApiUrl}/movie-tv/primesrc/movie/${parsedTmdbId}`
          : `${coorenApiUrl}/movie-tv/primesrc/tv/${parsedTmdbId}/${season || 1}/${episode || 1}`;

        console.info(`[stream-servers] Querying PrimeSrc: ${url}`);
        const primeSrcRes = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(3500),
        });

        if (primeSrcRes.ok) {
          const result = await primeSrcRes.json();
          if (result.success && Array.isArray(result.data)) {
            for (const host of result.data) {
              if (Array.isArray(host.sources) && host.sources.length > 0) {
                const sourceItem = host.sources.find((s: any) => typeof s.url === 'string' || typeof s.file === 'string');
                if (sourceItem) {
                  const videoUrl = sourceItem.url || sourceItem.file;
                  const label = sourceItem.label || sourceItem.quality || '1080p';
                  let qualityHint: StreamQualityValue = '1080p';
                  if (/2160|4k|uhd/i.test(label)) {
                    qualityHint = '2160p';
                  } else if (/720|hd/i.test(label)) {
                    qualityHint = '720p';
                  }

                  const directSubtitles: { label: string; url: string; language?: string }[] = [];
                  if (Array.isArray(host.subtitles)) {
                    for (const sub of host.subtitles) {
                      const subUrl = sub.url || sub.file;
                      if (typeof subUrl === 'string') {
                        directSubtitles.push({
                          label: sub.label || sub.lang || sub.language || 'English',
                          url: subUrl,
                          language: sub.lang || sub.language || 'en',
                        });
                      }
                    }
                  }

                  responseServers.push({
                    id: `primesrc-${host.name.toLowerCase()}`,
                    name: `PrimeSrc (${host.name})`,
                    url: videoUrl,
                    color: host.name.toLowerCase() === 'primevid' ? '#3b82f6' : host.name.toLowerCase() === 'streamtape' ? '#10b981' : '#ec4899',
                    order: -100, // Put them first
                    baselineQuality: '1080p',
                    isReachable: true,
                    availabilityState: 'reachable',
                    probeError: null,
                    probeCheckedAt: new Date().toISOString(),
                    qualityHint,
                    confidence: 1.0,
                    probeState: 'cached',
                    lastCheckedAt: new Date().toISOString(),
                    latencyMs: 50,
                    isDirect: true,
                    directSubtitles,
                  });
                }
              }
            }
          }
        } else {
          console.warn(`[stream-servers] PrimeSrc returned status ${primeSrcRes.status}`);
        }
      } catch (error: any) {
        console.error('[stream-servers] PrimeSrc query failed:', error.message || error);
      }
    }

    // SuperEmbed (seapi.link) — direct HLS stream source
    try {
      const seType = type === 'movie' ? 'movie' : 'tv';
      const seUrl = seType === 'movie'
        ? `https://seapi.link/?type=tmdb&id=${parsedTmdbId}&max_results=1`
        : `https://seapi.link/?type=tmdb&id=${parsedTmdbId}&season=${season || 1}&episode=${episode || 1}&max_results=1`;

      const seRes = await fetch(seUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });

      if (seRes.ok) {
        const seData = await seRes.json();
        const results = Array.isArray(seData) ? seData : (seData?.results || []);
        for (const result of results) {
          const videoUrl = result.url || result.file || result.link;
          if (typeof videoUrl !== 'string') continue;

          const label = result.quality || result.label || '1080p';
          let qualityHint: StreamQualityValue = '1080p';
          if (/2160|4k|uhd/i.test(label)) qualityHint = '2160p';
          else if (/720/i.test(label)) qualityHint = '720p';

          const directSubtitles: { label: string; url: string; language?: string }[] = [];
          if (Array.isArray(result.subtitles)) {
            for (const sub of result.subtitles) {
              const subUrl = sub.url || sub.file;
              if (typeof subUrl === 'string') {
                directSubtitles.push({
                  label: sub.label || sub.lang || 'English',
                  url: subUrl,
                  language: sub.lang || sub.language || 'en',
                });
              }
            }
          }

          responseServers.push({
            id: `superembed-${results.indexOf(result)}`,
            name: `SuperEmbed${result.server ? ` (${result.server})` : ''}`,
            url: videoUrl,
            color: '#22d3ee',
            order: -90,
            baselineQuality: '1080p',
            isReachable: true,
            availabilityState: 'reachable',
            probeError: null,
            probeCheckedAt: new Date().toISOString(),
            qualityHint,
            confidence: 0.9,
            probeState: 'cached',
            lastCheckedAt: new Date().toISOString(),
            latencyMs: 50,
            isDirect: true,
            directSubtitles,
          });
        }
      }
    } catch (error: any) {
      console.error('[stream-servers] SuperEmbed query failed:', error.message || error);
    }

    const TIER_RANK: Record<string, number> = {
      best: 4,
      great: 3,
      good: 2,
      ok: 1,
    };

    responseServers.sort((a, b) => {
      // 1. Quality Resolution (highest quality first)
      const qualityDiff = getQualityRank(b.qualityHint) - getQualityRank(a.qualityHint);
      if (qualityDiff !== 0) {
        return qualityDiff;
      }

      // 2. Reachability (reachable first)
      const reachableDiff = Number(b.isReachable) - Number(a.isReachable);
      if (reachableDiff !== 0) {
        return reachableDiff;
      }

      // 3. Direct Streams (direct first)
      if (a.isDirect !== b.isDirect) {
        if (a.isDirect && a.isReachable) return -1;
        if (b.isDirect && b.isReachable) return 1;
      }

      // 4. Source Tier (best > great > good > ok)
      const tierRankA = a.tier ? (TIER_RANK[a.tier] ?? 1) : 1;
      const tierRankB = b.tier ? (TIER_RANK[b.tier] ?? 1) : 1;
      if (tierRankB !== tierRankA) {
        return tierRankB - tierRankA;
      }

      // 5. Latency (lower latency first)
      const latencyA = Number.isFinite(a.latencyMs) ? a.latencyMs : Number.MAX_SAFE_INTEGER;
      const latencyB = Number.isFinite(b.latencyMs) ? b.latencyMs : Number.MAX_SAFE_INTEGER;
      if (latencyA !== latencyB) {
        return latencyA - latencyB;
      }

      return a.order - b.order;
    });

    const directWorkingCount = responseServers.filter(s => s.isDirect && s.isReachable).length;
    const workingCount = checks.filter((check) => check.probe.working).length + directWorkingCount;
    const directTotalCount = responseServers.filter(s => s.isDirect).length;
    const totalCount = servers.length + directTotalCount;
    const bestServerIndex = responseServers.length > 0 ? 0 : -1;

    console.info(
      `[stream-servers] tmdbId=${parsedTmdbId} type=${type} network=${vpnMode ? 'vpn' : 'standard'} reachable=${workingCount}/${totalCount}`
    );

    return NextResponse.json({
      servers: responseServers,
      totalCount,
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
