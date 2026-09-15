import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db, { removeAutoTrackingForShow } from '@/lib/db';
import { apiErrorResponse } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

type Episode = {
  id: number;
  showId: number;
  filePath: string;
  fileName: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview: string | null;
  stillPath: string | null;
  rating: number | null;
  voteCount: number | null;
  imdbRating: number | null;
  isHDR: number;
  resolution: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioChannels: string | null;
};

type WatchProgress = {
  episodeId: number;
  progress: number;
  duration: number;
  completed: number;
};

type EpisodeResponse = {
  id: number;
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview: string | null;
  stillPath: string | null;
  rating: number | null;
  voteCount: number | null;
  imdbRating: number | null;
  isHDR: boolean;
  resolution: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioChannels: string | null;
  watchProgress?: WatchProgress;
};

type SeasonGroup = {
  season: number;
  episodes: EpisodeResponse[];
};

// Validate ID is a positive integer
function validateId(id: any): id is number {
  return Number.isInteger(id) && id > 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const showIdParam = searchParams.get('showId');

  try {
    if (!showIdParam) return NextResponse.json({ error: 'Missing showId' }, { status: 400 });

    const showId = parseInt(showIdParam, 10);
    if (!validateId(showId)) {
      return NextResponse.json({ error: 'Invalid showId. Must be a positive integer' }, { status: 400 });
    }

    const allEpisodes = db.prepare(`
      SELECT * FROM episodes 
      WHERE showId = ? 
      ORDER BY seasonNumber ASC, episodeNumber ASC
    `).all(showId) as Episode[];

    const episodes: Episode[] = [];
    const missingEpisodeIds: number[] = [];

    for (const ep of allEpisodes) {
      if (ep.filePath) {
        try {
          const parentDir = path.dirname(ep.filePath);
          // Only prune if parent directory exists (verifying drive/folder is mounted) but the file is gone
          if (fs.existsSync(parentDir)) {
            if (!fs.existsSync(ep.filePath)) {
              missingEpisodeIds.push(ep.id);
              continue;
            }
          }
        } catch {
          // If filesystem access error, keep episode to be safe
        }
      }
      episodes.push(ep);
    }

    // Clean up missing episodes from database automatically
    if (missingEpisodeIds.length > 0) {
      try {
        const placeholders = missingEpisodeIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM episodes WHERE id IN (${placeholders})`).run(...missingEpisodeIds);
        db.prepare(`DELETE FROM watch_history WHERE episodeId IN (${placeholders})`).run(...missingEpisodeIds);

        // Check if show still has remaining episodes
        const remaining = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE showId = ?').get(showId) as { count: number };
        if (remaining.count === 0) {
          removeAutoTrackingForShow(showId);
          db.prepare('DELETE FROM shows WHERE id = ?').run(showId);
        }
      } catch (err) {
        console.warn('[Episodes API] Failed to clean up missing episodes:', err);
      }
    }

    // Get watch progress for all episodes of this show
    const watchProgress = db.prepare(`
      SELECT episodeId, progress, duration, completed
      FROM watch_history 
      WHERE contentType = 'show' AND contentId = ?
    `).all(showId) as WatchProgress[];

    const progressMap = new Map(watchProgress.map(wp => [wp.episodeId, wp]));

    // Group episodes by season
    // SECURITY: Don't expose filePath to client
    const seasonMap = new Map<number, SeasonGroup>();

    for (const ep of episodes) {
      const seasonNum = ep.seasonNumber || 1;
      if (!seasonMap.has(seasonNum)) {
        seasonMap.set(seasonNum, { season: seasonNum, episodes: [] });
      }
      seasonMap.get(seasonNum)!.episodes.push({
        id: ep.id,
        showId: ep.showId,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        overview: ep.overview,
        stillPath: ep.stillPath,
        rating: ep.rating,
        voteCount: ep.voteCount,
        imdbRating: ep.imdbRating,
        isHDR: !!ep.isHDR,
        resolution: ep.resolution,
        videoCodec: ep.videoCodec,
        audioCodec: ep.audioCodec,
        audioChannels: ep.audioChannels,
        watchProgress: progressMap.get(ep.id)
      });
    }

    const seasons = Array.from(seasonMap.values()).sort((a, b) => a.season - b.season);

    return NextResponse.json({ seasons, totalEpisodes: episodes.length });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
