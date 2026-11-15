import crypto from 'crypto';
import { Agent } from 'undici';

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export const TIMSTREAMS_BASE = 'https://tim-streams.com';
export const TIMSTREAMS_FALLBACK_BASE = 'https://timstreams.co.rw';
export const TIMSTREAMS_LEGACY_BASE = 'https://timstreams.st';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type TimStreamsGenre = {
  id: number;
  name: string;
  featured?: boolean;
  sub_categories?: Array<{ id: number; name: string }>;
};

export type TimStreamsStream = {
  name: string;
  url: string;
  vip?: boolean;
};

export type TimStreamsEvent = {
  url: string;
  name: string;
  logo?: string;
  genre: number;
  sub_genre?: number;
  time: string;
  isevent?: boolean;
  vip?: boolean;
  featured?: boolean;
  viewers?: number;
  streams?: TimStreamsStream[];
};

export type TimStreamsWatchItem = {
  url: string;
  name: string;
  logo?: string;
  genre?: number;
  sub_genre?: number;
  time?: string;
  isevent?: boolean;
  vip?: boolean;
  featured?: boolean;
  viewers?: number;
  streams?: TimStreamsStream[];
};

export type TimStreamsChannel = {
  url: string;
  name: string;
  logo?: string;
  genre: number;
  flag?: string;
  vip?: boolean;
  viewers?: number;
  streams?: TimStreamsStream[];
};

/**
 * Normalizes ISO / local time strings to UTC epoch milliseconds.
 */
export function parseTimStreamsTimeToUTC(dateStr: string): number {
  if (!dateStr) return 0;
  const normalized = dateStr.trim().replace(' ', 'T');
  try {
    const epoch = new Date(normalized + 'Z').getTime();
    if (!isNaN(epoch) && epoch > 0) return epoch;
    const parsed = Date.parse(normalized);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return Date.now();
  } catch (e) {
    return Date.now();
  }
}

/**
 * Normalizes genres data from array or object into a Record<number, string>.
 */
export function normalizeGenresMap(genresData: any): Record<number, string> {
  const map: Record<number, string> = {};
  if (Array.isArray(genresData)) {
    for (const g of genresData) {
      if (g && typeof g.id === 'number' && g.name) {
        map[g.id] = g.name;
      }
    }
  } else if (genresData && typeof genresData === 'object') {
    for (const [key, value] of Object.entries(genresData)) {
      const numKey = Number(key);
      if (!isNaN(numKey) && typeof value === 'string') {
        map[numKey] = value;
      } else if (value && typeof value === 'object' && (value as any).name) {
        map[numKey] = (value as any).name;
      }
    }
  }
  return map;
}

/**
 * Maps TimStreams genre names/IDs to standard LFLIX sport categories.
 */
export function mapTimStreamsCategory(genreNameOrId: string | number, genresMap?: Record<number, string>): string {
  let genreName = '';
  if (typeof genreNameOrId === 'number') {
    genreName = (genresMap && genresMap[genreNameOrId]) || '';
  } else {
    genreName = String(genreNameOrId || '');
  }

  const lower = genreName.toLowerCase();
  if (lower.includes('soccer') || (lower.includes('football') && !lower.includes('american'))) {
    return 'football';
  }
  if (lower.includes('motorsport') || lower.includes('formula') || lower.includes('racing') || lower.includes('nascar') || lower.includes('indycar')) {
    return 'formula1';
  }
  if (lower.includes('martial') || lower.includes('mma') || lower.includes('ufc') || lower.includes('wrestling') || lower.includes('combat')) {
    return 'mma';
  }
  if (lower.includes('boxing') || lower.includes('bare knuckle')) {
    return 'boxing';
  }
  if (lower.includes('basketball') || lower.includes('nba')) {
    return 'basketball';
  }
  if (lower.includes('american football') || lower.includes('nfl')) {
    return 'american-football';
  }
  if (lower.includes('baseball') || lower.includes('mlb')) {
    return 'baseball';
  }
  if (lower.includes('tennis') || lower.includes('atp') || lower.includes('wta')) {
    return 'tennis';
  }
  if (lower.includes('hockey') || lower.includes('nhl')) {
    return 'hockey';
  }
  if (lower.includes('cricket')) {
    return 'cricket';
  }
  if (lower.includes('darts')) {
    return 'darts';
  }
  if (lower.includes('rugby')) {
    return 'rugby';
  }
  if (lower.includes('cycling') || lower.includes('tour de')) {
    return 'cycling';
  }
  if (lower.includes('live show') || lower.includes('entertainment') || lower.includes('tv')) {
    return 'tv';
  }
  return 'other';
}

