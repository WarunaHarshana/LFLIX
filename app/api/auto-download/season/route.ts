import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { MovieDb } from 'moviedb-promise';
import autoDownloader from '@/lib/autoDownloader';
import { NewEpisodeInfo } from '@/lib/releaseMonitor';

const moviedb = new MovieDb(process.env.TMDB_API_KEY!);

export async function POST(req: Request) {
    try {
        const { tmdbId, showId, seasonNumber } = await req.json();
        if (!tmdbId || !showId || !seasonNumber) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // Get quality preference from auto_track, default to 'best'
        const trackStmt = db.prepare('SELECT qualityPreference FROM auto_track WHERE showId = ?');
        const trackResult = trackStmt.get(showId) as { qualityPreference: string } | undefined;
        const qualityPref = trackResult?.qualityPreference || 'best';

        // Get show info for notifications
        const showStmt = db.prepare(`
            SELECT title, posterPath
            FROM shows
            WHERE id = ?
              AND EXISTS (SELECT 1 FROM episodes e WHERE e.showId = shows.id)
        `);
        const showData = showStmt.get(showId) as { title: string, posterPath: string } | undefined;
        if (!showData) {
            return NextResponse.json({ error: 'Show not found in library' }, { status: 404 });
        }

        // Get local episodes for that season
        const localEpsStmt = db.prepare('SELECT episodeNumber FROM episodes WHERE showId = ? AND seasonNumber = ?');
        const localEps = localEpsStmt.all(showId, seasonNumber) as { episodeNumber: number }[];
        const localEpsSet = new Set(localEps.map(e => e.episodeNumber));

        // Get TMDB episode metadata
        const seasonInfo = await moviedb.seasonInfo({ id: tmdbId, season_number: seasonNumber });
        const tmdbEpisodes = seasonInfo.episodes || [];

        // Find missing that have already aired
        const newReleases: NewEpisodeInfo[] = [];
        const rightNowISO = new Date().toISOString().split('T')[0]; // simple YYYY-MM-DD
        
        for (const ep of tmdbEpisodes) {
            const epNum = ep.episode_number || 0;
            if (epNum > 0 && !localEpsSet.has(epNum)) {
                // Must have aired
                if (ep.air_date && ep.air_date <= rightNowISO) {
                    newReleases.push({
                        showId: showId,
                        tmdbId: tmdbId,
                        seasonNumber: seasonNumber,
                        episodeNumber: epNum,
                        showTitle: showData?.title || `Show ${showId}`,
                        episodeTitle: ep.name || `Episode ${epNum}`,
                        airDate: ep.air_date,
                        posterPath: showData?.posterPath || null,
                        qualityPreference: qualityPref
                    });
                }
            }
        }

        if (newReleases.length === 0) {
            return NextResponse.json({ message: 'No missing aired episodes found for this season.', queued: 0 });
        }

        // Fire & forget background processing (it inserts to DB and searches)
        autoDownloader.processNewEpisodes(newReleases).catch((e: any) => 
            console.error('[Auto-Download Season] Processing hook failed:', e)
        );

        return NextResponse.json({ 
            message: `Queued ${newReleases.length} missing episodes for search.`, 
            queued: newReleases.length 
        });

    } catch (error: any) {
        console.error('[API /auto-download/season]', error?.message || error);
        return NextResponse.json({ error: 'Failed to process season missing checks.' }, { status: 500 });
    }
}
