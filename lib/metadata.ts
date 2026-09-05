import { MovieDb } from 'moviedb-promise';
import db from './db';
import { tmdbCache } from './cache';

// --- Configuration & Rate Limiting ---

export const TMDB_NOT_CONFIGURED_MESSAGE =
  'TMDB API key is not configured. Add one in Settings, or set TMDB_API_KEY in .env.local.';

/** Thrown when a TMDB-backed feature is used before a key has been supplied. */
export class TmdbNotConfiguredError extends Error {
  constructor() {
    super(TMDB_NOT_CONFIGURED_MESSAGE);
    this.name = 'TmdbNotConfiguredError';
  }
}

// Get TMDB API key from settings, then env. There is deliberately no bundled
// default — a shared key in a public repo gets scraped and rate-limited.
export function getTmdbApiKey(): string | null {
  try {
    // Try database setting first (if table exists)
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdbApiKey') as { value: string } | undefined;
    if (setting?.value?.trim()) return setting.value.trim();
  } catch {
    // ignore
  }
  return process.env.TMDB_API_KEY?.trim() || null;
}

export function isTmdbConfigured(): boolean {
  return getTmdbApiKey() !== null;
}

export function getOmdbApiKey(): string {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('omdbApiKey') as { value: string } | undefined;
    if (setting?.value) return setting.value;
  } catch {
    // ignore
  }
  return process.env.OMDB_API_KEY || '';
}

// Global rate limiter state
let lastTmdbCall = 0;
let tmdbQueue: Promise<void> = Promise.resolve();
let cachedTmdbClient: { apiKey: string; client: MovieDb } | null = null;
const TMDB_DELAY_MS = 200; // Conservative 200ms

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isRateLimitError(error: unknown): boolean {
  const maybeError = error as { response?: { status?: number }; status?: number };
  return maybeError?.response?.status === 429 || maybeError?.status === 429;
}

async function waitForTmdbSlot(): Promise<void> {
  const scheduled = tmdbQueue.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, TMDB_DELAY_MS - (now - lastTmdbCall));
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastTmdbCall = Date.now();
  });

  tmdbQueue = scheduled.catch(() => undefined);
  return scheduled;
}

export function getTmdbClient(): MovieDb {
  const apiKey = getTmdbApiKey();
  if (!apiKey) throw new TmdbNotConfiguredError();
  if (!cachedTmdbClient || cachedTmdbClient.apiKey !== apiKey) {
    cachedTmdbClient = { apiKey, client: new MovieDb(apiKey) };
  }
  return cachedTmdbClient.client;
}

export async function rateLimitedTmdbCall<T>(fn: () => Promise<T>): Promise<T> {
  await waitForTmdbSlot();

  try {
    return await fn();
  } catch (error: unknown) {
    if (isRateLimitError(error)) {
      console.warn('TMDB rate limit hit, waiting 2s...');
      await sleep(2000);
      await waitForTmdbSlot();
      return await fn();
    }
    throw error;
  }
}

export async function cachedTmdbCall<T>(cacheKey: string, fn: () => Promise<T>, ttlMins = 30): Promise<T> {
  return tmdbCache.getOrSet(
    cacheKey,
    () => rateLimitedTmdbCall(fn),
    ttlMins * 60 * 1000
  ) as Promise<T>;
}

// --- Filename Cleaning ---

export function stripReleaseSitePrefix(name: string): string {
  let clean = name.trim();

  // 1. Release sites starting with www (e.g., "www.1TamilMV.report - Peddi", "www.1TamilMV.durban - Blast", "www.site.com - Movie")
  clean = clean.replace(/^www\.[a-z0-9.-]+\.[a-z]{2,12}\s*[-–—:]+\s*/i, "");

  // 2. Release sites with known TLDs and separated by hyphen/colon (e.g. "1TamilMV.report - Peddi", "UIndex.org - Movie", "1TamilMV.pm - Movie")
  // Must have letters in domain and require space around separator (so "1080p.WEB-DL" is never matched)
  clean = clean.replace(/^[a-z0-9-]*[a-z][a-z0-9-]*\.[a-z]{2,12}\s+[-–—:]+\s*/i, "");
  clean = clean.replace(/^[a-z0-9-]*[a-z][a-z0-9-]*\.[a-z]{2,12}\s*[-–—:]\s+/i, "");

  // 3. Dot-replaced or space-separated tracker names without dot TLD (e.g., "Www 1Tamilmv Report - Peddi", "1Tamilmv - Peddi", "Tamilblasters - Movie")
  clean = clean.replace(/^(?:www[\s._]+)?[0-9]*[a-z0-9_-]*(?:tamilmv|tamilblasters|tamilrockers|moviesda|isaimini|bolly4u|worldfree4u|9xmovies|extramovies|uhdmovies|yts|yify|rarbg|cinevood|telugupalaka|ibomma|todaypk)[a-z0-9_ -]*\s*[-–—:]+\s*/i, "");

  // 4. Generic "www [words] - [title]"
  clean = clean.replace(/^www[\s._]+[a-z0-9._ -]+?\s+[-–—:]+\s*/i, "");

  // 5. Leading group brackets (e.g., "[1TamilMV.org] " or "(1TamilMV) ")
  clean = clean.replace(/^(?:\[[^\]]+\]|\([^\)]+\))[\s._-]*/, "");

  return clean;
}

