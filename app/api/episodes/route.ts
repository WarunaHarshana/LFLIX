import { NextResponse } from 'next/server';
import db from '@/lib/db';

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

type SeasonGroup = {
  season: number;
  episodes: (Episode & { watchProgress?: WatchProgress })[];
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const showId = searchParams.get('showId');

  try {
    if (!showId) return NextResponse.json({ error: 'Missing showId' }, { status: 400 });

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
    const seasonMap = new Map<number, SeasonGroup>();

    for (const ep of episodes) {
      const seasonNum = ep.seasonNumber || 1;
      if (!seasonMap.has(seasonNum)) {
        seasonMap.set(seasonNum, { season: seasonNum, episodes: [] });
      }
      seasonMap.get(seasonNum)!.episodes.push({
        ...ep,
        watchProgress: progressMap.get(ep.id)
      });
    }

    const seasons = Array.from(seasonMap.values()).sort((a, b) => a.season - b.season);

    return NextResponse.json({ seasons, totalEpisodes: episodes.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
