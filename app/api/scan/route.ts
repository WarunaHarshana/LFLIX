import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { MovieDb } from 'moviedb-promise';

// Get TMDB API key from settings or env
function getTmdbApiKey(): string {
  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdbApiKey') as { value: string } | undefined;
    return setting?.value || process.env.TMDB_API_KEY || '3d8c8476371d0730fb5bd7ae67241879';
  } catch {
    return process.env.TMDB_API_KEY || '3d8c8476371d0730fb5bd7ae67241879';
  }
}

// Rate limiting helper - prevents TMDB API bans
let lastTmdbCall = 0;
const TMDB_DELAY_MS = 100; // Minimum 100ms between API calls

async function rateLimitedTmdbCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const timeSinceLastCall = now - lastTmdbCall;
  
  if (timeSinceLastCall < TMDB_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, TMDB_DELAY_MS - timeSinceLastCall));
  }
  
  lastTmdbCall = Date.now();
  
  try {
    return await fn();
  } catch (error: any) {
    // Handle TMDB rate limiting (429) or auth errors (401)
    if (error.status === 429) {
      console.warn('TMDB rate limit hit, waiting 2s...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      lastTmdbCall = Date.now();
      return await fn(); // Retry once
    }
    throw error;
  }
}

// Recursive folder scan
function getVideoFiles(dir: string, fileList: string[] = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        getVideoFiles(filePath, fileList);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'].includes(ext)) {
          fileList.push(filePath);
        }
      }
    } catch {
      // ignore access errors
    }
  }
  return fileList;
}

