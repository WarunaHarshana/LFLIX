import fs from 'fs';
import path from 'path';
import db from './db';
import { fetchMovieMetadata, fetchShowMetadata } from './metadata';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'];

// TV show detection patterns
const TV_PATTERNS = [
  /(.+?)[ .\[\(]?(?:s(\d+)[ .]?e(\d+))/i,
  /(.+?)[ .\[\(]?(?:(\d+)x(\d+))/i,
  /(.+?)[ ._-]?(?:season[ ._]?(\d+)[ ._]?episode[ ._]?(\d+))/i,
  /(.+?)[ .\[\(]?(?:ep?(\d+))/i,
];

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

function detectTvShow(fileName: string): { name: string; season: number; episode: number } | null {
  for (const pattern of TV_PATTERNS) {
    const match = fileName.match(pattern);
    if (match) {
      const name = match[1].replace(/[._]/g, ' ').trim();
      const season = parseInt(match[2]) || 1;
      const episode = parseInt(match[3]) || parseInt(match[2]) || 1;
      if (episode > 0) {
        return { name, season, episode };
      }
    }
  }
  return null;
}

export async function scanFile(filePath: string): Promise<{ added: boolean; error?: string }> {
  try {
    if (!isVideoFile(filePath)) {
      return { added: false };
    }

    if (!fs.existsSync(filePath)) {
      return { added: false, error: 'File not found' };
    }

    const fileName = path.basename(filePath);

    // Check if already indexed
    const movieExists = db.prepare('SELECT id FROM movies WHERE filePath = ?').get(filePath);
    const epExists = db.prepare('SELECT id FROM episodes WHERE filePath = ?').get(filePath);
    if (movieExists || epExists) {
      return { added: false };
    }

    const tvInfo = detectTvShow(fileName);

    if (tvInfo) {
      // Handle TV show
      const rawShowName = tvInfo.name.replace(/[\(\[].*?[\)\]]/g, '').replace(/-$/, '').trim();

      // Fetch metadata from TMDB
      const showMeta = await fetchShowMetadata(rawShowName);

      // Find or create show - using strict TMDB ID check first
      let showId: number | bigint = 0;
      let existingShow = null;

      if (showMeta.tmdbId) {
        existingShow = db.prepare('SELECT id FROM shows WHERE tmdbId = ?').get(showMeta.tmdbId) as { id: number } | undefined;
      }

      if (!existingShow) {
        // Fallback to title check
        existingShow = db.prepare('SELECT id FROM shows WHERE title = ?').get(showMeta.title) as { id: number } | undefined;
      }

      if (existingShow) {
        showId = existingShow.id;
      } else {
        const result = db.prepare(`
            INSERT INTO shows (title, tmdbId, posterPath, backdropPath, overview, rating, firstAirDate, genres) 
            VALUES (@title, @tmdbId, @posterPath, @backdropPath, @overview, @rating, @firstAirDate, @genres)
        `).run(showMeta);
        showId = result.lastInsertRowid;
      }

      // Insert episode
      db.prepare('INSERT OR IGNORE INTO episodes (showId, filePath, fileName, seasonNumber, episodeNumber, title, overview, stillPath) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)')
        .run(showId, filePath, fileName, tvInfo.season, tvInfo.episode, `S${tvInfo.season} E${tvInfo.episode}`);

      return { added: true };
    } else {
      // Handle movie
      // Fetch metadata from TMDB
      const movieMeta = await fetchMovieMetadata(fileName);

      db.prepare(`
        INSERT OR IGNORE INTO movies (filePath, fileName, title, year, tmdbId, posterPath, backdropPath, overview, rating, genres) 
        VALUES (@filePath, @fileName, @title, @year, @tmdbId, @posterPath, @backdropPath, @overview, @rating, @genres)
      `).run({
        filePath,
        fileName,
        ...movieMeta
      });

      return { added: true };
    }
  } catch (e: any) {
    console.error('Scan file error:', e);
    return { added: false, error: e.message };
  }
}

export async function scanFolder(folderPath: string): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          scanDir(filePath);
        } else if (isVideoFile(filePath)) {
          const result = db.prepare('SELECT id FROM movies WHERE filePath = ?').get(filePath) ||
            db.prepare('SELECT id FROM episodes WHERE filePath = ?').get(filePath);
          if (!result) {
            // Will be added by watcher or manual scan
            added++;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  scanDir(folderPath);
  return { added, errors };
}
