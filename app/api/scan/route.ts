import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { fetchMovieMetadata, fetchShowMetadata, getTmdbApiKey, rateLimitedTmdbCall } from '@/lib/metadata';
import { MovieDb } from 'moviedb-promise';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

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

// TV show detection patterns
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

// SECURITY: Validate folder path to prevent directory traversal
function validateFolderPath(folderPath: string): { valid: boolean; error?: string } {
  // Check for null bytes (path injection)
  if (folderPath.includes('\0')) {
    return { valid: false, error: 'Invalid path' };
  }

  // Normalize the path
  const normalizedPath = path.normalize(folderPath);

  // Check for path traversal attempts (..)
  if (normalizedPath.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  // Must be an absolute path
  if (!path.isAbsolute(normalizedPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  return { valid: true };
}

export async function POST(req: Request) {
  try {
    const { folderPath, specificFile } = await req.json();
    if (!folderPath) return NextResponse.json({ error: 'Missing folderPath' }, { status: 400 });

    // Validate folder path
    const validation = validateFolderPath(folderPath);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ error: 'Folder does not exist' }, { status: 404 });
    }

    // Validate specificFile if provided
    if (specificFile) {
      const fileValidation = validateFolderPath(specificFile);
      if (!fileValidation.valid) {
        return NextResponse.json({ error: 'Invalid specificFile path' }, { status: 400 });
      }
    }

    // Save this folder to scanned_folders
    const folderName = path.basename(folderPath);
    db.prepare(`
      INSERT OR IGNORE INTO scanned_folders (folderPath, folderName, contentType)
      VALUES (?, ?, 'auto')
    `).run(folderPath, folderName);

    let files: string[];

    // If specificFile is provided, only scan that file
    if (specificFile && fs.existsSync(specificFile)) {
      files = [specificFile];
    } else {
      files = getVideoFiles(folderPath);
    }

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

        // Use shared library to fetch metadata
        const showMeta = await fetchShowMetadata(rawShowName);

        // Check if show already exists by title OR tmdbId
        let showId: number | bigint = 0;

        // Prioritize TMDB ID check
        let existingShow = null;
        if (showMeta.tmdbId) {
          existingShow = db.prepare('SELECT id FROM shows WHERE tmdbId = ?').get(showMeta.tmdbId) as { id: number } | undefined;
        }

        // Fallback to title check
        if (!existingShow) {
          existingShow = db.prepare('SELECT id FROM shows WHERE title = ?').get(showMeta.title) as { id: number } | undefined;
        }

        if (existingShow) {
          showId = existingShow.id;
        } else {
          try {
            const info = insertShow.run(showMeta);
            showId = info.lastInsertRowid;
          } catch (insertError: any) {
            // Unique constraint error fallback
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
        const movieMeta = await fetchMovieMetadata(fileName);

        insertMovie.run({
          filePath,
          fileName,
          ...movieMeta
        });
      }

      // Check if item was actually added
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