// Extended regex patterns for TV detection
const TV_PATTERNS = [
  /(.+?)[ ._\[\(]?(?:s(\d+)[ ._]?e(\d+))/i,  // S01E01
  /(.+?)[ ._\[\(]?(?:(\d+)x(\d+))/i,          // 1x01
  /(.+?)[ ._-]?(?:season[ ._]?(\d+)[ ._]?episode[ ._]?(\d+))/i,  // Season 1 Episode 1
  /(.+?)[ ._\[\(]?(?:ep?(\d+))/i,             // EP01 or E01 (season 1 assumed)
];

function detectTvShow(fileName: string): { name: string; season: number; episode: number } | null {
  for (const pattern of TV_PATTERNS) {
    const match = fileName.match(pattern);
    if (match) {
      const name = match[1].replace(/[._]/g, " ").trim();
      const season = parseInt(match[2]) || 1;
      const episode = parseInt(match[3]) || parseInt(match[2]) || 1;
      if (episode > 0) {
        return { name, season, episode };
      }
    }
  }
  return null;
}

// Clean filename to guess title
function cleanFilename(name: string) {
  let clean = name.replace(/\.[^/.]+$/, ""); // Remove ext

  // Remove Website Prefixes
  clean = clean.replace(/^www\.[a-zA-Z0-9-]+\.[a-z]{2,4}\s*[-_]\s*/i, "");
  clean = clean.replace(/^\[.*?\]\s*/i, ""); // Remove [group] tags

  // Remove A.K.A and everything after
  clean = clean.replace(/\bA\.?K\.?A\.?\b.*/i, "");

  // Remove common scene tags & languages (cut off everything after these)
  clean = clean.replace(/\b(1080p|720p|480p|2160p|4k|BluRay|Blu-Ray|BDRip|WEBRip|WEB-DL|DVDRip|HDTV|x264|x265|H\.?264|H\.?265|AAC|AC3|DTS|HDR|HDR10|HDR10Plus|DV|Dolby|Atmos|HEVC|HQ|HDRip|TRUE|PROPER|REMASTERED|EXTENDED|UNCUT|DIRECTORS|CUT|DUAL|MULTI|Telugu|Tamil|Hindi|Malayalam|Kannada|English|EngSub|ESub|AMZN|NF|DSNP|HMAX|IMAX|REPACK|Remux|10bit|6CH|8CH|PSA|YTS|YIFY|RARBG)\b.*/i, "");

  // Replace dots/underscores with space
  clean = clean.replace(/[._]/g, " ");

  // Remove year in brackets/parentheses
  clean = clean.replace(/[\(\[\{]\s*(19|20)\d{2}\s*[\)\]\}]/g, "");

  // Remove other bracketed content
  clean = clean.replace(/[\(\[\{].*?[\)\]\}]/g, "");

  // Remove trailing standalone year (like "Scarface 1983")
  clean = clean.replace(/\s+(19|20)\d{2}\s*$/g, "");

  // Remove trailing junk and hyphens
  clean = clean.replace(/[-–—]+\s*$/, "").trim();

  // Remove extra spaces
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

function extractYear(name: string) {
  const match = name.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0]) : undefined;
}

// Fetch genre names from TMDB genre IDs
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

export async function POST(req: Request) {
  const TMDB_API_KEY = getTmdbApiKey();
  const moviedb = new MovieDb(TMDB_API_KEY);

  try {
    const { folderPath } = await req.json();
    if (!folderPath) return NextResponse.json({ error: 'Missing folderPath' }, { status: 400 });

    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ error: 'Folder does not exist' }, { status: 404 });
    }

    // Save this folder to scanned_folders
    const folderName = path.basename(folderPath);
    db.prepare(`
      INSERT OR IGNORE INTO scanned_folders (folderPath, folderName, contentType)
      VALUES (?, ?, 'auto')
    `).run(folderPath, folderName);

    const files = getVideoFiles(folderPath);
    let addedCount = 0;
    const errors: string[] = [];

    // Prepared Statements
    const insertMovie = db.prepare(`
      INSERT OR IGNORE INTO movies (filePath, fileName, title, year, tmdbId, posterPath, backdropPath, overview, rating, genres)
      VALUES (@filePath, @fileName, @title, @year, @tmdbId, @posterPath, @backdropPath, @overview, @rating, @genres)
    `);

    const findShow = db.prepare('SELECT id FROM shows WHERE title = ? OR tmdbId = ?');
    const insertShow = db.prepare(`
      INSERT OR IGNORE INTO shows (title, tmdbId, posterPath, backdropPath, overview, rating, firstAirDate, genres)
      VALUES (@title, @tmdbId, @posterPath, @backdropPath, @overview, @rating, @firstAirDate, @genres)
    `);

    const insertEpisode = db.prepare(`
      INSERT OR IGNORE INTO episodes (showId, filePath, fileName, seasonNumber, episodeNumber, title, overview, stillPath)
      VALUES (@showId, @filePath, @fileName, @seasonNumber, @episodeNumber, @title, @overview, @stillPath)
    `);

    for (const filePath of files) {
      const fileName = path.basename(filePath);

      // Check if already indexed
      const movieExists = db.prepare('SELECT id FROM movies WHERE filePath = ?').get(filePath);
      const epExists = db.prepare('SELECT id FROM episodes WHERE filePath = ?').get(filePath);
      if (movieExists || epExists) continue;

      // Detect TV Show vs Movie
      const tvInfo = detectTvShow(fileName);

      if (tvInfo) {
        // --- TV SHOW ---
        let rawShowName = tvInfo.name.replace(/[\(\[].*?[\)\]]/g, "").replace(/-$/, "").trim();

        // First, search TMDB to get the real show info
        let showMeta: any = { title: rawShowName, tmdbId: null, posterPath: null, backdropPath: null, overview: null, rating: null, firstAirDate: null, genres: null };
        try {
          const res = await rateLimitedTmdbCall(() => moviedb.searchTv({ query: rawShowName }));
          if (res.results && res.results.length > 0) {
            const hit = res.results[0];
            const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'tv') : '';
            showMeta = {
              title: hit.name || rawShowName,
              tmdbId: hit.id,
              posterPath: hit.poster_path,
              backdropPath: hit.backdrop_path,
              overview: hit.overview,
              rating: hit.vote_average,
              firstAirDate: hit.first_air_date,
              genres
            };
          }
        } catch (e: any) {
          // Graceful fallback - use filename as title, don't fail the whole scan
          errors.push(`TMDB TV Error for ${rawShowName}: ${e.message || 'Unknown error'}`);
          console.warn(`TMDB lookup failed for "${rawShowName}", using filename as fallback`);
        }

        // Check if show already exists by title OR tmdbId
        let showId: number | bigint = 0;
        const existingShow = findShow.get(showMeta.title, showMeta.tmdbId) as { id: number } | undefined;

        if (existingShow) {
          showId = existingShow.id;
        } else {
          // Try to insert new show, handle duplicate gracefully
          try {
            const info = insertShow.run(showMeta);
            showId = info.lastInsertRowid;
          } catch (insertError: any) {
            // If it's a unique constraint error, try to find the existing show
            if (insertError.code === 'SQLITE_CONSTRAINT_UNIQUE' || insertError.code === 'SQLITE_CONSTRAINT') {
              const found = db.prepare('SELECT id FROM shows WHERE title = ?').get(showMeta.title) as { id: number } | undefined;
              if (found) {
                showId = found.id;
              } else {
                errors.push(`Failed to insert/find show: ${showMeta.title}`);
                continue;
              }
            } else {
              throw insertError;
            }
          }
        }

        insertEpisode.run({
          showId,
          filePath,
          fileName,
          seasonNumber: tvInfo.season,
          episodeNumber: tvInfo.episode,
          title: `S${tvInfo.season} E${tvInfo.episode}`,
          overview: null,
          stillPath: null
        });

      } else {
        // --- MOVIE ---
        const rawName = cleanFilename(fileName);
        const year = extractYear(fileName);

        let metadata: any = {
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
          const searchRes = await rateLimitedTmdbCall(() => moviedb.searchMovie({ query: rawName, year: year }));
          if (searchRes.results && searchRes.results.length > 0) {
            const hit = searchRes.results[0];
            const genres = hit.genre_ids ? await fetchGenres(moviedb, hit.genre_ids, 'movie') : '';
            metadata = {
              title: hit.title || rawName,
              year: hit.release_date ? parseInt(hit.release_date.substring(0, 4)) : year,
              tmdbId: hit.id,
              posterPath: hit.poster_path,
              backdropPath: hit.backdrop_path,
              overview: hit.overview,
              rating: hit.vote_average,
              genres
            };
          }
        } catch (err: any) {
          // Graceful fallback - use filename as title, don't fail the whole scan
          errors.push(`TMDB Movie Error for ${rawName}: ${err.message || 'Unknown error'}`);
          console.warn(`TMDB lookup failed for "${rawName}", using filename as fallback`);
        }

        insertMovie.run({
          filePath,
          fileName,
          ...metadata
        });
      }

      // Check if item was actually added by querying for it
      const wasAdded = tvInfo
        ? db.prepare('SELECT id FROM episodes WHERE filePath = ?').get(filePath)
        : db.prepare('SELECT id FROM movies WHERE filePath = ?').get(filePath);
      if (wasAdded) {
        addedCount++;
      }
    }

    return NextResponse.json({ success: true, added: addedCount, totalFiles: files.length, errors });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
