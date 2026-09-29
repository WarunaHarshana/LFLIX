import crypto from 'crypto';
import { MemoryCache } from './cache';

const CINEJOY_ENC_DEC_API = 'https://enc-dec.app/api';
const CINEJOY_SHEGU_APIS = ['https://api.wing.st', 'https://api.shegu.st'];
const CINEJOY_SUBTITLES_APIS = ['https://subtitles.wing.st', 'https://subtitles.shegu.st'];
const CINEJOY_DOWNLOADS_APIS = ['https://downloads.wing.st', 'https://downloads.shegu.st'];

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
  'wing.st',
  'cinejoy.to',
  'cinejoy.pk',
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

let wasmModulePromise: Promise<WebAssembly.Module> | null = null;

/**
 * Caches and retrieves compiled crush.wasm module from memory.
 */
export async function getCinejoyWasmModule(): Promise<WebAssembly.Module> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      let lastErr: any;
      for (const apiHost of CINEJOY_SHEGU_APIS) {
        try {
          const res = await fetch(`${apiHost}/crush.wasm`, {
            headers: CINEJOY_HEADERS,
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const bytes = await res.arrayBuffer();
            return await WebAssembly.compile(bytes);
          }
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('Failed to fetch crush.wasm from all endpoints');
    })().catch((err) => {
      wasmModulePromise = null;
      throw err;
    });
  }
  return wasmModulePromise;
}

/**
 * Decrypts Shegu payload using AES-256-GCM natively in Node.js.
 */
