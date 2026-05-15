import { MovieDb } from 'moviedb-promise';
import db from './db';
import { tmdbCache } from './cache';

// --- Configuration & Rate Limiting ---

// Get TMDB API key from settings or env
export function getTmdbApiKey(): string {
  try {
    // Try database setting first (if table exists)
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdbApiKey') as { value: string } | undefined;
    if (setting?.value) return setting.value;
  } catch {
    // ignore
  }
  // Fallback to env or default
  return process.env.TMDB_API_KEY || '3d8c8476371d0730fb5bd7ae67241879';
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
const TMDB_DELAY_MS = 200; // Conservative 200ms

export async function rateLimitedTmdbCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const timeSinceLastCall = now - lastTmdbCall;

  if (timeSinceLastCall < TMDB_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, TMDB_DELAY_MS - timeSinceLastCall));
  }

  lastTmdbCall = Date.now();

  try {
    return await fn();
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.warn('TMDB rate limit hit, waiting 2s...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      lastTmdbCall = Date.now();
      return await fn();
    }
    throw error;
  }
}

export async function cachedTmdbCall<T>(cacheKey: string, fn: () => Promise<T>, ttlMins = 30): Promise<T> {
  const cached = tmdbCache.get(cacheKey) as T | null;
  if (cached) return cached;
  
  const result = await rateLimitedTmdbCall(fn);
  if (result !== undefined && result !== null) {
    tmdbCache.set(cacheKey, result, ttlMins * 60 * 1000);
  }
  return result;
}

// --- Filename Cleaning ---

function stripReleaseSitePrefix(name: string): string {
  let clean = name.trim();

  // Handles release-site prefixes like:
  // "www.UIndex.org - Movie", "www 1TamilMV.center - Movie", "1TamilMV.center - Movie"
  clean = clean.replace(/^(?:www[\s.]*)?(?:\d+)?[a-z0-9][a-z0-9-]*(?:[\s.]+[a-z0-9][a-z0-9-]*)*\s*\.(?:com|org|net|in|io|to|tv|cc|me|co|center|xyz|site|info|link)[\s._-]*[-–—:]+[\s._-]*/i, "");
  clean = clean.replace(/^www\s+[a-z0-9][a-z0-9-]*(?:\s+[a-z0-9][a-z0-9-]*)*\s*\.(?:com|org|net|in|io|to|tv|cc|me|co|center|xyz|site|info|link)[\s._-]*[-–—:]+[\s._-]*/i, "");

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

  // Remove A.K.A and everything after
  clean = clean.replace(/\bA\.?K\.?A\.?\b.*/i, "");

  // Remove common scene tags, release-quality labels & languages
  clean = clean.replace(/\b(HC|HDCAM|CAMRip|CAM|HDTS|TS|TELESYNC|TC|TELECINE|DVDSCR|SCR|PREHD|1080p|720p|480p|2160p|4k|UHD|BluRay|Blu-Ray|BDRip|WEBRip|WEB-DL|DVDRip|HDTV|x264|x265|H\.?264|H\.?265|AAC|AC3|EAC3|DDP|DTS|HDR|HDR10|HDR10Plus|DV|Dolby|Atmos|HEVC|HQ|HDRip|TRUE|PROPER|REMASTERED|EXTENDED|UNCUT|DIRECTORS|CUT|DUAL|MULTI|HIN\d*x?|Hindi|Telugu|Tamil|TAM|TEL|Malayalam|Kannada|English|EngSub|ESub|AMZN|NF|DSNP|HMAX|IMAX|REPACK|Remux|10bit|6CH|8CH|PSA|YTS|YIFY|RARBG)\b.*/i, "");

  // Remove year in brackets/parentheses
  clean = clean.replace(/[\(\[\{]\s*(19|20)\d{2}\s*[\)\]\}]/g, "");

  // Remove other bracketed content
  clean = clean.replace(/[\(\[\{].*?[\)\]\}]/g, "");

  // Remove trailing standalone year
  clean = clean.replace(/\s+(19|20)\d{2}\s*$/g, "");

  // Remove trailing junk and hyphens
  clean = clean.replace(/[-–—]+\s*$/, "").trim();

  // Remove extra spaces
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

export function extractYear(name: string): number | undefined {
  const match = name.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0]) : undefined;
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
  return normalizeShowName(name).toLowerCase().replace(/[^a-z0-9]/g, '');
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
    const externalIds = await rateLimitedTmdbCall(() => moviedb.movieExternalIds({ id: tmdbId }));
    return fetchImdbRatingById(externalIds.imdb_id || null);
  } catch {
    return null;
  }
}