/**
 * Extracts home and away teams from standard match title strings.
 */
export function extractTeamsFromTitle(title: string): { home: { name: string }; away: { name: string } } | undefined {
  if (!title) return undefined;
  // Delimiter "@" indicates Away @ Home (US sport convention)
  const atMatch = title.match(/^(.+?)\s*@\s*(.+)$/i);
  if (atMatch) {
    return {
      away: { name: atMatch[1].trim() },
      home: { name: atMatch[2].trim() }
    };
  }

  // Delimiters: vs, v., -, –
  const vsMatch = title.match(/^(.+?)\s*(?:vs\.?|v\.|[-–])\s*(.+)$/i);
  if (vsMatch) {
    return {
      home: { name: vsMatch[1].trim() },
      away: { name: vsMatch[2].trim() }
    };
  }

  return undefined;
}

/**
 * Fetches an endpoint with fallback across active TimStreams mirrors and retry handling.
 */
async function fetchWithFallback(endpoint: string, options: RequestInit = {}, retries = 2): Promise<Response> {
  const bases = [TIMSTREAMS_BASE, TIMSTREAMS_FALLBACK_BASE, TIMSTREAMS_LEGACY_BASE];
  let lastError: any = null;

  for (const base of bases) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `${base}${endpoint}`;
        const fetchOpts: any = {
          ...options,
          headers: {
            'Accept': 'application/json',
            'User-Agent': USER_AGENT,
            ...(options.headers || {})
          },
          signal: AbortSignal.timeout(5000),
        };
        if (insecureAgent) {
          fetchOpts.dispatcher = insecureAgent;
        }
        const res = await fetch(url, fetchOpts);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('text/html')) {
            lastError = new Error(`${url} returned HTML (Cloudflare challenge or redirect) instead of JSON`);
            break; // don't retry HTML on this base
          }
          return res;
        }
        lastError = new Error(`Request to ${url} returned status ${res.status}`);
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${endpoint} from all TimStreams endpoints`);
}

/**
 * Fetches all live & upcoming sports events from TimStreams.
 */
export async function fetchTimStreamsEvents(): Promise<{ events: TimStreamsEvent[]; genres: Record<number, string> }> {
  try {
    const res = await fetchWithFallback('/api/live-upcoming');
    const data = await res.json();
    const genres = normalizeGenresMap(data.genres);
    const events: TimStreamsEvent[] = Array.isArray(data.events) ? data.events : [];
    return { events, genres };
  } catch (error) {
    console.error('Failed to fetch TimStreams events:', error);
    return { events: [], genres: {} };
  }
}

/**
 * Fetches watch details for a specific event URL.
 */
export async function fetchTimStreamsWatch(id: string): Promise<TimStreamsWatchItem | null> {
  try {
    const res = await fetchWithFallback(`/api/watch/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (data.item) {
      return data.item;
    }
  } catch (error) {
    console.error(`Failed to fetch TimStreams watch item for ${id}:`, error);
  }

  // Fallback to searching live-upcoming
  try {
    const { events } = await fetchTimStreamsEvents();
    const found = events.find(e => e.url === id);
    if (found) {
      return found;
    }
  } catch (err) {
    console.error(`Failed to fallback search TimStreams event for ${id}:`, err);
  }

  return null;
}

/**
 * Fetches TV channels from TimStreams.
 */
export async function fetchTimStreamsChannels(): Promise<{ channels: TimStreamsChannel[]; genres: Record<number, string> }> {
  try {
    const res = await fetchWithFallback('/api/channels');
    const data = await res.json();
    const genres = normalizeGenresMap(data.genres);
    const channels: TimStreamsChannel[] = Array.isArray(data.channels) ? data.channels : [];
    return { channels, genres };
  } catch (error) {
    console.error('Failed to fetch TimStreams channels:', error);
    return { channels: [], genres: {} };
  }
}

const DECRYPTION_KEY = "8paW@#1UgOw4=A8iT*5we";

