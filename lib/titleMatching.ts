/**
 * Title Matching & Relevance Filtering
 *
 * Pure heuristics and string algorithms for normalizing, matching, and scoring
 * media titles against user search queries and metadata.
 * Contains zero Node/server-specific imports, making it safely importable by both
 * server-side APIs/scrapers and client-side UI components.
 */

export interface CandidateRelease {
  title: string;
  quality?: string;
  source?: string;
  seeds?: number;
  uploadTimestamp?: number;
  [key: string]: any;
}

/** Normalize a title for fuzzy comparison */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}'"!@#$%^&*,.:;]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a human-readable size string (e.g. "1.5 GB", "850 MB") back to bytes */
export function parseSizeToBytes(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB|TiB)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase().replace('IB', 'B');
  const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Math.round(value * (multipliers[unit] || 0));
}

export function extractQuality(title: string): string {
  // Check explicit resolutions first so source tags like WEB-DL or BluRay don't shadow the resolution
  const resMatch = title.match(/\b(2160p|4k|uhd|1440p|2k|1080p|720p|480p)\b/i);
  if (resMatch) {
    const raw = resMatch[1].toUpperCase();
    if (raw === '4K' || raw === 'UHD') return '2160p';
    if (raw === '2K') return '1440p';
    return resMatch[1].toLowerCase();
  }

  // Next, check for source / release types
  const ripMatch = title.match(/\b(BluRay|BDRip|BRRip|Remux|WEB-DL|WEBRip|HDRip|HDTV|CAM|TS|TC|TeleSync|Telecine)\b/i);
  return ripMatch ? ripMatch[1] : 'Unknown';
}

export function isCamQualityResult(result: { title: string; quality?: string }): boolean {
  const haystack = `${result.title} ${result.quality || ''}`.toLowerCase();
  return /\b(?:cam|hdcam|ts|telesync|telecine|tc|xbet|hd-?cam|camrip)\b/i.test(haystack);
}

export function isGoodMovieReleaseQuality(result: { title: string; quality?: string; source?: string }): boolean {
  if (isCamQualityResult(result)) return false;

  const haystack = `${result.title} ${result.quality || ''} ${result.source || ''}`.toLowerCase();
  if (/\b(?:web[\s.-]?dl|web[\s.-]?rip|bluray|blu[\s.-]?ray|bdrip|br[-\s]?rip|remux|hdrip|dvdrip)\b/i.test(haystack)) {
    return true;
  }

  // YTS, TorrentsCSV, 1337x, EZTV, and DDL publish finished digital encodes, so a resolution-tagged result is acceptable.
  if ((result.source === 'YTS' || result.source === 'TorrentsCSV' || result.source === '1337x' || result.source === 'EZTV' || result.source === 'DDL') && /\b(?:720p|1080p|2160p|4k|uhd)\b/i.test(haystack)) {
    return true;
  }

  return false;
}

export function extractYears(title: string): number[] {
  const matches = title.match(/\b(19|20)\d{2}\b/g) || [];
  const years = matches.map(y => parseInt(y, 10)).filter(y => y >= 1900 && y <= 2099);
  return Array.from(new Set(years));
}

/** Score how relevant a title is to the search query (0-100) */
export function relevanceScore(title: string, query: string): number {
  const normTitle = title.toLowerCase().replace(/[._\-]+/g, ' ');
  const normQuery = query.toLowerCase().replace(/[._\-]+/g, ' ');
  const queryWords = normQuery.split(/\s+/).filter(w => w.length > 1);

  if (queryWords.length === 0) return 0;

  let score = 0;
  let matchedWords = 0;

  for (const word of queryWords) {
    if (normTitle.includes(word)) {
      matchedWords++;
      // Bonus for exact word match (not substring)
      if (normTitle.split(/\s+/).some(w => w === word)) score += 15;
      else score += 10;
    }
  }

  // Must match at least 50% of query words
  const matchRatio = matchedWords / queryWords.length;
  if (matchRatio < 0.5) return 0;

  // Bonus for matching all words
  if (matchedWords === queryWords.length) score += 20;

  // Bonus for shorter titles (more specific matches)
  if (normTitle.length < 80) score += 10;

  // Penalty for very long titles (usually spam/pack releases)
  if (normTitle.length > 120) score -= 15;

  return Math.max(0, Math.min(100, score));
}

