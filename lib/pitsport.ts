/**
 * PitSport.st Provider Client
 * Live Motorsport, Tennis, and Sports programs integration.
 */

export const PITSPORT_BASE = 'https://pitsport.st';
export const PITSPORT_API_BASE = 'https://pitsport.st/api/v1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface PitSportProgramSummary {
  programId: number;
  slug: string;
  titleText: string;
  subtitle?: string | null;
  footer?: string | null;
  sessionStart: number; // Unix epoch seconds
  logo?: string | null;
  background?: string | null;
  href: string;
  playHref: string;
  liveState: 'live' | 'upcoming';
  kind: string;
  competitionSlug?: string;
  hasVideo?: boolean;
}

export interface PitSportVideo {
  embedId: number;
  embedType: string;
  embedUrl: string;
  label?: string | null;
  isDefault?: boolean;
  sortOrder?: number;
  origin?: string;
  allowed?: boolean;
}

export interface PitSportProgramPlay {
  program: any;
  video: PitSportVideo;
  videos: PitSportVideo[];
  hasVideo: boolean;
}

export interface PitSportLiveNowResponse {
  ok: boolean;
  data?: {
    live?: PitSportProgramSummary[];
    upcoming?: PitSportProgramSummary[];
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface PitSportPlayResponse {
  ok: boolean;
  data?: PitSportProgramPlay;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Maps PitSport competition or category footer to canonical LFLIX sports categories.
 */
export function mapPitSportCategory(footerOrCompetition?: string | null, title?: string | null): string {
  const cat = (footerOrCompetition || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();

  if (
    cat.includes('formula') ||
    cat.includes('f1') ||
    cat.includes('motogp') ||
    cat.includes('motorsport') ||
    cat.includes('nascar') ||
    cat.includes('indycar') ||
    cat.includes('wec') ||
    cat.includes('racing') ||
    cat.includes('rally') ||
    t.includes('grand prix') ||
    t.includes('formula 1')
  ) {
    return 'motor-sports';
  }

  if (cat.includes('tennis') || t.includes('atp') || t.includes('wta') || t.includes('tennis')) {
    return 'tennis';
  }

  if (cat.includes('fight') || cat.includes('mma') || cat.includes('boxing') || cat.includes('combat') || cat.includes('ufc')) {
    return 'fight';
  }

  if (cat.includes('football') || cat.includes('soccer')) {
    return 'football';
  }

  if (cat.includes('basketball') || cat.includes('nba')) {
    return 'basketball';
  }

  return 'other';
}

/**
 * Extracts Home & Away teams from PitSport titles if applicable.
 */
export function extractTeamsFromPitSport(title: string): { home: { name: string }; away: { name: string } } | undefined {
  if (!title) return undefined;

  const vsMatch = title.match(/^(.+?)\s*(?:vs\.?|v\.|[-–])\s*(.+)$/i);
  if (vsMatch) {
    return {
      home: { name: vsMatch[1].trim() },
      away: { name: vsMatch[2].trim() }
    };
  }

  const atMatch = title.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return {
      away: { name: atMatch[1].trim() },
      home: { name: atMatch[2].trim() }
    };
  }

  return undefined;
}

/**
 * Fetch live and upcoming programs from PitSport.st.
 */
export async function fetchPitSportLiveNow(): Promise<{ live: PitSportProgramSummary[]; upcoming: PitSportProgramSummary[] }> {
  try {
    const res = await fetch(`${PITSPORT_API_BASE}/live-now`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
        'Referer': `${PITSPORT_BASE}/`
      },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 30 }
    });

    if (!res.ok) {
      throw new Error(`PitSport live-now API responded with status ${res.status}`);
    }

    const json: PitSportLiveNowResponse = await res.json();
    if (json.ok && json.data) {
      return {
        live: Array.isArray(json.data.live) ? json.data.live : [],
        upcoming: Array.isArray(json.data.upcoming) ? json.data.upcoming : []
      };
    }
  } catch (error) {
    console.error('Failed to fetch PitSport live-now:', error);
  }

  return { live: [], upcoming: [] };
}

/**
 * Fetch program playback details and stream embed URLs for a specific programId.
 */
export async function fetchPitSportPlay(programId: number | string): Promise<PitSportProgramPlay | null> {
  try {
    const res = await fetch(`${PITSPORT_API_BASE}/programs/${encodeURIComponent(programId)}/play`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
        'Referer': `${PITSPORT_BASE}/`
      },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 30 }
    });

    if (!res.ok) {
      throw new Error(`PitSport play API responded with status ${res.status}`);
    }

    const json: PitSportPlayResponse = await res.json();
    if (json.ok && json.data) {
      return json.data;
    }
  } catch (error) {
    console.error(`Failed to fetch PitSport play for program ${programId}:`, error);
  }

  return null;
}

/**
 * Transforms PitSport program play details into standard LFLIX stream options.
 */
export function getPitSportStreams(playData: PitSportProgramPlay, programId: number | string) {
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
  const videoList = playData.videos && playData.videos.length > 0 ? playData.videos : (playData.video ? [playData.video] : []);

  videoList.forEach((v, index) => {
    if (!v.embedUrl) return;
    const label = v.label || `PitSport Stream ${index + 1}`;
    const is4k = label.toLowerCase().includes('4k') || label.toLowerCase().includes('uhd');

    streams.push({
      id: `pitsport-${programId}-${index + 1}`,
      streamNo: index + 1,
      language: label,
      hd: true,
      is4k,
      embedUrl: v.embedUrl,
      source: 'pitsport',
      referer: `${PITSPORT_BASE}/`
    });
  });

  return streams;
}
