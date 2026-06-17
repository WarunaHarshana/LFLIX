/**
 * Streami.click API integration for live sports events.
 * 
 * Two endpoints:
 *  - /api/J.php          → popular/featured events (no auth)
 *  - /api/getEvents.php  → all scheduled events (base64-encoded, requires X-SSIG header)
 */

const STREAMI_BASE = 'https://streami.click';
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
      flat.push({ language: block.language, embed: e.embed, label: e.label });
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
    const isHd = ['HD', 'FHD', 'UHD', '4K', '4K (BETA)'].some(q => label.includes(q));
    return {
      id: `streami-${event.id}-${index}`,
      streamNo: index + 1,
      language: `${e.language} (${e.label})`,
      hd: isHd,
      embedUrl: e.embed,
      source: 'streami',
    };
  });
}

/**
 * Fetch all events from Streami.click (popular + main schedule).
 * Returns a deduplicated array of StreamiEvent objects.
 */
export async function fetchStreamiEvents(): Promise<StreamiEvent[]> {
  const allEvents = new Map<string, StreamiEvent>();
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  // 1. Popular events (no auth required)
  try {
    const popRes = await fetch(`${STREAMI_BASE}/api/J.php`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT
      },
      next: { revalidate: 60 } as any,
    });
    if (popRes.ok) {
      const popJson = await popRes.json();
      const popEvents: StreamiEvent[] = Array.isArray(popJson) ? popJson : [];
      for (const ev of popEvents) {
        if (!ev.isFake) allEvents.set(ev.id, ev);
      }
    }
  } catch (err) {
    console.error('Streami: Failed to fetch popular events:', err);
  }

  // 2. Main events (requires auth headers, response is base64-encoded)
  try {
    const mainRes = await fetch(`${STREAMI_BASE}/api/getEvents.php`, {
      headers: {
        'Accept': 'application/json',
        'Referer': `${STREAMI_BASE}/`,
        'X-SSIG': STREAMI_SSIG,
        'User-Agent': USER_AGENT
      },
      next: { revalidate: 60 } as any,
    });
    if (mainRes.ok) {
      const b64Text = await mainRes.text();
      const decoded = decodeBase64UTF8(b64Text);
      const mainJson = JSON.parse(decoded);
      const mainEvents: StreamiEvent[] = Array.isArray(mainJson) ? mainJson : [];
      for (const ev of mainEvents) {
        if (!ev.isFake) {
          // Popular events already fetched may have richer data, don't overwrite
          if (!allEvents.has(ev.id)) {
            allEvents.set(ev.id, ev);
          }
        }
      }
    } else {
      console.error(`Streami: Main events returned status ${mainRes.status}`);
    }
  } catch (err) {
    console.error('Streami: Failed to fetch main events:', err);
  }

  return Array.from(allEvents.values());
}

/**
 * Fetch a single Streami event by ID (checks both popular and main APIs).
 * Returns null if not found.
 */
export async function fetchStreamiEventById(eventId: string): Promise<StreamiEvent | null> {
  const events = await fetchStreamiEvents();
  return events.find(e => e.id === eventId) || null;
}