export function getSignificantQueryWords(query: string): string[] {
  return normalizeTitle(query)
    .split(' ')
    .filter(w => w.length > 1 && !/^(19|20)\d{2}$/.test(w));
}

export function getSignificantTvQueryWords(query: string): string[] {
  return normalizeTitle(query)
    .split(' ')
    .filter(w =>
      w.length > 1 &&
      !/^(19|20)\d{2}$/.test(w) &&
      !/^s\d{1,2}e\d{1,3}$/.test(w) &&
      !/^\d{1,2}x\d{1,3}$/.test(w) &&
      !/^s\d{1,2}$/.test(w) &&
      !/^\d{3,4}p$/.test(w) &&
      !/^(4k|uhd|hdr|hevc|x264|x265|web|webdl|web-dl|webrip|bluray|hdtv)$/.test(w)
    );
}

export function extractEpisodeQuery(query: string): { season: number; episode: number } | null {
  const sxxexx = query.match(/\bs(\d{1,2})\s*[\W_]*\s*e(\d{1,3})\b/i);
  if (sxxexx) {
    return { season: parseInt(sxxexx[1], 10), episode: parseInt(sxxexx[2], 10) };
  }

  const xFormat = query.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (xFormat) {
    return { season: parseInt(xFormat[1], 10), episode: parseInt(xFormat[2], 10) };
  }

  return null;
}

export function extractEpisodeKey(title: string): string | null {
  const episode = extractEpisodeQuery(title);
  if (!episode) return null;
  return `s${String(episode.season).padStart(2, '0')}e${String(episode.episode).padStart(2, '0')}`;
}

export function titleMatchesEpisode(title: string, episodeQuery: { season: number; episode: number }): boolean {
  const compact = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const season = String(episodeQuery.season);
  const episode = String(episodeQuery.episode);
  const seasonPadded = season.padStart(2, '0');
  const episodePadded = episode.padStart(2, '0');

  const tokens = [
    `s${season}e${episode}`,
    `s${season}e${episodePadded}`,
    `s${seasonPadded}e${episode}`,
    `s${seasonPadded}e${episodePadded}`,
    `${season}x${episode}`,
    `${season}x${episodePadded}`,
    `episode${episode}`,
    `episode${episodePadded}`,
    `ep${episode}`,
    `ep${episodePadded}`,
  ];

  return tokens.some(token => compact.includes(token));
}

export function titleContainsQueryWord(normTitle: string, word: string): boolean {
  const titleWords = normTitle.split(' ');
  if (titleWords.includes(word) || normTitle.includes(word)) return true;

  const romanAlternates: Record<string, string[]> = {
    ii: ['2', 'two'],
    iii: ['3', 'three'],
    iv: ['4', 'four'],
    v: ['5', 'five'],
    vi: ['6', 'six'],
    vii: ['7', 'seven'],
    viii: ['8', 'eight'],
    ix: ['9', 'nine'],
    x: ['10', 'ten'],
  };

  return (romanAlternates[word] || []).some(alt => titleWords.includes(alt));
}

export function isTvShowTitle(title: string): boolean {
  const lower = title.toLowerCase();
  // Season/Episode pattern: S01E01, s1e12, s01e012, s01-s02, etc.
  if (/\bs\d{1,2}\s*[ex]\d{1,3}\b/i.test(lower)) return true;
  if (/\b\d{1,2}x\d{1,3}\b/i.test(lower)) return true;

  // Season indicator: S01, S12, S01-S02 (usually a boundary like word, or preceded/followed by dot, space, dash)
  if (/\bs\d{1,2}\b/i.test(lower)) return true;

  // Season/Episode spelled out
  if (/\b(?:season|seasons|series|episode|episodes|ep|eps)\s*\d{1,2}\b/i.test(lower)) return true;

  return false;
}