export function cleanFilename(name: string): string {
  let clean = name.replace(/\.[^/.]+$/, ""); // Remove ext

  // Remove Website Prefixes
  clean = stripReleaseSitePrefix(clean);
  clean = clean.replace(/^www\.[a-zA-Z0-9-]+\.[a-z]{2,4}\s*[-_]\s*/i, "");
  clean = clean.replace(/^\[.*?\]\s*/i, ""); // Remove [group] tags

  // Normalize release separators before token stripping. Underscores are word
  // characters, so tokens like "_TRUE_WEB-DL" otherwise do not match cleanly.
  clean = clean.replace(/[._]+/g, " ");

  // Remove A.K.A, AKA, A K A, A.K.A. and everything after
  clean = clean.replace(/\b(?:A[\s._]*K[\s._]*A|AKA)\b.*/i, "");

  // Remove common scene tags, release-quality labels & languages
  clean = clean.replace(/\b(HC|HDCAM|CAMRip|CAM|HDTS|TS|TELESYNC|TC|TELECINE|DVDSCR|SCR|PREHD|1080p|720p|480p|2160p|4k|UHD|BluRay|Blu-Ray|BDRip|WEBRip|WEB-DL|DVDRip|HDTV|x264|x265|H\.?264|H\.?265|AAC|AC3|EAC3|DDP|DTS|HDR|HDR10|HDR10Plus|DV|Dolby|Atmos|HEVC|HQ|HDRip|TRUE|PROPER|REMASTERED|EXTENDED|UNCUT|DIRECTORS|CUT|DUAL|MULTI|HIN\d*x?|Hindi|Telugu|Tamil|TAM|TEL|Malayalam|Kannada|English|EngSub|ESub|AMZN|NF|DSNP|HMAX|IMAX|REPACK|Remux|10bit|6CH|8CH|PSA|YTS|YIFY|RARBG)\b.*/i, "");

  // Check if there was a year in brackets (e.g. "Blade Runner 2049 (2017)")
  const hadBracketedYear = /[\(\[\{]\s*(19|20)\d{2}\s*[\)\]\}]/.test(clean);

  // Remove year in brackets/parentheses
  clean = clean.replace(/[\(\[\{]\s*(19|20)\d{2}\s*[\)\]\}]/g, "");

  // Remove other bracketed content
  clean = clean.replace(/[\(\[\{].*?[\)\]\}]/g, "");

  // Remove trailing standalone year only when preceded by other words and not already having a bracketed year (e.g. "Inception 2010" -> "Inception", "1992 2024" -> "1992")
  if (!hadBracketedYear && /\S+\s+(19|20)\d{2}\s*$/.test(clean)) {
    clean = clean.replace(/\s+(19|20)\d{2}\s*$/g, "");
  }

  // Remove leading and trailing junk, hyphens, dashes
  clean = clean.replace(/^[-–—\s._]+/, "").replace(/[-–—\s._]+$/, "").trim();

  // Remove extra spaces
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

export function extractYear(name: string): number | undefined {
  // 1. Prefer parenthesized / bracketed 4-digit years: (2024), [2019], {1992}
  const bracketMatch = name.match(/[\(\[\{]\s*(19\d{2}|20\d{2})\s*[\)\]\}]/);
  if (bracketMatch) {
    return parseInt(bracketMatch[1], 10);
  }

  // 2. Remove file extension and normalize separators
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  const normalized = withoutExt.replace(/[._]/g, ' ');

  // 3. Find all 4-digit year matches (1900–2099)
  const matches = Array.from(normalized.matchAll(/\b(19\d{2}|20\d{2})\b/g));
  if (matches.length === 0) return undefined;
  if (matches.length === 1) {
    return parseInt(matches[0][1], 10);
  }

  // 4. When multiple years exist (e.g., "1992.2024.1080p", "Blade.Runner.2049.2017"):
  // The release year is the last year token!
  const lastMatch = matches[matches.length - 1];
  return parseInt(lastMatch[1], 10);
}

function extractImdbId(name: string): string | null {
  return name.match(/\btt\d{7,9}\b/i)?.[0].toLowerCase() || null;
}

export function normalizeShowName(name: string): string {
  if (!name) return '';

  let normalized = stripReleaseSitePrefix(name)
    .replace(/\.[^/.]+$/, '')
    .replace(/[._]/g, ' ')
    .replace(/[\(\[\{].*?[\)\]\}]/g, ' ')
    .replace(/\bS\d{1,2}\s*E\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,2}x\d{1,2}\b/gi, ' ')
    .replace(/\bseason\s*\d+\b/gi, ' ')
    .replace(/\bepisode\s*\d+\b/gi, ' ')
    .replace(/\b(2160p|1080p|720p|480p|WEBRip|WEB-DL|BluRay|BDRip|HDTV|x264|x265|H\.?264|H\.?265|HEVC|AAC|AC3|DTS|HDR|HDR10|DV|PROPER|REPACK|Remux)\b/gi, ' ')
    .replace(/\s+\((19|20)\d{2}\)\s*$/g, ' ')
    .trim();

  // Remove trailing year only when there is another token before it.
  normalized = normalized.replace(/\s+(19|20)\d{2}\s*$/g, '').trim();

  return normalized.replace(/\s+/g, ' ').trim();
}

