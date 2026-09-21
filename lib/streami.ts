/**
 * Streami.click API integration for live sports events.
 * 
 * Two endpoints:
 *  - /api/J.php          → popular/featured events (no auth)
 *  - /api/getEvents.php  → all scheduled events (base64-encoded, requires X-SSIG header)
 */

const STREAMI_BASE = 'https://streamic.st';
const STREAMI_SSIG = 'bytmo8xialhem066';

// Map Streami's Polish category names → LFLIX sport IDs
const CATEGORY_MAP: Record<string, string> = {
  pilkanozna: 'football',
  pilkanozna_wazne: 'football',
  koszykowka: 'basketball',
  hokej: 'hockey',
  hokej_phl: 'hockey',
  tenis: 'tennis',
  americanfootball: 'american-football',
  baseball: 'baseball',
  boks: 'boxing',
  mma: 'mma',
  formula1: 'formula1',
  motorsport: 'formula1',
  krykiet: 'cricket',
  siatkowka: 'volleyball',
  golf: 'golf',
  dart: 'darts',
  snooker: 'snooker',
  pilkareczna: 'handball',
  futsal: 'football',
  badminton: 'badminton',
  australianfootball: 'rugby',
  pilkawodna: 'water-polo',
  pilkaplazowa: 'beach-volleyball',
  wrestling: 'wrestling',
  przypiete: 'pinned',
  magazyn: 'tv',
  triathlon: 'triathlon',
};

export type StreamiEmbed = {
  embed: string;
  label: string;   // SD | HD | FHD | UHD | 4K | 4K (BETA)
};

export type StreamiEmbedBlock = {
  language: string;
  embeds: Record<string, StreamiEmbed> | StreamiEmbed[];
};

export type StreamiEvent = {
  id: string;
  title: string | { pl: { home: string; away: string } };
  category: string;
  startTime: number;       // Unix timestamp in seconds
  countryCode?: string;
  _embeds?: StreamiEmbedBlock[];
  isFake?: boolean;
  fakeUrl?: string;
  popular?: boolean;
};

/**
 * Decode the base64-encoded UTF-8 response from getEvents.php.
 */
function decodeBase64UTF8(b64: string): string {
  const binary = Buffer.from(b64, 'base64');
  return binary.toString('utf-8');
}

/**
 * Extract a human-readable title from a Streami event.
 */
export function getStreamiTitle(event: StreamiEvent): string {
  if (typeof event.title === 'string') return event.title;
  if (event.title?.pl) {
    return `${event.title.pl.home} - ${event.title.pl.away}`;
  }
  return String(event.title) || 'Unknown Event';
}

/**
 * Map a Streami category to an LFLIX sport ID.
 */
export function mapStreamiCategory(category: string): string {
  return CATEGORY_MAP[category] || 'other';
}

/**
 * Flatten _embeds into an array of StreamiEmbed objects (each embed block may
 * use an object or array for its embeds field).
 */
function flattenEmbeds(blocks: StreamiEmbedBlock[] | undefined): { language: string; embed: string; label: string }[] {
  if (!blocks) return [];
  const flat: { language: string; embed: string; label: string }[] = [];
  for (const block of blocks) {
    const embeds = Array.isArray(block.embeds) ? block.embeds : Object.values(block.embeds);
    for (const e of embeds) {
      if (!e || !e.embed) continue;
      const trimmedEmbed = e.embed.trim();
      // Discard invalid / empty placeholder links (e.g. https://streami.fit/live/?channel_id=)
      if (
        !trimmedEmbed.startsWith('http') ||
        trimmedEmbed.endsWith('channel_id=') ||
        trimmedEmbed.endsWith('channel_id=null') ||
        trimmedEmbed.endsWith('channel_id=undefined') ||
        trimmedEmbed.endsWith('/live/?') ||
        trimmedEmbed.endsWith('/embed/')
      ) {
        continue;
      }
      flat.push({ language: block.language, embed: trimmedEmbed, label: e.label });
    }
  }
  return flat;
}