export function extractCleanTitle(title: string, query: string): string {
  const lower = title.toLowerCase();

  // Find index of first matching token
  const tokens = [
    /\b(19|20)\d{2}\b/g, // year
    /\b(2160p|4k|uhd|1080p|720p|480p|576p|360p)\b/g, // resolution
    /\b(hdrip|bdrip|bluray|blu-ray|webrip|web-dl|web|hdtv|cam|ts|tc|dvdrip|brrip|remux|h264|h265|x264|x265|hevc|10bit|aac|dd5|ddp5)\b/g, // quality/codec
    /\b(s\d{1,2}(e\d{1,3})?|\d{1,2}x\d{1,3})\b/g, // season/episode
    /\b(season|episodes|episode|complete)\b/g, // tv terms
  ];

  let minIndex = title.length;
  const normalizedQuery = normalizeTitle(query);
  const queryWords = normalizedQuery.split(' ');

  for (const regex of tokens) {
    regex.lastIndex = 0; // reset
    let match;
    while ((match = regex.exec(lower)) !== null) {
      const matchedText = match[0];
      if (queryWords.includes(matchedText)) {
        continue;
      }
      if (match.index < minIndex) {
        minIndex = match.index;
      }
      break;
    }
  }

  let clean = title.slice(0, minIndex);
  clean = clean.replace(/[._\-]+/g, ' ').trim();
  return clean;
}

export function getSignificantWords(text: string): string[] {
  const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'is', 'are', 'was', 'were', 'it', 'its']);
  return normalizeTitle(text)
    .split(' ')
    .filter(w => (w.length > 1 || /^\d$/.test(w)) && !STOP_WORDS.has(w) && !/^(19|20)\d{2}$/.test(w));
}

export function matchesMovieTitleStrictly(title: string, query: string): boolean {
  if (isTvShowTitle(title)) return false;

  const cleanTitle = extractCleanTitle(title, query);

  const queryWords = getSignificantWords(query);
  const candidateWords = getSignificantWords(cleanTitle);

  if (queryWords.length === 0) return true;

  // The candidate clean title must contain all significant words from the query
  const hasAllQueryWords = queryWords.every(word => candidateWords.includes(word));
  if (!hasAllQueryWords) return false;

  // For short queries (<= 3 words), the candidate clean title shouldn't have extra significant words that are not in the query.
  if (queryWords.length <= 3) {
    const extraWords = candidateWords.filter(word => !queryWords.includes(word));
    if (extraWords.length > 0) {
      return false;
    }
  }

  return true;
}

export function matchesTvTitleStrictly(title: string, query: string): boolean {
  const episodeQuery = extractEpisodeQuery(query);
  if (episodeQuery && !titleMatchesEpisode(title, episodeQuery)) {
    return false;
  }

  const normTitle = normalizeTitle(title);
  const words = getSignificantTvQueryWords(query);
  if (words.length === 0) return true;

  const matchedWords = words.filter(word => titleContainsQueryWord(normTitle, word));

  if (words.length <= 2) {
    const titleWords = normTitle.split(' ');
    return words.every((word, index) => titleWords[index] === word);
  }

  return matchedWords.length / words.length >= 0.75;
}

/**
 * Parse structured season and episode information from a TV release title.
 */
export interface ParsedTvTitleInfo {
  season?: number;
  episode?: number;
  isSeasonPack?: boolean;
  isSeriesPack?: boolean;
  seasonRange?: [number, number];
}

