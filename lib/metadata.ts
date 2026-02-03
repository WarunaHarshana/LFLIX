import { MovieDb } from 'moviedb-promise';
import db from './db';

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

// --- Filename Cleaning ---

export function cleanFilename(name: string): string {
  let clean = name.replace(/\.[^/.]+$/, ""); // Remove ext

  // Remove Website Prefixes
  clean = clean.replace(/^www\.[a-zA-Z0-9-]+\.[a-z]{2,4}\s*[-_]\s*/i, "");
  clean = clean.replace(/^\[.*?\]\s*/i, ""); // Remove [group] tags

  // Remove A.K.A and everything after
  clean = clean.replace(/\bA\.?K\.?A\.?\b.*/i, "");

  // Remove common scene tags & languages
  clean = clean.replace(/\b(1080p|720p|480p|2160p|4k|BluRay|Blu-Ray|BDRip|WEBRip|WEB-DL|DVDRip|HDTV|x264|x265|H\.?264|H\.?265|AAC|AC3|DTS|HDR|HDR10|HDR10Plus|DV|Dolby|Atmos|HEVC|HQ|HDRip|TRUE|PROPER|REMASTERED|EXTENDED|UNCUT|DIRECTORS|CUT|DUAL|MULTI|Telugu|Tamil|Hindi|Malayalam|Kannada|English|EngSub|ESub|AMZN|NF|DSNP|HMAX|IMAX|REPACK|Remux|10bit|6CH|8CH|PSA|YTS|YIFY|RARBG)\b.*/i, "");

  // Replace dots/underscores with space
  clean = clean.replace(/[._]/g, " ");

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

// --- Metadata Fetching ---

export interface MediaMetadata {
  title: string;
  tmdbId: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  genres: string | null;
  year?: number | null; // For movies
  firstAirDate?: string | null; // For shows
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
    genres: null
  };

  try {
    const res = await rateLimitedTmdbCall(() => moviedb.searchMovie({ query: rawName, year: year }));
    
    if (res.results && res.results.length > 0) {
        const hit = res.results[0];
        const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'movie') : '';
        
        return {
            title: hit.title || rawName,
            year: hit.release_date ? parseInt(hit.release_date.substring(0, 4)) : year,
            tmdbId: hit.id || null,
            posterPath: hit.poster_path || null,
            backdropPath: hit.backdrop_path || null,
            overview: hit.overview || null,
            rating: hit.vote_average || null,
            genres
        };
    }
  } catch (e) {
    console.warn(`TMDB fetch failed for movie: ${rawName}`, e);
  }

  return baseData;
}

export async function fetchShowMetadata(showName: string): Promise<MediaMetadata> {
    const apiKey = getTmdbApiKey();
    const moviedb = new MovieDb(apiKey);

    const baseData: MediaMetadata = {
        title: showName,
        tmdbId: null,
        posterPath: null,
        backdropPath: null,
        overview: null,
        rating: null,
        genres: null,
        firstAirDate: null
    };

    try {
        const res = await rateLimitedTmdbCall(() => moviedb.searchTv({ query: showName }));
        
        if (res.results && res.results.length > 0) {
            const hit = res.results[0];
            const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'tv') : '';
            
            return {
                title: hit.name || showName,
                tmdbId: hit.id || null,
                posterPath: hit.poster_path || null,
                backdropPath: hit.backdrop_path || null,
                overview: hit.overview || null,
                rating: hit.vote_average || null,
                genres,
                firstAirDate: hit.first_air_date || null
            };
        }
    } catch (e) {
        console.warn(`TMDB fetch failed for show: ${showName}`, e);
    }

    return baseData;
}
