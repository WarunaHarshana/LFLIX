import { MemoryCache } from './cache';

const CINEJOY_ENC_DEC_API = 'https://enc-dec.app/api';
const CINEJOY_SHEGU_API = 'https://api.shegu.st';
const CINEJOY_SUBTITLES_API = 'https://subtitles.shegu.st';
const CINEJOY_DOWNLOADS_API = 'https://downloads.shegu.st';

const CINEJOY_HEADERS = {
  Accept: '*/*',
  Origin: 'https://cinejoy.to',
  Referer: 'https://cinejoy.to/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
};

// Known CDN domains for Cinejoy streams & subtitles
const ALLOWED_CDN_DOMAINS = [
  'movieboxnoob.cc',
  'bright67.online',
  'shegu.st',
  'cinejoy.to',
  'strem.io',
  'cloudflarestorage.com',
  'workers.dev',
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
export async function fetchCinejoySubtitles(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<CinejoySubtitle[]> {
  try {
    let url = `${CINEJOY_SUBTITLES_API}/subtitles?type=${type === 'tv' ? 'tv' : 'movie'}&tmdb=${tmdbId}`;
    if (type === 'tv' && season && episode) {
      url += `&season=${season}&episode=${episode}`;
    }

    const res = await fetch(url, {
      headers: CINEJOY_HEADERS,
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.subtitles)) return [];

    const subs: CinejoySubtitle[] = [];
    for (const s of data.subtitles) {
      const subUrl = s.url || s.file || s.id;
      if (typeof subUrl === 'string' && subUrl.startsWith('http')) {
        subs.push({
          label: s.display || s.language || 'English',
          url: `/api/stream-servers/proxy?url=${encodeURIComponent(subUrl)}&sub=1`,
          language: s.language || 'en',
        });
      }
    }

    subs.sort((a, b) => {
      const aEn = a.language?.toLowerCase().startsWith('en');
      const bEn = b.language?.toLowerCase().startsWith('en');
      if (aEn && !bEn) return -1;
      if (!aEn && bEn) return 1;
      return a.label.localeCompare(b.label);
    });

    return subs;
  } catch (err: any) {
    console.warn('[cinejoy] Subtitle query failed:', err?.message || err);
    return [];
  }
}

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
  if (cinejoyCache.has(cacheKey)) {
    return cinejoyCache.get(cacheKey);
  }

  // Fetch subtitles in parallel with stream resolution
  const subtitlesPromise = fetchCinejoySubtitles(tmdbId, type, season, episode);

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
        signal: AbortSignal.timeout(6000),
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
      signal: AbortSignal.timeout(6000),
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
      signal: AbortSignal.timeout(6000),
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

    const externalSubs = await subtitlesPromise;
    const subtitles: CinejoySubtitle[] = [...externalSubs];

    if (Array.isArray(primaryStream.captions)) {
      for (const cap of primaryStream.captions) {
        const subUrl = cap.url || cap.file;
        if (typeof subUrl === 'string') {
          subtitles.push({
            label: cap.label || cap.lang || cap.language || 'English',
            url: `/api/stream-servers/proxy?url=${encodeURIComponent(subUrl)}&sub=1`,
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

export type CinejoyDirectDownload = {
  source: string;
  name: string;
  quality: number;
  qualityLabel: string;
  qualityTags: string[];
  size: string;
  sizeBytes: number;
  url: string;
  provider: string;
};

export function parseDirectDownloadSizeBytes(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)$/i);
  if (!match) return 0;
  const multipliers: Record<string, number> = {
    KB: 1e3,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
  };
  const unit = match[2].toUpperCase();
  return Math.round(parseFloat(match[1]) * (multipliers[unit] ?? 1));
}

export function parseDirectDownloadQualityTags(name: string): string[] {
  const sizeMatch = name.match(/\[(\d+(?:\.\d+)?\s*(?:GB|MB|TB|KB))\]/i);
  const matchedSize = sizeMatch ? sizeMatch[1] : '';
  const tags = [...name.matchAll(/\[([^\]]+)\]/g)]
    .map((m) => m[1])
    .filter((tag) => !matchedSize || tag !== matchedSize)
    .filter((tag) => !/^(\d{3,4}p|4k)$/i.test(tag.trim()));

  const separated: string[] = [];
  for (const tag of tags) {
    const parts = tag.split(/\s+/).filter(Boolean);
    separated.push(...parts);
  }
  return Array.from(new Set(separated));
}

export function getDirectDownloadQualityLabel(quality: number): string {
  if (quality >= 2160) return '4K (2160p)';
  if (quality >= 1440) return '2K (1440p)';
  if (quality >= 1080) return '1080p';
  if (quality >= 720) return '720p';
  if (quality >= 480) return '480p';
  return `${quality}p`;
}

const DOWNLOADS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const cinejoyDownloadsCache = new MemoryCache<CinejoyDirectDownload[]>(1, 100);

export async function fetchCinejoyDirectDownloads(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<CinejoyDirectDownload[]> {
  if (!tmdbId || typeof tmdbId !== 'number' || tmdbId <= 0) {
    return [];
  }

  const cacheKey = mediaType === 'movie'
    ? `dl-movie-${tmdbId}`
    : `dl-tv-${tmdbId}-${season || 1}-${episode || 1}`;

  const cached = cinejoyDownloadsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const endpoint = mediaType === 'movie'
    ? `${CINEJOY_DOWNLOADS_API}/movie/${tmdbId}`
    : `${CINEJOY_DOWNLOADS_API}/tv/${tmdbId}/${season || 1}/${episode || 1}`;

  try {
    const res = await fetch(endpoint, {
      headers: CINEJOY_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 500) {
        cinejoyDownloadsCache.set(cacheKey, [], 60_000);
        return [];
      }
      throw new Error(`Direct downloads request failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawLinks = Array.isArray(data?.links) ? data.links : [];
    if (rawLinks.length === 0) {
      cinejoyDownloadsCache.set(cacheKey, [], 60_000);
      return [];
    }

    const seenUrls = new Set<string>();
    const downloads: CinejoyDirectDownload[] = [];

    for (const link of rawLinks) {
      const url = typeof link.url === 'string' ? link.url.trim() : '';
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);

      registerAllowedCinejoyHost(url);

      const sizeStr = typeof link.size === 'string' ? link.size.trim() : '';
      const sizeBytes = parseDirectDownloadSizeBytes(sizeStr);
      const quality = typeof link.quality === 'number' ? link.quality : 1080;
      const name = typeof link.name === 'string' ? link.name.trim() : '';
      const source = typeof link.source === 'string' ? link.source.trim() : 'Direct';
      const provider = typeof link.provider === 'string' ? link.provider.trim() : '';

      downloads.push({
        source,
        name,
        quality,
        qualityLabel: getDirectDownloadQualityLabel(quality),
        qualityTags: parseDirectDownloadQualityTags(name),
        size: sizeStr,
        sizeBytes,
        url,
        provider,
      });
    }

    // Sort by resolution descending, then file size descending
    downloads.sort((a, b) => b.quality - a.quality || b.sizeBytes - a.sizeBytes);

    cinejoyDownloadsCache.set(cacheKey, downloads, DOWNLOADS_CACHE_TTL_MS);
    return downloads;
  } catch (error: any) {
    console.error(`[cinejoy] Direct downloads fetch failed for ${mediaType} ${tmdbId}:`, error.message || error);
    cinejoyDownloadsCache.set(cacheKey, [], 60_000);
    return [];
  }
}