export function parseTvTitleInfo(title: string): ParsedTvTitleInfo {
  if (!title) return {};

  // 1. Check for multi-season / complete series packs
  // e.g. S01-S06, S1-S6, Seasons 1-6, Seasons 1 to 8, Season 1-8
  const multiSeasonMatch = title.match(/\b(?:s(\d{1,2})[\s._-]*[-~]s?(\d{1,2})|seasons?[\s._-]*(\d{1,2})[\s._-]*(?:to|-|through)[\s._-]*(\d{1,2}))\b/i);
  if (multiSeasonMatch) {
    const sStart = parseInt(multiSeasonMatch[1] || multiSeasonMatch[3], 10);
    const sEnd = parseInt(multiSeasonMatch[2] || multiSeasonMatch[4], 10);
    return {
      isSeriesPack: true,
      seasonRange: [Math.min(sStart, sEnd), Math.max(sStart, sEnd)],
    };
  }

  if (/\b(?:complete[\s._-]*(?:series|collection)|all[\s._-]*seasons)\b/i.test(title)) {
    return { isSeriesPack: true };
  }

  // 2. Check for Season + Episode: S01E02, S1E2, 1x02, etc.
  const sxxexx = title.match(/\bs(\d{1,2})[\s._-]*[ex](\d{1,3})\b/i) ||
                 title.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (sxxexx) {
    return {
      season: parseInt(sxxexx[1], 10),
      episode: parseInt(sxxexx[2], 10),
      isSeasonPack: false,
    };
  }

  // Check for "Season X ... Episode Y"
  const sMatch = title.match(/\b(?:s|season)[\s._-]*(\d{1,2})\b/i);
  const epMatch = title.match(/\b(?:ep|episode)[\s._-]*(\d{1,3})\b/i);

  if (sMatch && epMatch) {
    return {
      season: parseInt(sMatch[1], 10),
      episode: parseInt(epMatch[1], 10),
      isSeasonPack: false,
    };
  }

  // 3. Season-only / Season Pack (S01, Season 1, etc.)
  if (sMatch) {
    return {
      season: parseInt(sMatch[1], 10),
      isSeasonPack: true,
    };
  }

  // 4. Episode-only (no season)
  if (epMatch) {
    return {
      episode: parseInt(epMatch[1], 10),
      isSeasonPack: false,
    };
  }

  return {};
}

/**
 * Check whether a title matches the given season & episode filter.
 */