export function decryptSheguPayload(
  encryptedBuffer: Buffer,
  responseKey: Buffer,
  keyId: number,
  ephemeralPublic: Buffer
): any {
  if (encryptedBuffer.length < 28) {
    throw new Error('Encrypted payload too short for AES-GCM (minimum 28 bytes required)');
  }
  const iv = encryptedBuffer.subarray(0, 12);
  const tag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const ciphertext = encryptedBuffer.subarray(12, encryptedBuffer.length - 16);
  const aad = Buffer.concat([
    Buffer.from('lumen-gate-v2', 'utf8'),
    Buffer.from([0, 2, keyId]),
    ephemeralPublic,
  ]);

  const decipher = crypto.createDecipheriv('aes-256-gcm', responseKey, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(aad);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function resolveViaLocalWasm(
  server: string,
  type: 'movie' | 'tv',
  tmdbId: number,
  title: string,
  year?: string | number | null,
  imdbId?: string | null,
  season?: number,
  episode?: number
): Promise<any> {
  const wasmModule = await getCinejoyWasmModule();
  const instance = await WebAssembly.instantiate(wasmModule);
  const { memory, alloc, seal_request } = instance.exports as {
    memory: WebAssembly.Memory;
    alloc: (len: number) => number;
    seal_request: (
      pathPtr: number,
      pathLen: number,
      randPtr: number,
      randLen: number,
      outPtr: number,
      outCap: number
    ) => number;
  };

  const isTv = type === 'tv';
  const path = `/${server.toLowerCase()}/${isTv ? 'series' : 'movie'}`;
  const payload: Record<string, string> = {
    tmdb: String(tmdbId),
    title,
  };
  if (isTv) {
    payload.season = String(season ?? 1);
    payload.episode = String(episode ?? 1);
  }
  if (year) payload.year = String(year);
  if (imdbId) payload.imdb = imdbId;

  const jsonBytes = Buffer.from(JSON.stringify({ path, payload }), 'utf8');
  const randomBytes = crypto.randomBytes(44);

  const jsonPtr = alloc(jsonBytes.length);
  new Uint8Array(memory.buffer, jsonPtr, jsonBytes.length).set(jsonBytes);

  const randPtr = alloc(44);
  new Uint8Array(memory.buffer, randPtr, 44).set(randomBytes);

  const outCap = jsonBytes.length + 512;
  const outPtr = alloc(outCap);

  const ret = seal_request(jsonPtr, jsonBytes.length, randPtr, 44, outPtr, outCap);
  if (ret <= 98) {
    throw new Error(`seal_request returned invalid length: ${ret}`);
  }

  const outBuf = Buffer.from(memory.buffer, outPtr, ret);
  const responseKey = outBuf.subarray(0, 32);
  const keyId = outBuf[32];
  const ephemeralPublic = outBuf.subarray(33, 98);
  const body = outBuf.subarray(98, ret);

  let gRes: Response | null = null;
  let lastStatus = 0;
  for (const apiHost of CINEJOY_SHEGU_APIS) {
    try {
      const res = await fetch(`${apiHost}/g`, {
        method: 'POST',
        body,
        headers: {
          ...CINEJOY_HEADERS,
          'Content-Type': 'application/octet-stream',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        gRes = res;
        break;
      }
      lastStatus = res.status;
    } catch {
      continue;
    }
  }

  if (!gRes || !gRes.ok) {
    throw new Error(`Cinejoy /g returned HTTP ${lastStatus || 502}`);
  }

  const gBuf = Buffer.from(await gRes.arrayBuffer());
  return decryptSheguPayload(gBuf, responseKey, keyId, ephemeralPublic);
}

async function resolveViaLegacyEncDec(targetUrl: string): Promise<any> {
  const encRes = await fetch(
    `${CINEJOY_ENC_DEC_API}/enc-cinejoy?url=${encodeURIComponent(targetUrl)}`,
    {
      signal: AbortSignal.timeout(6000),
    }
  );

  if (!encRes.ok) {
    throw new Error(`enc-cinejoy returned HTTP ${encRes.status}`);
  }

  const encJson = await encRes.json();
  if (encJson.status !== 200 || !encJson.result?.data) {
    throw new Error('enc-cinejoy returned invalid payload');
  }

  const { data, state } = encJson.result;

  let gRes: Response | null = null;
  let lastStatus = 0;
  for (const apiHost of CINEJOY_SHEGU_APIS) {
    try {
      const res = await fetch(`${apiHost}/g`, {
        method: 'POST',
        body: Buffer.from(data, 'base64url'),
        headers: CINEJOY_HEADERS,
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        gRes = res;
        break;
      }
      lastStatus = res.status;
    } catch {
      continue;
    }
  }

  if (!gRes || !gRes.ok) {
    throw new Error(`Cinejoy /g returned HTTP ${lastStatus || 502}`);
  }

  const gBuffer = Buffer.from(await gRes.arrayBuffer());

  // Try local native decrypt first using state to save the 3rd external hop to dec-cinejoy
  try {
    if (state?.responseKey && state?.aad) {
      const key = Buffer.from(state.responseKey, 'base64url');
      const aad = Buffer.from(state.aad, 'base64url');
      const iv = gBuffer.subarray(0, 12);
      const tag = gBuffer.subarray(gBuffer.length - 16);
      const ciphertext = gBuffer.subarray(12, gBuffer.length - 16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      decipher.setAAD(aad);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8'));
    }
  } catch (decErr) {
    console.warn('[cinejoy] Local decryption of legacy state failed, trying dec-cinejoy:', decErr);
  }

  // Fallback to external dec-cinejoy if local decryption fails
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
    throw new Error(`dec-cinejoy returned HTTP ${decRes.status}`);
  }

  return decRes.json();
}

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
    let queryPart = `?type=${type === 'tv' ? 'tv' : 'movie'}&tmdb=${tmdbId}`;
    if (type === 'tv' && season && episode) {
      queryPart += `&season=${season}&episode=${episode}`;
    }

    let data: any = null;
    for (const subApi of CINEJOY_SUBTITLES_APIS) {
      try {
        const res = await fetch(`${subApi}/subtitles${queryPart}`, {
          headers: CINEJOY_HEADERS,
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch {
        continue;
      }
    }

    if (!data || !Array.isArray(data?.subtitles)) return [];

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
    let decJson: any = null;
    try {
      decJson = await resolveViaLocalWasm(
        server,
        type,
        tmdbId,
        title,
        year,
        imdbId,
        season,
        episode
      );
    } catch (wasmErr: any) {
      console.warn(
        `[cinejoy] Local WASM resolution failed for server ${server}, falling back to legacy enc-dec:`,
        wasmErr?.message || wasmErr
      );
      const isTv = type === 'tv';
      const cType = isTv ? 'series' : 'movie';
      let targetUrl = `${CINEJOY_SHEGU_APIS[0]}/?title=${encodeURIComponent(title)}&type=${cType}&tmdb=${tmdbId}&server=${server}`;
      if (year) {
        targetUrl += `&year=${year}`;
      }
      if (imdbId) {
        targetUrl += `&imdb=${encodeURIComponent(imdbId)}`;
      }
      if (isTv) {
        targetUrl += `&season=${season ?? 1}&episode=${episode ?? 1}`;
      }
      decJson = await resolveViaLegacyEncDec(targetUrl);
    }

    const payloadData = decJson?.data || decJson?.result?.data;
    const streams = payloadData?.stream;
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
  quotaExceeded?: boolean;
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

export type DirectDownloadContext = {
  title?: string;
  year?: string | number | null;
  season?: number;
  episode?: number;
};

export function isPlausibleReleaseFilename(filename: string, contextTitle?: string): boolean {
  if (!filename) return false;
  const clean = filename.trim();
  if (clean.length < 5) return false;

  // Reject generic CDN/player filenames or playlist manifests
  if (/^(?:download|video|file|stream|index|master|manifest|output|play|chunk|enc[\w-]*)[\d._-]*\.[a-z0-9]+$/i.test(clean)) {
    return false;
  }
  const ext = clean.split('.').pop()?.toLowerCase();
  if (ext && ['m3u8', 'mpd', 'ts', 'key'].includes(ext)) {
    return false;
  }

  // If a context title is provided, check if the filename contains at least one significant title word
  if (contextTitle) {
    const titleTokens = contextTitle
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(the|and|for|with)$/.test(w));

    if (titleTokens.length > 0) {
      const lowerClean = clean.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      const hasAnyToken = titleTokens.some((t) => lowerClean.includes(t));
      if (!hasAnyToken) {
        return false;
      }
    }
  }

  return true;
}

export function extractRealReleaseFilename(url: string, contextTitle?: string): string | null {
  try {
    const parsed = new URL(url);
    const disposition = parsed.searchParams.get('response-content-disposition');
    if (disposition) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]).trim();
        if (isPlausibleReleaseFilename(decoded, contextTitle)) {
          return decoded;
        }
      }
    }
    const pathName = parsed.pathname.split('/').filter(Boolean).pop();
    if (pathName && pathName.includes('.')) {
      const decoded = decodeURIComponent(pathName).trim();
      if (isPlausibleReleaseFilename(decoded, contextTitle)) {
        return decoded;
      }
    }
  } catch {
    // ignore
  }
  return null;
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

const DOWNLOADS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 10_000; // 10 seconds on errors/empty to allow fast retries
const cinejoyDownloadsCache = new MemoryCache<CinejoyDirectDownload[]>(1, 100);

export async function fetchCinejoyDirectDownloads(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number,
  context?: DirectDownloadContext
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

  try {
    const FETCH_TIMEOUT_MS = 10_000;
    let data: any = null;

    for (const baseApi of CINEJOY_DOWNLOADS_APIS) {
      const endpoint = mediaType === 'movie'
        ? `${baseApi}/movie/${tmdbId}`
        : `${baseApi}/tv/${tmdbId}/${season || 1}/${episode || 1}`;

      try {
        const res = await fetch(endpoint, {
          headers: CINEJOY_HEADERS,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (res.ok) {
          data = await res.json();
          break;
        }

        if (res.status === 404) {
          cinejoyDownloadsCache.set(cacheKey, [], NEGATIVE_CACHE_TTL_MS);
          return [];
        }
      } catch {
        continue;
      }
    }

    if (!data) {
      cinejoyDownloadsCache.set(cacheKey, [], NEGATIVE_CACHE_TTL_MS);
      return [];
    }

    const rawLinks = Array.isArray(data?.links) ? data.links : [];
    if (rawLinks.length === 0) {
      cinejoyDownloadsCache.set(cacheKey, [], NEGATIVE_CACHE_TTL_MS);
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
      const rawName = typeof link.name === 'string' ? link.name.trim() : '';
      const source = typeof link.source === 'string' && link.source.trim() ? link.source.trim() : 'Cinejoy';
      const provider = typeof link.provider === 'string' && link.provider.trim() ? link.provider.trim() : 'cinejoy';

      const extractedRelease = extractRealReleaseFilename(url, context?.title);
      let displayName = '';
      if (extractedRelease) {
        displayName = extractedRelease.replace(/\.[a-z0-9]+$/i, '');
      } else if (context?.title) {
        if (mediaType === 'tv') {
          displayName = `${context.title} S${String(season || context.season || 1).padStart(2, '0')}E${String(episode || context.episode || 1).padStart(2, '0')} [${getDirectDownloadQualityLabel(quality)}]`;
        } else {
          displayName = `${context.title}${context.year ? ` (${context.year})` : ''} [${getDirectDownloadQualityLabel(quality)}]`;
        }
      } else {
        displayName = rawName.replace(/^(?:4K\s*)?CINEJOY\s*(?:\[[^\]]*\]\s*)*/i, '').trim() ||
          `${mediaType === 'movie' ? 'Movie' : 'Episode'} ${getDirectDownloadQualityLabel(quality)}`;
      }

      // Quality tags
      const bracketTags = parseDirectDownloadQualityTags(rawName);
      const combinedForTags = `${displayName} ${rawName} ${url}`;
      const extraTags: string[] = [];
      if (/\b(?:DOVI|DV|DOLBY[\s.-]?VISION)\b/i.test(combinedForTags) && !bracketTags.includes('DV')) extraTags.push('DV');
      if (/\bHDR10\+|HDR10PLUS\b/i.test(combinedForTags) && !bracketTags.includes('HDR10+')) extraTags.push('HDR10+');
      else if (/\bHDR(?:10)?\b/i.test(combinedForTags) && !bracketTags.includes('HDR') && !bracketTags.includes('HDR10')) extraTags.push('HDR');
      if (/\bIMAX\b/i.test(combinedForTags) && !bracketTags.includes('IMAX')) extraTags.push('IMAX');
      if (/\bREMUX\b/i.test(combinedForTags) && !bracketTags.includes('Remux')) extraTags.push('Remux');
      if (/\b(?:WEB[\s.-]?DL)\b/i.test(combinedForTags) && !bracketTags.includes('WEB-DL')) extraTags.push('WEB-DL');
      if (/\b(?:ATMOS)\b/i.test(combinedForTags) && !bracketTags.includes('Atmos')) extraTags.push('Atmos');
      if (/\b(?:DDP[\s.-]?5[\s.-]?1|DDP5\.1|DDP5)\b/i.test(combinedForTags) && !bracketTags.includes('DDP5')) extraTags.push('DDP 5.1');
      if (/\b(?:HEVC|H\.?265|X265)\b/i.test(combinedForTags) && !bracketTags.includes('HEVC') && !bracketTags.includes('X265')) extraTags.push('HEVC');

      const cleanTags = Array.from(new Set([...bracketTags, ...extraTags]))
        .filter(tag => !/^(?:fsl.*|server|cinejoy|fast|direct)$/i.test(tag));

      downloads.push({
        source,
        name: displayName,
        quality,
        qualityLabel: getDirectDownloadQualityLabel(quality),
        qualityTags: cleanTags,
        size: sizeStr,
        sizeBytes,
        url,
        provider,
      });
    }

    // Perform fast parallel health probe to flag any Google Drive quota-exceeded streams
    try {
      const { probeDirectDownloadUrl } = await import('./directDownloadHealth');
      await Promise.allSettled(
        downloads.map(async (dl) => {
          const probe = await probeDirectDownloadUrl(dl.url, 2500);
          if (probe.quotaExceeded) {
            dl.quotaExceeded = true;
          }
        })
      );
    } catch {
      // Non-fatal: if health probe fails, continue with unflagged links
    }

    // Sort: available before quotaExceeded, then by resolution descending, then file size descending
    downloads.sort((a, b) => {
      const aBlocked = a.quotaExceeded ? 1 : 0;
      const bBlocked = b.quotaExceeded ? 1 : 0;
      if (aBlocked !== bBlocked) return aBlocked - bBlocked;
      return b.quality - a.quality || b.sizeBytes - a.sizeBytes;
    });

    cinejoyDownloadsCache.set(cacheKey, downloads, DOWNLOADS_CACHE_TTL_MS);
    return downloads;
  } catch (error: any) {
    console.error(`[cinejoy] Direct downloads fetch failed for ${mediaType} ${tmdbId}:`, error.message || error);
    cinejoyDownloadsCache.set(cacheKey, [], NEGATIVE_CACHE_TTL_MS);
    return [];
  }
}