/**
 * Get all embed streams for a single Streami event, transformed into the
 * LFLIX Stream format expected by the frontend.
 */
export function getStreamiStreams(event: StreamiEvent) {
  const embeds = flattenEmbeds(event._embeds);
  return embeds.map((e, index) => {
    const label = e.label?.toUpperCase() || '';
    const is4k = ['4K', '4K (BETA)', 'UHD'].some(q => label.includes(q));
    const isHd = is4k || ['HD', 'FHD'].some(q => label.includes(q));
    return {
      id: `streami-${event.id}-${index}`,
      streamNo: index + 1,
      language: `${e.language} (${e.label})`,
      hd: isHd,
      is4k: is4k,
      embedUrl: e.embed,
      source: 'streami',
    };
  });
}

// Short in-memory cache to prevent repeated 260KB Base64 fetches across simultaneous calls
let cachedEvents: StreamiEvent[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 45_000;

/**
 * Fetch all events from Streami.click (main schedule + popular events).
 * Prioritizes getEvents.php as primary source with functional streams,
 * and supplements with J.php popular tags.
 */
export async function fetchStreamiEvents(): Promise<StreamiEvent[]> {
  const now = Date.now();
  if (cachedEvents && now < cacheExpiresAt && cachedEvents.length > 0) {
    return cachedEvents;
  }

  const allEvents = new Map<string, StreamiEvent>();
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  // 1. Primary: Main scheduled events (requires auth headers, response is base64-encoded)
  try {
    const mainRes = await fetch(`${STREAMI_BASE}/api/getEvents.php`, {
      headers: {
        'Accept': 'application/json',
        'Referer': `${STREAMI_BASE}/`,
        'X-SSIG': STREAMI_SSIG,
        'User-Agent': USER_AGENT
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store'
    });
    if (mainRes.ok) {
      const b64Text = await mainRes.text();
      const decoded = decodeBase64UTF8(b64Text.trim());
      const mainJson = JSON.parse(decoded);
      const mainEvents: StreamiEvent[] = Array.isArray(mainJson) ? mainJson : [];
      for (const ev of mainEvents) {
        if (!ev.isFake && ev.id) {
          allEvents.set(ev.id, ev);
        }
      }
    } else {
      console.warn(`Streami: Main events returned status ${mainRes.status}`);
    }
  } catch (err) {
    console.error('Streami: Failed to fetch main events:', err);
  }

  // 2. Secondary: Popular / featured events (marks events as popular or adds any missing items)
  try {
    const popRes = await fetch(`${STREAMI_BASE}/api/J.php`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT
      },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store'
    });
    if (popRes.ok) {
      const popJson = await popRes.json();
      const popEvents: StreamiEvent[] = Array.isArray(popJson) ? popJson : [];
      for (const ev of popEvents) {
        if (ev.isFake || !ev.id) continue;
        const existing = allEvents.get(ev.id);
        if (existing) {
          existing.popular = true;
          // Merge any valid embeds if existing had none
          if ((!existing._embeds || existing._embeds.length === 0) && ev._embeds && ev._embeds.length > 0) {
            existing._embeds = ev._embeds;
          }
        } else {
          // Only add if it has valid embed streams
          const streams = flattenEmbeds(ev._embeds);
          if (streams.length > 0) {
            ev.popular = true;
            allEvents.set(ev.id, ev);
          }
        }
      }
    }
  } catch (err) {
    console.error('Streami: Failed to fetch popular events:', err);
  }

  const result = Array.from(allEvents.values());
  if (result.length > 0) {
    cachedEvents = result;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return result;
  }

  // If fetch failed completely, return stale cache if available
  if (cachedEvents && cachedEvents.length > 0) {
    return cachedEvents;
  }

  return [];
}

/**
 * Fetch a single Streami event by ID (checks both popular and main APIs).
 * Returns null if not found.
 */
export async function fetchStreamiEventById(eventId: string): Promise<StreamiEvent | null> {
  const events = await fetchStreamiEvents();
  return events.find(e => e.id === eventId) || null;
}
