import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cachedTmdbCall, getTmdbClient } from '@/lib/metadata';
import autoDownloader from '@/lib/autoDownloader';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const showIdStr = searchParams.get('showId');
    const autoDownload = searchParams.get('autoDownload') === 'true';

    if (!showIdStr) return NextResponse.json({ error: 'showId is required' }, { status: 400 });

    try {
        const showId = parseInt(showIdStr, 10);
        // Get show info
        const show = db.prepare('SELECT id, title, tmdbId, posterPath FROM shows WHERE id = ?').get(showId) as { id: number, title: string, tmdbId: number, posterPath: string | null } | undefined;

        if (!show) {
            return NextResponse.json({ error: 'Show not found' }, { status: 404 });
        }

        // Get max episode
        const maxEp = db.prepare('SELECT seasonNumber, episodeNumber FROM episodes WHERE showId = ? ORDER BY seasonNumber DESC, episodeNumber DESC LIMIT 1').get(showId) as { seasonNumber: number, episodeNumber: number } | undefined;

        if (!maxEp) {
             return NextResponse.json({ error: 'No episodes found in library for this show' }, { status: 404 });
        }

        const { seasonNumber, episodeNumber } = maxEp;
        let nextSeason = seasonNumber;
        let nextEpisode = episodeNumber + 1;

        if (!show.tmdbId) {
             return NextResponse.json({ error: 'Cannot download next episode without TMDB ID' }, { status: 400 });
        }

        const moviedb = getTmdbClient();

        // Check if next episode exists in current season
        let seasonData;
        try {
            seasonData = await cachedTmdbCall(`tmdb-season-${show.tmdbId}-${nextSeason}`, () =>
                moviedb.seasonInfo({ id: show.tmdbId, season_number: nextSeason }),
                24 * 60
            );
        } catch(e) {
            console.error('Error fetching season data:', e);
        }

        let found = false;
        let episodeMeta = null;
        if (seasonData?.episodes) {
            const ep = seasonData.episodes.find(e => e.episode_number === nextEpisode);
            if (ep) {
                found = true;
                episodeMeta = ep;
            }
        } 
        
        if (!found) {
            // Check next season, episode 1
            try {
                const lookupSeason = nextSeason + 1;
                const nextSeasonData = await cachedTmdbCall(`tmdb-season-${show.tmdbId}-${lookupSeason}`, () =>
                    moviedb.seasonInfo({ id: show.tmdbId, season_number: lookupSeason }),
                    24 * 60
                );
                if (nextSeasonData?.episodes && nextSeasonData.episodes.length > 0) {
                    nextSeason += 1;
                    nextEpisode = 1;
                    found = true;
                    episodeMeta = nextSeasonData.episodes[0];
                }
            } catch(e) {
                 console.error('Error fetching next season data:', e);
            }
        }

        if (!found) {
            return NextResponse.json({ error: 'No next episode found on TMDB' }, { status: 404 });
        }

        if (autoDownload && episodeMeta) {
            const trackStmt = db.prepare('SELECT qualityPreference FROM auto_track WHERE showId = ?');
            const trackResult = trackStmt.get(showId) as { qualityPreference: string } | undefined;
            const qualityPref = trackResult?.qualityPreference || 'best';

            const newRelease = {
                showId: show.id,
                tmdbId: show.tmdbId,
                seasonNumber: nextSeason,
                episodeNumber: nextEpisode,
                showTitle: show.title,
                episodeTitle: episodeMeta.name || `Episode ${nextEpisode}`,
                airDate: episodeMeta.air_date || new Date().toISOString().split('T')[0],
                posterPath: show.posterPath,
                qualityPreference: qualityPref
            };

            autoDownloader.processNewEpisodes([newRelease]).catch(e => console.error(e));
            return NextResponse.json({ message: 'Next episode download queued', queued: true });
        }

        return NextResponse.json({
            nextEpisode: {
                season: nextSeason,
                episode: nextEpisode,
                query: `${show.title} S${String(nextSeason).padStart(2, '0')}E${String(nextEpisode).padStart(2, '0')}`
            }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
