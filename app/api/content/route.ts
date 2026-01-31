import { NextResponse } from 'next/server';
import db from '@/lib/db';

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
  genres: string | null;
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
  genres: string | null;
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
    const movies = db.prepare('SELECT * FROM movies ORDER BY addedAt DESC').all() as Movie[];
    const shows = db.prepare('SELECT * FROM shows ORDER BY addedAt DESC').all() as Show[];

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
      ...movies.map((m) => ({
        id: m.id,
        title: m.title,
        year: m.year,
        tmdbId: m.tmdbId,
        posterPath: m.posterPath,
        backdropPath: m.backdropPath,
        overview: m.overview,
        rating: m.rating,
        genres: m.genres,
        addedAt: m.addedAt,
        type: 'movie' as const,
        watchProgress: movieProgressMap.get(m.id)
      })),
      ...shows.map((s) => ({
        id: s.id,
        title: s.title,
        tmdbId: s.tmdbId,
        posterPath: s.posterPath,
        backdropPath: s.backdropPath,
        overview: s.overview,
        rating: s.rating,
        genres: s.genres,
        firstAirDate: s.firstAirDate,
        addedAt: s.addedAt,
        type: 'show' as const,
        watchProgress: showProgressMap.get(s.id)
      }))
    ].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

    // Extract unique genres
    const genreSet = new Set<string>();
    for (const item of content) {
      if (item.genres) {
        item.genres.split(',').forEach(g => genreSet.add(g.trim()));
      }
    }

    return NextResponse.json({
      content,
      genres: Array.from(genreSet).sort()
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
