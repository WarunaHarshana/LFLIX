import { MemoryCache } from './cache';

const CINEJOY_ENC_DEC_API = 'https://enc-dec.app/api';
const CINEJOY_SHEGU_API = 'https://api.shegu.st';

const CINEJOY_HEADERS = {
  Accept: '*/*',
  Origin: 'https://cinejoy.to',
  Referer: 'https://cinejoy.to/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
};

// Known CDN domains for Cinejoy streams
const ALLOWED_CDN_DOMAINS = [
  'movieboxnoob.cc',
  'bright67.online',
  'shegu.st',
  'cinejoy.to',
];

// In-memory set of dynamically resolved stream hostnames for the proxy
const dynamicAllowedHosts = new Set<string>();

export function isAllowedCinejoyHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim();
  if (dynamicAllowedHosts.has(normalized)) {
    return true;
  }
  return ALLOWED_CDN_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

export function registerAllowedCinejoyHost(hostname: string): void {
  try {
    const parsed = new URL(hostname.startsWith('http') ? hostname : `https://${hostname}`).hostname;
    dynamicAllowedHosts.add(parsed.toLowerCase());
  } catch {
    // Ignore invalid url
  }
}

export type CinejoySubtitle = {
  label: string;
  url: string;
  language?: string;
};

export type CinejoyResolvedStream = {
  id: string;
  name: string;
  url: string;
  qualityHint: '2160p' | '1080p' | '720p';
  subtitles: CinejoySubtitle[];
  serverName: string;
};

export type CinejoyQueryParams = {
  tmdbId: number;
  imdbId?: string | null;
  title: string;
  year?: string | number | null;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  server?: string; // e.g. 'Lisbon' | 'Nebula'
};

const STREAM_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const cinejoyCache = new MemoryCache<CinejoyResolvedStream | null>(1, 100);

/**
 * Rewrites URLs in an HLS m3u8 playlist to route through the local proxy.
 */
export function rewriteM3u8Playlist(
  content: string,
  manifestUrl: string,
  proxyEndpoint = '/api/stream-servers/proxy'
): string {
  const lines = content.split('\n');
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Handle tags with URI attributes (e.g. #EXT-X-MEDIA, #EXT-X-MAP)
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
          const absolute = new URL(uri, manifestUrl).href;
          registerAllowedCinejoyHost(absolute);
          return `URI="${proxyEndpoint}?url=${encodeURIComponent(absolute)}"`;
        });
      }

      // Media chunk or child playlist URL
      try {
        const absolute = new URL(trimmed, manifestUrl).href;
        registerAllowedCinejoyHost(absolute);
        return `${proxyEndpoint}?url=${encodeURIComponent(absolute)}`;
      } catch {
        return line;
      }
    })
    .join('\n');
}

/**
 * Resolves a direct HLS stream from Cinejoy API.
 */
export async function resolveCinejoyStream(
  params: CinejoyQueryParams
): Promise<CinejoyResolvedStream | null> {
  const {
    tmdbId,
    imdbId,
    title,
    year,
    type,
    season,
    episode,
    server = 'Lisbon',
  } = params;

  const cacheKey = `cinejoy:${server}:${type}:${tmdbId}:${season ?? 1}:${episode ?? 1}`;
  const cached = cinejoyCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const isTv = type === 'tv';
    const cType = isTv ? 'series' : 'movie';
    let targetUrl = `${CINEJOY_SHEGU_API}/?title=${encodeURIComponent(title)}&type=${cType}&tmdb=${tmdbId}&server=${server}`;

    if (year) {
      targetUrl += `&year=${year}`;
    }
    if (imdbId) {
      targetUrl += `&imdb=${encodeURIComponent(imdbId)}`;
    }
    if (isTv) {
      targetUrl += `&season=${season ?? 1}&episode=${episode ?? 1}`;
    }

    // 1. Get encryption signature & state
    const encRes = await fetch(
      `${CINEJOY_ENC_DEC_API}/enc-cinejoy?url=${encodeURIComponent(targetUrl)}`,
      {
        signal: AbortSignal.timeout(3500),
      }
    );

    if (!encRes.ok) {
      console.warn(`[cinejoy] enc-cinejoy returned ${encRes.status}`);
      cinejoyCache.set(cacheKey, null, 60_000);
      return null;
    }

    const encJson = await encRes.json();
    if (encJson.status !== 200 || !encJson.result?.data) {
      console.warn('[cinejoy] enc-cinejoy payload invalid:', encJson);
      cinejoyCache.set(cacheKey, null, 60_000);
      return null;
    }

    const { data, state } = encJson.result;

    // 2. Fetch encrypted payload from shegu backend
    const gRes = await fetch(`${CINEJOY_SHEGU_API}/g`, {
      method: 'POST',
      body: Buffer.from(data, 'base64url'),
      headers: CINEJOY_HEADERS,
      signal: AbortSignal.timeout(3500),
    });

    if (!gRes.ok) {
      console.warn(`[cinejoy] shegu.st/g returned ${gRes.status}`);
      cinejoyCache.set(cacheKey, null, 60_000);
      return null;
    }

    const gBuffer = Buffer.from(await gRes.arrayBuffer());

    // 3. Decrypt into structured JSON
    const decRes = await fetch(`${CINEJOY_ENC_DEC_API}/dec-cinejoy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: gBuffer.toString('base64url'),
        state,
      }),
      signal: AbortSignal.timeout(3500),
    });

    if (!decRes.ok) {
      console.warn(`[cinejoy] dec-cinejoy returned ${decRes.status}`);
      cinejoyCache.set(cacheKey, null, 60_000);
      return null;
    }

    const decJson = await decRes.json();
    if (decJson.status !== 200 || !decJson.result?.data?.stream) {
      console.warn('[cinejoy] dec-cinejoy returned no stream:', decJson);
      cinejoyCache.set(cacheKey, null, 60_000);
      return null;
    }

    const streams = decJson.result.data.stream;
    const primaryStream = Array.isArray(streams) ? streams[0] : null;
    if (!primaryStream || typeof primaryStream.playlist !== 'string') {
      cinejoyCache.set(cacheKey, null, 60_000);
      return null;
    }

    const rawPlaylistUrl = primaryStream.playlist;
    registerAllowedCinejoyHost(rawPlaylistUrl);

    // Route playlist through local proxy
    const proxiedUrl = `/api/stream-servers/proxy?url=${encodeURIComponent(rawPlaylistUrl)}`;

    const subtitles: CinejoySubtitle[] = [];
    if (Array.isArray(primaryStream.captions)) {
      for (const cap of primaryStream.captions) {
        const subUrl = cap.url || cap.file;
        if (typeof subUrl === 'string') {
          subtitles.push({
            label: cap.label || cap.lang || cap.language || 'English',
            url: subUrl,
            language: cap.lang || cap.language || 'en',
          });
        }
      }
    }

    const is4K = server === 'Lisbon';
    const qualityHint = is4K ? '2160p' : '1080p';
    const displayName = is4K ? `Cinejoy (${server} 4K)` : `Cinejoy (${server})`;

    const result: CinejoyResolvedStream = {
      id: `cinejoy-${server.toLowerCase()}`,
      name: displayName,
      url: proxiedUrl,
      qualityHint,
      subtitles,
      serverName: server,
    };

    cinejoyCache.set(cacheKey, result, STREAM_CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    console.error(`[cinejoy] Stream resolution failed for server ${server}:`, error.message || error);
    cinejoyCache.set(cacheKey, null, 60_000);
    return null;
  }
}