export function normalizeShowNameForMatch(name: string): string {
  return normalizeShowName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const LANGUAGE_KEYWORD_MAP: Record<string, string> = {
  en: 'English',
  eng: 'English',
  english: 'English',
  ta: 'Tamil',
  tam: 'Tamil',
  tamil: 'Tamil',
  te: 'Telugu',
  tel: 'Telugu',
  telugu: 'Telugu',
  hi: 'Hindi',
  hin: 'Hindi',
  hindi: 'Hindi',
  ml: 'Malayalam',
  mal: 'Malayalam',
  malayalam: 'Malayalam',
  kn: 'Kannada',
  kan: 'Kannada',
  kannada: 'Kannada',
  ja: 'Japanese',
  jap: 'Japanese',
  jpn: 'Japanese',
  japanese: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  korean: 'Korean',
  es: 'Spanish',
  spa: 'Spanish',
  spanish: 'Spanish',
  fr: 'French',
  fre: 'French',
  fra: 'French',
  french: 'French',
  de: 'German',
  ger: 'German',
  deu: 'German',
  german: 'German',
  it: 'Italian',
  ita: 'Italian',
  italian: 'Italian',
  ru: 'Russian',
  rus: 'Russian',
  russian: 'Russian',
  zh: 'Chinese',
  zho: 'Chinese',
  chi: 'Chinese',
  chinese: 'Chinese',
  mandarin: 'Chinese',
  cantonese: 'Cantonese',
  bn: 'Bengali',
  ben: 'Bengali',
  bengali: 'Bengali',
  pa: 'Punjabi',
  pan: 'Punjabi',
  punjabi: 'Punjabi',
  mr: 'Marathi',
  mar: 'Marathi',
  marathi: 'Marathi',
  ar: 'Arabic',
  ara: 'Arabic',
  arabic: 'Arabic',
  pt: 'Portuguese',
  por: 'Portuguese',
  portuguese: 'Portuguese',
  tr: 'Turkish',
  tur: 'Turkish',
  turkish: 'Turkish',
  th: 'Thai',
  tha: 'Thai',
  thai: 'Thai',
  id: 'Indonesian',
  ind: 'Indonesian',
  indonesian: 'Indonesian',
  sv: 'Swedish',
  swe: 'Swedish',
  swedish: 'Swedish',
  da: 'Danish',
  dan: 'Danish',
  danish: 'Danish',
  no: 'Norwegian',
  nor: 'Norwegian',
  norwegian: 'Norwegian',
  nl: 'Dutch',
  nld: 'Dutch',
  dutch: 'Dutch',
  pl: 'Polish',
  pol: 'Polish',
  polish: 'Polish',
};

export function resolveLanguageName(
  codeOrName?: string | null,
  filenameOrTitle?: string | null,
  defaultLanguage: string | null = 'English'
): string | null {
  if (codeOrName && typeof codeOrName === 'string') {
    const trimmed = codeOrName.trim();
    if (trimmed.length > 0) {
      const lower = trimmed.toLowerCase();
      if (LANGUAGE_KEYWORD_MAP[lower]) {
        return LANGUAGE_KEYWORD_MAP[lower];
      }

      try {
        const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
        const name = displayNames.of(lower);
        if (name && name !== lower && !/^[a-z]{2,3}$/i.test(name)) {
          return name.charAt(0).toUpperCase() + name.slice(1);
        }
      } catch {}

      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
  }

  if (filenameOrTitle && typeof filenameOrTitle === 'string') {
    const match = filenameOrTitle.match(/\b(Tamil|Telugu|Hindi|Malayalam|Kannada|Japanese|Korean|Spanish|French|German|Italian|Russian|Chinese|Cantonese|Mandarin|English|Bengali|Punjabi|Marathi|Arabic|Portuguese|Turkish|Thai|Indonesian|Swedish|Danish|Norwegian|Dutch|Polish|TAM|TEL|HIN|MAL|KAN|JAP|JPN|KOR|SPA|FRE|FRA|GER|DEU|ITA|RUS|ZHO|CHI|ENG|ARA|POR|TUR|THA|IND|SWE|DAN|NOR|NLD|POL)\b/i);
    if (match) {
      const key = match[1].toLowerCase();
      if (LANGUAGE_KEYWORD_MAP[key]) {
        return LANGUAGE_KEYWORD_MAP[key];
      }
    }
  }

  return defaultLanguage;
}

// --- Metadata Fetching ---

export interface MediaMetadata {
  title: string;
  tmdbId: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  imdbRating: number | null;
  genres: string | null;
  language?: string | null;
  year?: number | null; // For movies
  firstAirDate?: string | null; // For shows
}

type OmdbRatingResponse = {
  Response?: string;
  imdbRating?: string;
  Error?: string;
};

type OmdbMovieResponse = OmdbRatingResponse & {
  Title?: string;
  Year?: string;
  Plot?: string;
  Poster?: string;
  Genre?: string;
  Language?: string;
};

type ImdbSuggestionItem = {
  id?: string;
  l?: string;
  q?: string;
  qid?: string;
  y?: number;
  i?: {
    imageUrl?: string;
  };
};

type ImdbSuggestionResponse = {
  d?: ImdbSuggestionItem[];
};

export async function fetchImdbRatingById(imdbId?: string | null): Promise<number | null> {
  const apiKey = getOmdbApiKey();
  if (!apiKey || !imdbId) return null;

  const cacheKey = `omdb-rating-${imdbId}`;
  const cached = tmdbCache.get(cacheKey) as number | null;
  if (cached !== null) return cached;

  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LFLIX/0.3' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = await res.json() as OmdbRatingResponse;
    if (data.Response === 'False' || !data.imdbRating || data.imdbRating === 'N/A') return null;

    const rating = parseFloat(data.imdbRating);
    if (!Number.isFinite(rating) || rating <= 0) return null;

    tmdbCache.set(cacheKey, rating, 24 * 60 * 60 * 1000);
    return rating;
  } catch (e) {
    console.warn(`OMDb rating fetch failed for ${imdbId}:`, e);
    return null;
  }
}

async function fetchOmdbMovieMetadata(imdbId: string): Promise<Partial<MediaMetadata> | null> {
  const apiKey = getOmdbApiKey();
  if (!apiKey) return null;

  const cacheKey = `omdb-movie-${imdbId}`;
  const cached = tmdbCache.get(cacheKey) as Partial<MediaMetadata> | null;
  if (cached) return cached;

  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LFLIX/0.3' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = await res.json() as OmdbMovieResponse;
    if (data.Response === 'False') return null;

    const year = data.Year?.match(/\b(19|20)\d{2}\b/)?.[0];
    const imdbRating = data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null;
    const metadata: Partial<MediaMetadata> = {
      title: data.Title || undefined,
      year: year ? parseInt(year, 10) : undefined,
      posterPath: data.Poster && data.Poster !== 'N/A' ? data.Poster : undefined,
      overview: data.Plot && data.Plot !== 'N/A' ? data.Plot : undefined,
      imdbRating: imdbRating && Number.isFinite(imdbRating) ? imdbRating : null,
      genres: data.Genre && data.Genre !== 'N/A' ? data.Genre : undefined,
      language: data.Language && data.Language !== 'N/A' ? resolveLanguageName(data.Language.split(',')[0]) : undefined,
    };

    tmdbCache.set(cacheKey, metadata, 24 * 60 * 60 * 1000);
    return metadata;
  } catch (e) {
    console.warn(`OMDb movie metadata fetch failed for ${imdbId}:`, e);
    return null;
  }
}

function imdbSuggestionKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

async function fetchImdbSuggestionMovie(fileName: string, title: string, year?: number): Promise<MediaMetadata | null> {
  const imdbIdFromName = extractImdbId(fileName);
  const suggestionQuery = imdbIdFromName || imdbSuggestionKey(title);
  if (!suggestionQuery) return null;

  const cacheKey = `imdb-suggest-movie-${suggestionQuery}-${year || 'any'}`;
  const cached = tmdbCache.get(cacheKey) as MediaMetadata | null;
  if (cached) return cached;

  try {
    const bucket = suggestionQuery[0].toLowerCase();
    const url = `https://v3.sg.media-imdb.com/suggestion/${encodeURIComponent(bucket)}/${encodeURIComponent(suggestionQuery)}.json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LFLIX/0.3' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = await res.json() as ImdbSuggestionResponse;
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matches = (data.d || []).filter(item => item.id?.startsWith('tt') && (item.qid === 'movie' || item.q === 'feature'));
    const hit = matches.find(item => item.id?.toLowerCase() === imdbIdFromName)
      || matches.find(item => {
        const itemTitle = (item.l || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const yearMatches = !year || !item.y || item.y === year;
        return itemTitle === normalizedTitle && yearMatches;
      })
      || matches.find(item => {
        const itemTitle = (item.l || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return itemTitle === normalizedTitle;
      });

    if (!hit?.l) return null;

    const omdbMeta = hit.id ? await fetchOmdbMovieMetadata(hit.id) : null;
    const metadata: MediaMetadata = {
      title: omdbMeta?.title || hit.l || title,
      year: omdbMeta?.year ?? hit.y ?? year ?? null,
      tmdbId: null,
      posterPath: omdbMeta?.posterPath || hit.i?.imageUrl || null,
      backdropPath: null,
      overview: omdbMeta?.overview || null,
      rating: null,
      imdbRating: omdbMeta?.imdbRating ?? null,
      genres: omdbMeta?.genres || null,
      language: omdbMeta?.language || resolveLanguageName(null, fileName),
    };

    tmdbCache.set(cacheKey, metadata, 24 * 60 * 60 * 1000);
    return metadata;
  } catch (e) {
    console.warn(`IMDb suggestion metadata fetch failed for ${title}:`, e);
    return null;
  }
}

async function fetchMovieImdbRating(moviedb: MovieDb, tmdbId?: number | null): Promise<number | null> {
  if (!tmdbId) return null;
  try {
    const externalIds = await cachedTmdbCall(`movie-external-ids-${tmdbId}`, () =>
      moviedb.movieExternalIds({ id: tmdbId }),
      24 * 60
    );
    return fetchImdbRatingById(externalIds.imdb_id || null);
  } catch {
    return null;
  }
}

async function fetchShowImdbRating(moviedb: MovieDb, tmdbId?: number | null): Promise<number | null> {
  if (!tmdbId) return null;
  try {
    const externalIds = await cachedTmdbCall(`tv-external-ids-${tmdbId}`, () =>
      moviedb.tvExternalIds({ id: tmdbId }),
      24 * 60
    );
    return fetchImdbRatingById(externalIds.imdb_id || null);
  } catch {
    return null;
  }
}

async function fetchGenres(moviedb: MovieDb, genreIds: number[], type: 'movie' | 'tv'): Promise<string> {
  try {
    const genreList = await cachedTmdbCall(`tmdb-genres-${type}`, () =>
      type === 'movie'
        ? moviedb.genreMovieList({})
        : moviedb.genreTvList({}),
      24 * 60
    );

    const genreMap = new Map(genreList.genres?.map(g => [g.id, g.name]) || []);
    return genreIds.map(id => genreMap.get(id)).filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

export async function fetchMovieMetadata(fileName: string): Promise<MediaMetadata> {
  const rawName = cleanFilename(fileName);
  const year = extractYear(fileName);

  const baseData: MediaMetadata = {
    title: rawName,
    year: year || null,
    tmdbId: null,
    posterPath: null,
    backdropPath: null,
    overview: null,
    rating: null,
    imdbRating: null,
    genres: null,
    language: resolveLanguageName(null, fileName)
  };

  try {
    const moviedb = getTmdbClient();
    const imdbId = extractImdbId(fileName);

    let res: any = { results: [] };

    // Primary: Query TMDB by extracted title + release year if present
    if (year) {
      res = await cachedTmdbCall(`tmdb-movie-search-${rawName.toLowerCase()}-${year}`, () =>
        moviedb.searchMovie({ query: rawName, primary_release_year: year }),
        24 * 60
      );
    } else {
      res = await cachedTmdbCall(`tmdb-movie-search-${rawName.toLowerCase()}`, () =>
        moviedb.searchMovie({ query: rawName }),
        24 * 60
      );
    }

    // Fallback 1: Year was extracted, but primary_release_year might be slightly off (e.g. festival vs theatrical). Try free-text query with year
    if ((!res.results || res.results.length === 0) && year) {
      const fallbackQuery = `${rawName} ${year}`.trim();
      res = await cachedTmdbCall(`tmdb-movie-search-${fallbackQuery.toLowerCase()}`, () =>
        moviedb.searchMovie({ query: fallbackQuery }),
        24 * 60
      );
    }

    // Fallback 2: The extracted year might be incorrect or missing from TMDB, try without it
    if ((!res.results || res.results.length === 0) && year) {
      res = await cachedTmdbCall(`tmdb-movie-search-${rawName.toLowerCase()}`, () =>
        moviedb.searchMovie({ query: rawName }),
        24 * 60
      );
    }

    if (res.results && res.results.length > 0) {
      const targetKey = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const scored = [...res.results].sort((a, b) => {
        const aTitle = (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const aOrigTitle = (a.original_title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const bTitle = (b.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const bOrigTitle = (b.original_title || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        // Title score: 10 points for exact title match, 3 points if starting with query
        const aExact = (aTitle === targetKey || aOrigTitle === targetKey) ? 10 : ((aTitle.startsWith(targetKey) || aOrigTitle.startsWith(targetKey)) ? 3 : 0);
        const bExact = (bTitle === targetKey || bOrigTitle === targetKey) ? 10 : ((bTitle.startsWith(targetKey) || bOrigTitle.startsWith(targetKey)) ? 3 : 0);

        const aYear = a.release_date ? parseInt(a.release_date.substring(0, 4), 10) : undefined;
        const bYear = b.release_date ? parseInt(b.release_date.substring(0, 4), 10) : undefined;

        // Year score: 4 points if exact year, 2 points if within 1 year
        const aYearScore = year && aYear ? (aYear === year ? 4 : Math.abs(aYear - year) <= 1 ? 2 : 0) : 0;
        const bYearScore = year && bYear ? (bYear === year ? 4 : Math.abs(bYear - year) <= 1 ? 2 : 0) : 0;

        const aScore = aExact + aYearScore;
        const bScore = bExact + bYearScore;

        if (bScore !== aScore) return bScore - aScore;
        return (b.popularity || 0) - (a.popularity || 0);
      });

      const hit = scored[0];
      const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'movie') : '';
      const imdbRating = await fetchMovieImdbRating(moviedb, hit.id || null);
      const language = resolveLanguageName(hit.original_language, fileName);

      return {
        title: hit.title || rawName,
        year: hit.release_date ? parseInt(hit.release_date.substring(0, 4)) : year,
        tmdbId: hit.id || null,
        posterPath: hit.poster_path || null,
        backdropPath: hit.backdrop_path || null,
        overview: hit.overview || null,
        rating: hit.vote_average || null,
        imdbRating,
        genres,
        language
      };
    }
  } catch (e) {
    console.warn(`TMDB fetch failed for movie: ${rawName}`, e);
  }

  const imdbFallback = await fetchImdbSuggestionMovie(fileName, rawName, year);
  if (imdbFallback) {
    return imdbFallback;
  }

  return baseData;
}

export async function fetchShowMetadata(showName: string): Promise<MediaMetadata> {
  const normalizedInput = normalizeShowName(showName) || showName.trim();
  const strippedYear = normalizedInput.replace(/\s+(19|20)\d{2}\s*$/g, '').trim();
  const hintedYear = extractYear(showName);

  const baseData: MediaMetadata = {
    title: normalizedInput || showName,
    tmdbId: null,
    posterPath: null,
    backdropPath: null,
    overview: null,
    rating: null,
    imdbRating: null,
    genres: null,
    language: resolveLanguageName(null, showName),
    firstAirDate: null
  };

  try {
    // Inside the try so a missing TMDB key degrades to filename-derived data
    // rather than aborting the scan for this show.
    const moviedb = getTmdbClient();

    const candidates = Array.from(
      new Set([showName, normalizedInput, strippedYear].map(s => s.trim()).filter(Boolean))
    );

    const targetKey = normalizeShowNameForMatch(normalizedInput || showName);

    for (const query of candidates) {
      const res = await cachedTmdbCall(`tmdb-tv-search-${query.toLowerCase()}`, () =>
        moviedb.searchTv({ query }),
        24 * 60
      );
      if (!res.results || res.results.length === 0) continue;

      const scored = [...res.results].sort((a, b) => {
        const aKey = normalizeShowNameForMatch(a.name || '');
        const bKey = normalizeShowNameForMatch(b.name || '');
        const aOrigKey = normalizeShowNameForMatch(a.original_name || '');
        const bOrigKey = normalizeShowNameForMatch(b.original_name || '');

        const aNameScore = (aKey === targetKey || aOrigKey === targetKey) ? 10 : ((aKey.startsWith(targetKey) || aOrigKey.startsWith(targetKey)) ? 3 : 0);
        const bNameScore = (bKey === targetKey || bOrigKey === targetKey) ? 10 : ((bKey.startsWith(targetKey) || bOrigKey.startsWith(targetKey)) ? 3 : 0);

        const aYear = a.first_air_date ? parseInt(a.first_air_date.substring(0, 4), 10) : undefined;
        const bYear = b.first_air_date ? parseInt(b.first_air_date.substring(0, 4), 10) : undefined;

        const aYearScore = hintedYear && aYear ? (aYear === hintedYear ? 4 : Math.abs(aYear - hintedYear) <= 1 ? 2 : 0) : 0;
        const bYearScore = hintedYear && bYear ? (bYear === hintedYear ? 4 : Math.abs(bYear - hintedYear) <= 1 ? 2 : 0) : 0;

        const aScore = aNameScore + aYearScore;
        const bScore = bNameScore + bYearScore;

        if (bScore !== aScore) return bScore - aScore;
        return (b.popularity || 0) - (a.popularity || 0);
      });

      const hit = scored[0];
      const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'tv') : '';
      const imdbRating = await fetchShowImdbRating(moviedb, hit.id || null);
      const language = resolveLanguageName(hit.original_language, showName);

      return {
        title: hit.name || normalizedInput || showName,
        tmdbId: hit.id || null,
        posterPath: hit.poster_path || null,
        backdropPath: hit.backdrop_path || null,
        overview: hit.overview || null,
        rating: hit.vote_average || null,
        imdbRating,
        genres,
        language,
        firstAirDate: hit.first_air_date || null
      };
    }
  } catch (e) {
    console.warn(`TMDB fetch failed for show: ${normalizedInput || showName}`, e);
  }

  return baseData;
}

// --- Episode Metadata ---

export interface EpisodeMetadata {
  title: string;
  overview: string | null;
  stillPath: string | null;
  rating: number | null;
  /**
   * How many TMDB votes the rating is based on. A just-aired episode routinely
   * sits at 1.0 or 2.8 off three or four votes, which is noise rather than a
   * rating, so callers need this to decide whether the score is worth showing.
   */
  voteCount: number | null;
}

/**
 * TMDB names an episode "Episode 7" until someone fills the real title in.
 * Combined with our own `S3 E7` fallback, these are the two shapes that mean
 * "no real title yet" and should be re-fetched later rather than kept forever.
 */
export function isPlaceholderEpisodeTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim();
  if (!trimmed) return true;
  return /^(episode\s*\d+|s\d+\s*e\d+)$/i.test(trimmed);
}

/** Below this, a TMDB episode score is too thinly voted to display. */
export const MIN_EPISODE_VOTES = 10;

/**
 * The series IMDb id for a show, cached in the DB after the first lookup.
 * Needed to ask OMDb for episode ratings.
 */
export async function fetchShowImdbId(tmdbShowId: number): Promise<string | null> {
  try {
    const result = await cachedTmdbCall(
      `tmdb-tv-external-${tmdbShowId}`,
      () => getTmdbClient().tvExternalIds({ id: tmdbShowId }),
      24 * 60
    );
    const imdbId = (result as { imdb_id?: string | null }).imdb_id;
    return imdbId && /^tt\d+$/i.test(imdbId) ? imdbId : null;
  } catch {
    return null;
  }
}

type OmdbSeasonResponse = {
  Response?: string;
  Episodes?: { Episode?: string; Title?: string; imdbRating?: string; imdbID?: string }[];
};

/**
 * IMDb ratings for a whole season, keyed by episode number.
 *
 * OMDb returns the entire season in a single request, so this costs one call
 * per season rather than one per episode. Episodes IMDb has not rated yet come
 * back as "N/A" and are omitted rather than stored as 0.
 */
export async function fetchSeasonImdbRatings(
  seriesImdbId: string,
  seasonNumber: number
): Promise<Map<number, number>> {
  const ratings = new Map<number, number>();
  const apiKey = getOmdbApiKey();
  if (!apiKey || !seriesImdbId) return ratings;

  const cacheKey = `omdb-season-${seriesImdbId}-${seasonNumber}`;
  const cached = tmdbCache.get(cacheKey) as Map<number, number> | null;
  if (cached) return cached;

  try {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(seriesImdbId)}&Season=${seasonNumber}&apikey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return ratings;

    const data = (await response.json()) as OmdbSeasonResponse;
    if (data.Response === 'False' || !Array.isArray(data.Episodes)) return ratings;

    for (const episode of data.Episodes) {
      const number = Number.parseInt(episode.Episode || '', 10);
      const rating = Number.parseFloat(episode.imdbRating || '');
      if (Number.isInteger(number) && Number.isFinite(rating) && rating > 0) {
        ratings.set(number, rating);
      }
    }

    // Short TTL while a season is still airing so new ratings appear promptly.
    tmdbCache.set(cacheKey, ratings, 6 * 60 * 60 * 1000);
  } catch (e) {
    console.warn(`OMDb season rating fetch failed for ${seriesImdbId} S${seasonNumber}:`, e);
  }

  return ratings;
}

// Cache season data within a scan session to avoid redundant API calls
const seasonCache = new Map<string, EpisodeMetadata[]>();

export async function fetchEpisodeMetadata(
  tmdbShowId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<EpisodeMetadata> {
  const fallback: EpisodeMetadata = {
    title: `S${seasonNumber} E${episodeNumber}`,
    overview: null,
    stillPath: null,
    rating: null,
    voteCount: null,
  };

  if (!tmdbShowId || tmdbShowId <= 0) return fallback;

  const cacheKey = `${tmdbShowId}-${seasonNumber}`;

  try {
    // Check cache first
    if (!seasonCache.has(cacheKey)) {
      const moviedb = getTmdbClient();

      const seasonData = await cachedTmdbCall(`tmdb-season-${tmdbShowId}-${seasonNumber}`, () =>
        moviedb.seasonInfo({ id: tmdbShowId, season_number: seasonNumber }),
        24 * 60
      );

      if (seasonData.episodes) {
        const episodes: EpisodeMetadata[] = seasonData.episodes.map(ep => ({
          title: ep.name || `Episode ${ep.episode_number}`,
          overview: ep.overview || null,
          stillPath: ep.still_path || null,
          rating: ep.vote_average ?? null,
          voteCount: ep.vote_count ?? null,
        }));
        seasonCache.set(cacheKey, episodes);
      } else {
        seasonCache.set(cacheKey, []);
      }
    }

    const cachedEpisodes = seasonCache.get(cacheKey) || [];
    // Episodes in TMDB are 1-indexed by episode_number, but array is 0-indexed
    // Find by index (episode_number - 1) or search through if order doesn't match
    const episode = cachedEpisodes[episodeNumber - 1];
    if (episode) {
      return {
        title: episode.title,
        overview: episode.overview,
        stillPath: episode.stillPath,
        rating: episode.rating,
        voteCount: episode.voteCount,
      };
    }
  } catch (e) {
    console.warn(`TMDB episode fetch failed for show ${tmdbShowId} S${seasonNumber}E${episodeNumber}:`, e);
  }

  return fallback;
}

// Clear season cache (call after a full scan session)
export function clearEpisodeCache() {
  seasonCache.clear();
}

export async function syncMediaLanguageFromTmdb(tmdbId: number, type: 'movie' | 'tv'): Promise<string | null> {
  try {
    const moviedb = getTmdbClient();
    if (type === 'movie') {
      const data = await cachedTmdbCall(`tmdb-movie-info-lang-${tmdbId}`, () =>
        moviedb.movieInfo({ id: tmdbId }),
        30 * 24 * 60
      ) as any;
      if (data?.original_language) {
        return resolveLanguageName(data.original_language, data.title || null);
      }
    } else {
      const data = await cachedTmdbCall(`tmdb-tv-info-lang-${tmdbId}`, () =>
        moviedb.tvInfo({ id: tmdbId }),
        30 * 24 * 60
      ) as any;
      if (data?.original_language) {
        return resolveLanguageName(data.original_language, data.name || null);
      }
    }
  } catch (e) {
    console.warn(`[Metadata] Failed to fetch TMDB language for ${type} ${tmdbId}:`, e);
  }
  return null;
}

let hasSyncedLanguages = false;

export async function syncAllLibraryLanguages(): Promise<void> {
  if (hasSyncedLanguages) return;
  hasSyncedLanguages = true;

  try {
    const movies = db.prepare('SELECT id, tmdbId, title, fileName, language FROM movies WHERE tmdbId IS NOT NULL AND tmdbId > 0').all() as { id: number; tmdbId: number; title: string; fileName: string; language: string | null }[];
    for (const m of movies) {
      try {
        const lang = await syncMediaLanguageFromTmdb(m.tmdbId, 'movie');
        if (lang && lang !== m.language) {
          db.prepare('UPDATE movies SET language = ? WHERE id = ?').run(lang, m.id);
          console.log(`[Metadata] Synced TMDB language for movie "${m.title}": ${lang}`);
        }
      } catch {}
      await new Promise(r => setTimeout(r, 20));
    }

    const shows = db.prepare('SELECT id, tmdbId, title, language FROM shows WHERE tmdbId IS NOT NULL AND tmdbId > 0').all() as { id: number; tmdbId: number; title: string; language: string | null }[];
    for (const s of shows) {
      try {
        const lang = await syncMediaLanguageFromTmdb(s.tmdbId, 'tv');
        if (lang && lang !== s.language) {
          db.prepare('UPDATE shows SET language = ? WHERE id = ?').run(lang, s.id);
          console.log(`[Metadata] Synced TMDB language for show "${s.title}": ${lang}`);
        }
      } catch {}
      await new Promise(r => setTimeout(r, 20));
    }
  } catch (e) {
    console.warn('[Metadata] Language sync error:', e);
  }
}
