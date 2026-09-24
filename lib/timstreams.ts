import crypto from 'crypto';

export const TIMSTREAMS_BASE = 'https://timst.cfd';
export const TIMSTREAMS_FALLBACK_BASE = 'https://timstreams.st';
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
 * Fetches an endpoint with fallback across active TimStreams mirrors.
 */
async function fetchWithFallback(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const bases = [TIMSTREAMS_BASE, TIMSTREAMS_FALLBACK_BASE];
  let lastError: any = null;

  for (const base of bases) {
    try {
      const url = `${base}${endpoint}`;
      const res = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
          ...(options.headers || {})
        },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          lastError = new Error(`${url} returned HTML (Cloudflare challenge or redirect) instead of JSON`);
          continue;
        }
        return res;
      }
      lastError = new Error(`Request to ${url} returned status ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Failed to fetch ${endpoint} from all TimStreams endpoints`);
}

/**
 * Fetches all live & upcoming sports events from TimStreams.
 */
export async function fetchTimStreamsEvents(): Promise<{ events: TimStreamsEvent[]; genres: Record<number, string> }> {
  try {
    const res = await fetchWithFallback('/api/live-upcoming', {
      next: { revalidate: 60 } as any
    });
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
    const res = await fetchWithFallback(`/api/watch/${encodeURIComponent(id)}`, {
      next: { revalidate: 30 } as any
    });
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
    const res = await fetchWithFallback('/api/channels', {
      next: { revalidate: 300 } as any
    });
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
 * Decrypts a base64 encoded AES-GCM encrypted string using the specified key.
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
 * Resolves a junkieembeds URL to a direct .m3u8 stream URL.
 */
export async function resolveTimStream(embedUrl: string): Promise<string> {
  const match = embedUrl.match(/\/embed\/([^\/?#]+)/);
  const streamId = match ? match[1] : embedUrl.split('/').pop();
  if (!streamId) {
    throw new Error('Could not extract stream ID from URL: ' + embedUrl);
  }

  const response = await fetch('https://viznf.gdgdfhbdfidsf.xyz/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://junkieembeds.pages.dev',
      'Referer': 'https://junkieembeds.pages.dev/'
    },
    body: JSON.stringify({ id: streamId })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch encrypted stream from CDN: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success || !data.url) {
    throw new Error(`CDN API returned failure: ${JSON.stringify(data)}`);
  }

  return await decryptTimStreamUrl(data.url);
}