export function matchesTvSeasonEpisode(
  title: string,
  filter: { season?: number | 'all'; episode?: number | 'all' }
): boolean {
  const { season, episode } = filter;
  const filterSeason = season !== undefined && season !== 'all' ? Number(season) : null;
  const filterEpisode = episode !== undefined && episode !== 'all' ? Number(episode) : null;

  // No filter applied -> matches all
  if (filterSeason === null && filterEpisode === null) {
    return true;
  }

  const info = parseTvTitleInfo(title);

  // If complete series pack with no specific season range
  if (info.isSeriesPack && !info.seasonRange) {
    return true;
  }

  // If multi-season pack with season range, check if requested season is within range
  if (info.isSeriesPack && info.seasonRange) {
    if (filterSeason !== null) {
      return filterSeason >= info.seasonRange[0] && filterSeason <= info.seasonRange[1];
    }
    return true;
  }

  // If filtering by season:
  if (filterSeason !== null) {
    if (info.season === undefined) {
      return false;
    }
    if (info.season !== filterSeason) {
      return false;
    }
  }

  // If filtering by episode:
  if (filterEpisode !== null) {
    // If exact episode, it must match
    if (info.episode !== undefined) {
      return info.episode === filterEpisode;
    }
    // If it's a season pack for the matching season, include it (packs contain all episodes)
    if (info.isSeasonPack) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Filter and sort results by relevance, strict title matching, and release year.
 */
export function filterByRelevance<T extends CandidateRelease>(
  results: T[],
  query: string,
  minScore: number = 30,
  options?: { year?: string; type?: 'movie' | 'tv'; season?: number; episode?: number }
): T[] {
  const targetYear = options?.year ? parseInt(options.year, 10) : NaN;
  const useYearFilter = (options?.type === 'movie' || options?.type === 'tv') && Number.isFinite(targetYear);

  return results
    .filter(r => options?.type !== 'movie' || matchesMovieTitleStrictly(r.title, query))
    .filter(r => options?.type !== 'tv' || matchesTvTitleStrictly(r.title, query))
    .filter(r => {
      if (options?.type !== 'tv') return true;
      if (options?.season === undefined && options?.episode === undefined) return true;
      return matchesTvSeasonEpisode(r.title, { season: options.season, episode: options.episode });
    })
    .map(r => {
      const baseScore = relevanceScore(r.title, query);
      if (!useYearFilter) {
        return { ...r, _score: baseScore, _yearBonus: 0, _hasExactYear: false, _hasConflictingYear: false };
      }

      const years = extractYears(r.title);
      const hasExactYear = years.includes(targetYear);
      const hasCloseYear = years.some(y => Math.abs(y - targetYear) <= 1);
      const hasConflictingYear = years.length > 0 && !hasExactYear && !hasCloseYear;

      // Prefer exact year heavily for movie queries with a given year.
      let yearBonus = 0;
      if (hasExactYear) yearBonus += 30;
      else if (hasCloseYear) yearBonus += 15; // Close year (+-1 year) is acceptable with a smaller bonus.
      else if (hasConflictingYear) yearBonus -= 40;
      else yearBonus += 5; // No explicit year still acceptable.

      return {
        ...r,
        _score: baseScore + yearBonus,
        _yearBonus: yearBonus,
        _hasExactYear: hasExactYear,
        _hasConflictingYear: hasConflictingYear,
      };
    })
    .filter(r => !(useYearFilter && (r as any)._hasConflictingYear))
    .filter(r => (r as any)._score >= minScore)
    .sort((a, b) => {
      // Prioritize exact episode hits when an episode is requested
      if (options?.type === 'tv' && options.episode !== undefined) {
        const aInfo = parseTvTitleInfo(a.title);
        const bInfo = parseTvTitleInfo(b.title);
        const aExactEp = aInfo.episode === options.episode;
        const bExactEp = bInfo.episode === options.episode;
        if (aExactEp !== bExactEp) return aExactEp ? -1 : 1;
      }

      const aExact = (a as any)._hasExactYear;
      const bExact = (b as any)._hasExactYear;
      if (aExact !== bExact) return aExact ? -1 : 1;
      return ((b as any)._score - (a as any)._score) || ((b.seeds || 0) - (a.seeds || 0));
    });
}

/**
 * Universal matcher for Direct Download items.
 * Validates movie title, prevents conflicting years, and ensures TV episodes match season & episode numbers.
 */
export function isDirectDownloadMatch(
  item: { name?: string; title?: string },
  queryTitle: string,
  options?: {
    year?: string | number | null;
    mediaType?: 'movie' | 'tv';
    season?: number;
    episode?: number;
  }
): boolean {
  if (!queryTitle) return true;
  const rawName = item.name || item.title || '';
  if (!rawName) return false;

  const mediaType = options?.mediaType || 'movie';
  const targetYear = options?.year ? parseInt(String(options.year), 10) : NaN;

  if (mediaType === 'movie') {
    // 1. Strict movie title matching (rejects extra words like "Maze Runner The Scorch Trials" for "The Runner")
    if (!matchesMovieTitleStrictly(rawName, queryTitle)) {
      return false;
    }

    // 2. Year validation: If targetYear is known and release has a year tag, reject conflicting years
    if (Number.isFinite(targetYear)) {
      const years = extractYears(rawName);
      if (years.length > 0) {
        const hasExactYear = years.includes(targetYear);
        const hasCloseYear = years.some((y) => Math.abs(y - targetYear) <= 1);
        if (!hasExactYear && !hasCloseYear) {
          return false;
        }
      }
    }

    return true;
  }

  // TV show validation
  if (options?.season && !options?.episode) {
    const itemInfo = parseTvTitleInfo(rawName);
    if (itemInfo.season != null && itemInfo.season !== options.season) {
      return false;
    }
  }

  const episodeQuery = options?.season && options?.episode
    ? { season: options.season, episode: options.episode }
    : extractEpisodeQuery(queryTitle);

  if (episodeQuery) {
    // If a specific episode is requested, reject season packs or batch releases
    if (/\b(?:complete|seasons?|series|pack|batch)\b/i.test(rawName) && !titleMatchesEpisode(rawName, episodeQuery)) {
      return false;
    }

    // If the release names an episode, it MUST match the requested episode
    const itemEpisode = extractEpisodeQuery(rawName);
    if (itemEpisode) {
      if (itemEpisode.season !== episodeQuery.season || itemEpisode.episode !== episodeQuery.episode) {
        return false;
      }
    } else if (!titleMatchesEpisode(rawName, episodeQuery)) {
      return false;
    }
  }

  return matchesTvTitleStrictly(rawName, queryTitle);
}
