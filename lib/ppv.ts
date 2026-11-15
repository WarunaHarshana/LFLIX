/**
 * PPV.st Provider Client
 * Live Sports and 24/7 TV Streams integration.
 */

export const PPV_API_BASE = 'https://api.ppv.st';
export const PPV_API_FALLBACK = 'https://api.ppv.cx';
export const PPV_WEB_BASE = 'https://ppv.st';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface PpvSubstream {
  id: number;
  name: string;
  tag?: string;
  uri_name?: string;
  source_tag?: string;
  locale?: string;
  iframe: string;
}

export interface PpvItem {
  id: number;
  name: string;
  tag?: string;
  source_tag?: string;
  poster?: string;
  blurhash?: string;
  colors?: string[];
  uri_name?: string;
  starts_at: number; // Unix epoch seconds
  ends_at: number; // Unix epoch seconds
  always_live: number | boolean;
  locale?: string;
  category_name: string;
  iframe: string;
  substreams?: PpvSubstream[];
  viewers?: string | number;
}

export interface PpvCategoryGroup {
  category: string;
  id: number;
  always_live: boolean;
  streams: PpvItem[];
}

export interface PpvApiResponse {
  success: boolean;
  timestamp: number;
  streams: PpvCategoryGroup[];
}

/**
 * Normalizes PPV category to LFLIX canonical category
 */
export function mapPpvCategory(category: string, title?: string): string {
  const cat = (category || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();

  if (cat.includes('combat') || cat.includes('wrestling') || cat.includes('fight') || cat.includes('mma') || cat.includes('boxing')) {
    return 'fight';
  }
  if (cat.includes('motor') || cat.includes('f1') || cat.includes('racing')) {
    return 'motor-sports';
  }
  if (cat.includes('american football')) {
    return 'american-football';
  }
  if (cat.includes('australian football') || cat.includes('afl')) {
    return 'afl';
  }
  if (cat.includes('basketball')) {
    return 'basketball';
  }
  if (cat.includes('cricket')) {
    return 'cricket';
  }
  if (cat.includes('football') || cat.includes('soccer')) {
    return 'football';
  }
  if (cat.includes('golf')) {
    return 'golf';
  }
  if (cat.includes('ice hockey') || cat.includes('hockey')) {
    return 'hockey';
  }
  if (cat.includes('rugby')) {
    return 'rugby';
  }
  if (cat.includes('tennis')) {
    return 'tennis';
  }
  if (cat.includes('darts')) {
    return 'darts';
  }
  if (cat.includes('snooker') || cat.includes('billiards')) {
    return 'billiards';
  }
  if (cat.includes('24/7')) {
    return 'tv';
  }

  return 'other';
}

/**
 * Extracts Home & Away teams from PPV match titles.
 * Handles "Away Team at Home Team" (US convention) and "Home vs Away".
 */
export function extractTeamsFromPpv(title: string): { home: { name: string }; away: { name: string } } | undefined {
  if (!title) return undefined;

  // "Away at Home"
  const atMatch = title.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return {
      away: { name: atMatch[1].trim() },
      home: { name: atMatch[2].trim() }
    };
  }

  // "Home vs Away", "Home vs. Away", "Home v Away", "Home - Away"
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
 * Fetch streams from PPV.st API with automatic fallback and retries.
 */
export async function fetchPpvStreams(): Promise<PpvItem[]> {
  const bases = [PPV_API_BASE, PPV_API_FALLBACK];
  let lastError: any = null;

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/streams`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
          'Origin': PPV_WEB_BASE,
          'Referer': `${PPV_WEB_BASE}/`
        },
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 30 }
      });

      if (!res.ok) {
        throw new Error(`PPV API responded with status ${res.status}`);
      }

      const data: PpvApiResponse = await res.json();
      if (!data || !Array.isArray(data.streams)) {
        return [];
      }

      // Flatten category groups into single list of items
      const items: PpvItem[] = [];
      for (const group of data.streams) {
        if (group && Array.isArray(group.streams)) {
          for (const item of group.streams) {
            items.push({
              ...item,
              category_name: group.category || item.category_name || 'Other'
            });
          }
        }
      }

      return items;
    } catch (err) {
      lastError = err;
    }
  }

  console.error('Failed to fetch from PPV.st endpoints:', lastError);
  return [];
}

/**
 * Fetches Live & Upcoming Sports Events from PPV.st
 */
export async function fetchPpvEvents(): Promise<PpvItem[]> {
  const all = await fetchPpvStreams();
  return all.filter(item => {
    const isAlwaysLive = item.always_live === 1 || item.always_live === true;
    const isTvCategory = (item.category_name || '').toLowerCase().includes('24/7');
    return !isAlwaysLive && !isTvCategory;
  });
}

/**
 * Fetches 24/7 TV channels from PPV.st
 */
export async function fetchPpvChannels(): Promise<PpvItem[]> {
  const all = await fetchPpvStreams();
  return all.filter(item => {
    const isAlwaysLive = item.always_live === 1 || item.always_live === true;
    const isTvCategory = (item.category_name || '').toLowerCase().includes('24/7');
    return isAlwaysLive || isTvCategory;
  });
}

/**
 * Transforms a PPV item into standard LFLIX stream options
 */
export function getPpvStreamsForMatch(item: PpvItem) {
  const streams: Array<{
    id: string;
    streamNo: number;
    language: string;
    hd: boolean;
    is4k: boolean;
    embedUrl: string;
    source: string;
    referer: string;
  }> = [];

  // Main stream
  if (item.iframe) {
    const sourceTag = (item.source_tag || item.tag || '').toUpperCase();
    const is4k = sourceTag.includes('4K') || sourceTag.includes('UHD');
    const isHd = is4k || sourceTag.includes('HD') || sourceTag.includes('1080P') || sourceTag.includes('720P');

    streams.push({
      id: `ppv-${item.id}-1`,
      streamNo: 1,
      language: item.source_tag || item.tag || 'HD Stream',
      hd: isHd,
      is4k,
      embedUrl: item.iframe,
      source: 'ppv',
      referer: `${PPV_WEB_BASE}/`
    });
  }

  // Substreams
  if (Array.isArray(item.substreams)) {
    item.substreams.forEach((sub, idx) => {
      if (!sub.iframe) return;
      const sourceTag = (sub.source_tag || sub.tag || '').toUpperCase();
      const is4k = sourceTag.includes('4K') || sourceTag.includes('UHD');
      const isHd = is4k || sourceTag.includes('HD') || sourceTag.includes('1080P') || sourceTag.includes('720P');

      streams.push({
        id: `ppv-${item.id}-${idx + 2}`,
        streamNo: idx + 2,
        language: sub.source_tag || sub.tag || `Stream ${idx + 2}`,
        hd: isHd,
        is4k,
        embedUrl: sub.iframe,
        source: 'ppv',
        referer: `${PPV_WEB_BASE}/`
      });
    });
  }

  return streams;
}