/**
 * Legacy AES-GCM decryption for old TimStreams CDN streams.
 */
export async function decryptTimStreamUrl(encryptedBase64: string, keyStr: string = DECRYPTION_KEY): Promise<string> {
  const keyBuffer = Buffer.from(keyStr, 'utf8').subarray(0, 16);
  const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
  const iv = encryptedBuffer.subarray(0, 12);
  const ciphertext = encryptedBuffer.subarray(12);

  // Use webcrypto subtle API which is available on globalThis in Node 18+ / Next.js
  const subtle = globalThis.crypto?.subtle || (crypto as unknown as { webcrypto?: { subtle: SubtleCrypto } }).webcrypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto subtle is not available');
  }

  const key = await subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decryptedBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Resolves a TimStreams embed URL (e.g. https://ehgembxe.cfd/:embedId) or stream ID to a direct .m3u8 stream URL.
 */
export async function resolveTimStream(embedUrlOrId: string): Promise<string> {
  let targetUrl = (embedUrlOrId || '').trim();
  if (!targetUrl) {
    throw new Error('Embed URL or Stream ID is required');
  }

  // Normalize ID or URL
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://ehgembxe.cfd/${targetUrl}`;
  } else if (targetUrl.includes('junkieembeds.pages.dev/embed/')) {
    const id = targetUrl.split('/embed/')[1]?.split(/[?#]/)[0];
    if (id) {
      targetUrl = `https://ehgembxe.cfd/${id}`;
    }
  }

  let playUrl = targetUrl;
  let html = '';
  let lastErr: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fetchOpts: any = {
        headers: {
          'Referer': `${TIMSTREAMS_BASE}/`,
          'User-Agent': USER_AGENT,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
      };
      if (insecureAgent) {
        fetchOpts.dispatcher = insecureAgent;
      }
      const res = await fetch(targetUrl, fetchOpts);
      if (!res.ok) {
        throw new Error(`Failed to fetch embed page: status ${res.status}`);
      }
      playUrl = res.url;
      html = await res.text();
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  if (lastErr) {
    throw lastErr;
  }

  const match = html.match(/var\s+([a-zA-Z0-9_$]+)\s*=\s*\[([\d,\s]+)\]\s*,\s*([a-zA-Z0-9_$]+)\s*=\s*(\d+)\s*,\s*([a-zA-Z0-9_$]+)\s*=\s*(\d+)/);
  if (!match) {
    throw new Error(`Could not find obfuscated script in embed page: ${playUrl}`);
  }

  const bytes = match[2].split(',').map(s => parseInt(s.trim(), 10));
  const xorVal = parseInt(match[4], 10);
  const subVal = parseInt(match[6], 10);
  const decodedBytes = new Uint8Array(bytes.map(b => ((b ^ xorVal) - subVal + 256) % 256));
  const decodedScript = new TextDecoder().decode(decodedBytes);

  const cfgMatch = decodedScript.match(/["']?ticketUrl["']?\s*:\s*['"]([^'"]+)['"]/);
  if (!cfgMatch || !cfgMatch[1]) {
    throw new Error('Failed to extract ticketUrl from decoded script');
  }

  const ticketUrl = cfgMatch[1];
  let ticketBuffer: Uint8Array | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fetchOpts: any = {
        headers: {
          'Referer': playUrl,
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(6000),
      };
      if (insecureAgent) {
        fetchOpts.dispatcher = insecureAgent;
      }
      const ticketRes = await fetch(ticketUrl, fetchOpts);
      if (!ticketRes.ok) {
        throw new Error(`Failed to fetch ticket: status ${ticketRes.status}`);
      }
      ticketBuffer = new Uint8Array(await ticketRes.arrayBuffer());
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  if (lastErr || !ticketBuffer) {
    throw lastErr || new Error('Failed to retrieve ticket buffer');
  }

  if (ticketBuffer.length < 2) {
    throw new Error('Ticket buffer too short');
  }

  const token = ticketUrl.split('/').pop() || '';
  const seed = ticketBuffer[0];
  let streamUrl = '';
  for (let i = 1; i < ticketBuffer.length; i++) {
    const charCode = ticketBuffer[i] ^ token.charCodeAt((i - 1) % token.length) ^ ((seed + i - 1) & 0xff);
    streamUrl += String.fromCharCode(charCode);
  }

  return streamUrl;
}