async function fetchShowImdbRating(moviedb: MovieDb, tmdbId?: number | null): Promise<number | null> {
  if (!tmdbId) return null;
  try {
    const externalIds = await rateLimitedTmdbCall(() => moviedb.tvExternalIds({ id: tmdbId }));
    return fetchImdbRatingById(externalIds.imdb_id || null);
  } catch {
    return null;
  }
}

async function fetchGenres(moviedb: MovieDb, genreIds: number[], type: 'movie' | 'tv'): Promise<string> {
  try {
    const genreList = await rateLimitedTmdbCall(() =>
      type === 'movie'
        ? moviedb.genreMovieList({})
        : moviedb.genreTvList({})
    );

    const genreMap = new Map(genreList.genres?.map(g => [g.id, g.name]) || []);
    return genreIds.map(id => genreMap.get(id)).filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

export async function fetchMovieMetadata(fileName: string): Promise<MediaMetadata> {
  const apiKey = getTmdbApiKey();
  const moviedb = new MovieDb(apiKey);

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
    genres: null
  };

  try {
    let res = await rateLimitedTmdbCall(() => moviedb.searchMovie({ query: rawName, year: year }));

    // Fallback 1: Year might actually be part of the title (e.g., Blade Runner 2049, 2001 A Space Odyssey)
    if ((!res.results || res.results.length === 0) && year) {
      res = await rateLimitedTmdbCall(() => moviedb.searchMovie({ query: `${rawName} ${year}`.trim() }));
    }

    // Fallback 2: The extracted year might be incorrect or missing from TMDB, try without it
    if ((!res.results || res.results.length === 0) && year) {
      res = await rateLimitedTmdbCall(() => moviedb.searchMovie({ query: rawName }));
    }

    if (res.results && res.results.length > 0) {
      const hit = res.results[0];
      const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'movie') : '';
      const imdbRating = await fetchMovieImdbRating(moviedb, hit.id || null);

      return {
        title: hit.title || rawName,
        year: hit.release_date ? parseInt(hit.release_date.substring(0, 4)) : year,
        tmdbId: hit.id || null,
        posterPath: hit.poster_path || null,
        backdropPath: hit.backdrop_path || null,
        overview: hit.overview || null,
        rating: hit.vote_average || null,
        imdbRating,
        genres
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
  const apiKey = getTmdbApiKey();
  const moviedb = new MovieDb(apiKey);
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
    firstAirDate: null
  };

  try {
    const candidates = Array.from(
      new Set([showName, normalizedInput, strippedYear].map(s => s.trim()).filter(Boolean))
    );

    const targetKey = normalizeShowNameForMatch(normalizedInput || showName);

    for (const query of candidates) {
      const res = await rateLimitedTmdbCall(() => moviedb.searchTv({ query }));
      if (!res.results || res.results.length === 0) continue;

      const scored = [...res.results].sort((a, b) => {
        const aKey = normalizeShowNameForMatch(a.name || '');
        const bKey = normalizeShowNameForMatch(b.name || '');

        const aNameScore = aKey === targetKey ? 2 : 0;
        const bNameScore = bKey === targetKey ? 2 : 0;

        const aYear = a.first_air_date ? parseInt(a.first_air_date.substring(0, 4), 10) : undefined;
        const bYear = b.first_air_date ? parseInt(b.first_air_date.substring(0, 4), 10) : undefined;

        const aYearScore = hintedYear && aYear === hintedYear ? 1 : 0;
        const bYearScore = hintedYear && bYear === hintedYear ? 1 : 0;

        const aScore = aNameScore + aYearScore;
        const bScore = bNameScore + bYearScore;

        if (bScore !== aScore) return bScore - aScore;
        return (b.popularity || 0) - (a.popularity || 0);
      });

      const hit = scored[0];
      const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'tv') : '';
      const imdbRating = await fetchShowImdbRating(moviedb, hit.id || null);

      return {
        title: hit.name || normalizedInput || showName,
        tmdbId: hit.id || null,
        posterPath: hit.poster_path || null,
        backdropPath: hit.backdrop_path || null,
        overview: hit.overview || null,
        rating: hit.vote_average || null,
        imdbRating,
        genres,
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
  };

  if (!tmdbShowId || tmdbShowId <= 0) return fallback;

  const cacheKey = `${tmdbShowId}-${seasonNumber}`;

  try {
    // Check cache first
    if (!seasonCache.has(cacheKey)) {
      const apiKey = getTmdbApiKey();
      const moviedb = new MovieDb(apiKey);

      const seasonData = await rateLimitedTmdbCall(() =>
        moviedb.seasonInfo({ id: tmdbShowId, season_number: seasonNumber })
      );

      if (seasonData.episodes) {
        const episodes: EpisodeMetadata[] = seasonData.episodes.map(ep => ({
          title: ep.name || `Episode ${ep.episode_number}`,
          overview: ep.overview || null,
          stillPath: ep.still_path || null,
          rating: ep.vote_average ?? null,
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
