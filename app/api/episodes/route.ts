import { NextResponse } from 'next/server';
import db from '@/lib/db';

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

    const episodes = db.prepare(`
      SELECT * FROM episodes 
      WHERE showId = ? 
      ORDER BY seasonNumber ASC, episodeNumber ASC
    `).all(showId) as Episode[];
    
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
        watchProgress: progressMap.get(ep.id)
      });
    }

    const seasons = Array.from(seasonMap.values()).sort((a, b) => a.season - b.season);

    return NextResponse.json({ seasons, totalEpisodes: episodes.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
