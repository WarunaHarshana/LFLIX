/**
 * StrmFree.pk Provider Client
 * Live Sports streaming integration.
 */

export const STRMFREE_BASE = 'https://strmfree.pk';
export const STRMFREE_FALLBACKS = ['https://streamfree.top', 'https://strmfree.st'];
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface StrmFreeSource {
  quality: string; // 'SD' | 'HD' | 'FHD' | '4K'
  url: string; // Embed player URL
  live: boolean;
}

export interface StrmFreeTeam {
  name: string;
  logo?: string;
}

export interface StrmFreeStream {
  id: string;
  name: string;
  category: string;
  league?: string;
  stream_key: string;
  match_timestamp: number; // Unix epoch seconds
  viewers?: number;
  is_external?: boolean;
  thumbnail_url?: string;
  sources?: StrmFreeSource[];
  team1?: StrmFreeTeam;
  team2?: StrmFreeTeam;
}

export interface StrmFreeApiResponse {
  count?: number;
  streams?: StrmFreeStream[];
}

/**
 * Maps StrmFree categories to canonical LFLIX sports categories.
 */
export function mapStrmFreeCategory(category: string, title?: string): string {
  const cat = (category || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();

  if (cat === 'soccer' || cat === 'football') {
    return 'football';
  }
  if (cat === 'basketball' || cat === 'nba') {
    return 'basketball';
  }
  if (cat.includes('fight') || cat === 'mma' || cat === 'ufc' || cat === 'boxing' || cat.includes('combat')) {
    return 'fight';
  }
  if (cat.includes('motor') || cat.includes('f1') || cat.includes('racing')) {
    return 'motor-sports';
  }
  if (cat === 'american-football' || cat === 'nfl') {
    return 'american-football';
  }
  if (cat === 'baseball' || cat === 'mlb') {
    return 'baseball';
  }
  if (cat === 'hockey' || cat === 'nhl') {
    return 'hockey';
  }
  if (cat === 'cricket') {
    return 'cricket';
  }
  if (cat === 'tennis') {
    return 'tennis';
  }
  if (cat === 'rugby') {
    return 'rugby';
  }
  if (cat === 'golf') {
    return 'golf';
  }
  if (cat === 'darts') {
    return 'darts';
  }

  return 'other';
}

/**
 * Extracts Home & Away teams from StrmFree payload or title.
 */
export function extractTeamsFromStrmFree(stream: StrmFreeStream): { home: { name: string; badge?: string }; away: { name: string; badge?: string } } | undefined {
  if (stream.team1?.name && stream.team2?.name) {
    return {
      home: { name: stream.team1.name.trim(), badge: stream.team1.logo },
      away: { name: stream.team2.name.trim(), badge: stream.team2.logo }
    };
  }

  if (stream.name) {
    const vsMatch = stream.name.match(/^(.+?)\s*(?:vs\.?|v\.|[-–])\s*(.+)$/i);
    if (vsMatch) {
      return {
        home: { name: vsMatch[1].trim() },
        away: { name: vsMatch[2].trim() }
      };
    }
    const atMatch = stream.name.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      return {
        away: { name: atMatch[1].trim() },
        home: { name: atMatch[2].trim() }
      };
    }
  }

  return undefined;
}

/**
 * Fetch all streams from StrmFree.pk with fallback mirrors.
 */
export async function fetchStrmFreeStreams(category?: string): Promise<StrmFreeStream[]> {
  const bases = [STRMFREE_BASE, ...STRMFREE_FALLBACKS];
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  let lastError: any = null;

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/v1/streams${query}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
          'Referer': `${base}/`
        },
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 30 }
      });

      if (!res.ok) {
        throw new Error(`StrmFree API responded with status ${res.status}`);
      }

      const data: StrmFreeApiResponse = await res.json();
      if (data && Array.isArray(data.streams)) {
        return data.streams;
      }
      return [];
    } catch (err) {
      lastError = err;
    }
  }

  console.error('Failed to fetch from StrmFree.pk endpoints:', lastError);
  return [];
}

/**
 * Fetch single stream details by stream_key.
 */
export async function fetchStrmFreeStreamByKey(streamKey: string): Promise<StrmFreeStream | null> {
  const bases = [STRMFREE_BASE, ...STRMFREE_FALLBACKS];

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/v1/streams/${encodeURIComponent(streamKey)}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
          'Referer': `${base}/`
        },
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 30 }
      });

      if (res.ok) {
        const stream: StrmFreeStream = await res.json();
        return stream;
      }
    } catch {}
  }

  return null;
}

/**
 * Fetch active playable sources for a specific stream_key.
 */
export async function fetchStrmFreeSources(streamKey: string): Promise<StrmFreeSource[]> {
  const bases = [STRMFREE_BASE, ...STRMFREE_FALLBACKS];

  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/v1/sources/${encodeURIComponent(streamKey)}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
          'Referer': `${base}/`
        },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 15 }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.sources)) {
          return data.sources;
        }
      }
    } catch {}
  }

  return [];
}

/**
 * Transforms StrmFree stream item into standard LFLIX stream options.
 */
export async function getStrmFreeStreamsForMatch(stream: StrmFreeStream) {
  let sources = stream.sources || [];

  // If sources list is empty in the main event payload, query live sources endpoint
  if (sources.length === 0 && stream.stream_key) {
    const liveSources = await fetchStrmFreeSources(stream.stream_key);
    if (liveSources.length > 0) {
      sources = liveSources;
    }
  }

  // If still no sources found, use the standard embed endpoint documented in StrmFree API
  if (sources.length === 0) {
    return [
      {
        id: `strmfree-${stream.stream_key}-1`,
        streamNo: 1,
        language: 'HD Stream',
        hd: true,
        is4k: false,
        embedUrl: `${STRMFREE_BASE}/embed/${encodeURIComponent(stream.category)}/${encodeURIComponent(stream.stream_key)}`,
        source: 'strmfree',
        referer: `${STRMFREE_BASE}/`
      }
    ];
  }

  return sources.map((src, index) => {
    const quality = (src.quality || '').toUpperCase();
    const is4k = quality.includes('4K') || quality.includes('UHD');
    const isHd = is4k || quality.includes('FHD') || quality.includes('HD') || quality.includes('1080P');

    return {
      id: `strmfree-${stream.stream_key}-${index + 1}`,
      streamNo: index + 1,
      language: `${src.quality || 'HD'} Feed ${index + 1}`,
      hd: isHd,
      is4k,
      embedUrl: src.url,
      source: 'strmfree',
      referer: `${STRMFREE_BASE}/`
    };
  });
}
