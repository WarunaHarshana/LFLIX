import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { apiErrorResponse } from '@/lib/apiSecurity';
import { resolveLanguageName, syncAllLibraryLanguages } from '@/lib/metadata';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

type Movie = {
  id: number;
  filePath: string;
  fileName: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  imdbRating: number | null;
  genres: string | null;
  language: string | null;
  isHDR: number;
  resolution: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioChannels: string | null;
  addedAt: string;
};

type Show = {
  id: number;
  title: string;
  tmdbId: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  imdbRating: number | null;
  genres: string | null;
  language: string | null;
  firstAirDate: string | null;
  addedAt: string;
};

type WatchProgress = {
  contentId: number;
  contentType: string;
  progress: number;
  duration: number;
  completed: number;
};

export async function GET() {
  try {
    // Non-blocking background sync of TMDB original_language for library items
    syncAllLibraryLanguages().catch(() => {});

    // Select only the columns the response actually maps. `SELECT *` pulled
    // filePath, fileName, bitrate, duration and fileSize for every row on every
    // page load — filePath in particular is deliberately never sent to the
    // client, so reading it at all was wasted work.
    const movies = db.prepare(`
      SELECT id, title, fileName, year, tmdbId, posterPath, backdropPath, overview,
             rating, imdbRating, genres, language, isHDR, resolution, videoCodec,
             audioCodec, audioChannels, addedAt
      FROM movies
      ORDER BY addedAt DESC
    `).all() as Movie[];

    const shows = db.prepare(`
      SELECT id, title, tmdbId, posterPath, backdropPath, overview,
             rating, imdbRating, genres, language, firstAirDate, addedAt
      FROM shows
      ORDER BY addedAt DESC
    `).all() as Show[];

    // Get watch progress for all content
    const movieProgress = db.prepare(`
      SELECT contentId, progress, duration, completed 
      FROM watch_history 
      WHERE contentType = 'movie'
    `).all() as WatchProgress[];

    const showProgress = db.prepare(`
      SELECT contentId, MAX(progress) as progress, MAX(duration) as duration, MIN(completed) as completed
      FROM watch_history 
      WHERE contentType = 'show'
      GROUP BY contentId
    `).all() as WatchProgress[];

    const movieProgressMap = new Map(movieProgress.map(p => [p.contentId, p]));
    const showProgressMap = new Map(showProgress.map(p => [p.contentId, p]));

    // Combine them into a single feed, adding type and progress
    // SECURITY: Don't expose filePath to client - use contentId only
    const content = [
      ...movies.map((m) => {
        const rawLang = m.language;
        const detectedLang = resolveLanguageName(null, m.fileName || m.title, null);
        const language = (rawLang && rawLang !== 'English') ? rawLang : (detectedLang || rawLang || 'English');

        return {
          id: m.id,
          title: m.title,
          year: m.year,
          tmdbId: m.tmdbId,
          posterPath: m.posterPath,
          backdropPath: m.backdropPath,
          overview: m.overview,
          rating: m.rating,
          imdbRating: m.imdbRating,
          genres: m.genres,
          language,
          isHDR: !!m.isHDR,
          resolution: m.resolution,
          videoCodec: m.videoCodec,
          audioCodec: m.audioCodec,
          audioChannels: m.audioChannels,
          addedAt: m.addedAt,
          type: 'movie' as const,
          watchProgress: movieProgressMap.get(m.id)
        };
      }),
      ...shows.map((s) => {
        const rawLang = s.language;
        const detectedLang = resolveLanguageName(null, s.title, null);
        const language = (rawLang && rawLang !== 'English') ? rawLang : (detectedLang || rawLang || 'English');

        return {
          id: s.id,
          title: s.title,
          year: s.firstAirDate ? parseInt(s.firstAirDate.substring(0, 4), 10) || null : null,
          tmdbId: s.tmdbId,
          posterPath: s.posterPath,
          backdropPath: s.backdropPath,
          overview: s.overview,
          rating: s.rating,
          imdbRating: s.imdbRating,
          genres: s.genres,
          language,
          firstAirDate: s.firstAirDate,
          addedAt: s.addedAt,
          type: 'show' as const,
          watchProgress: showProgressMap.get(s.id)
        };
      })
    ].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

    // Extract unique genres
    const genreSet = new Set<string>();
    for (const item of content) {
      if (item.genres) {
        item.genres.split(',').forEach(g => {
          const trimmed = g.trim();
          if (trimmed) genreSet.add(trimmed);
        });
      }
    }

    // Extract unique languages
    const languageSet = new Set<string>();
    for (const item of content) {
      if (item.language) {
        const trimmed = item.language.trim();
        if (trimmed) languageSet.add(trimmed);
      }
    }

    return NextResponse.json({
      content,
      genres: Array.from(genreSet).sort(),
      languages: Array.from(languageSet).sort()
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
