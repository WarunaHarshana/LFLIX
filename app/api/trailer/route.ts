import { NextResponse } from 'next/server';
import { cachedTmdbCall, getTmdbApiKey, getTmdbClient } from '@/lib/metadata';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

type TmdbVideo = {
    key?: string;
    name?: string;
    site?: string;
    type?: string;
    official?: boolean;
};

type TmdbVideosResponse = {
    results?: TmdbVideo[];
};

async function fetchEpisodeVideos(tmdbId: number, season: number, episode: number): Promise<TmdbVideosResponse> {
    const apiKey = getTmdbApiKey();
    const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}/videos`);
    url.searchParams.set('api_key', apiKey);

    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`TMDB episode videos returned HTTP ${response.status}`);
    }

    return response.json() as Promise<TmdbVideosResponse>;
}

function pickBestTrailer(videos: TmdbVideo[]): TmdbVideo | null {
    const youtubeVideos = videos.filter((video) => video.site === 'YouTube' && video.key);

    return (
        youtubeVideos.find((video) => video.type === 'Trailer' && video.official === true) ||
        youtubeVideos.find((video) => video.type === 'Trailer') ||
        youtubeVideos.find((video) => video.type === 'Teaser') ||
        youtubeVideos.find((video) => video.type === 'Clip') ||
        youtubeVideos.find((video) => video.type === 'Featurette') ||
        youtubeVideos[0] ||
        null
    );
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const tmdbId = searchParams.get('tmdbId');
        const mediaType = searchParams.get('mediaType'); // movie or tv
        const seasonParam = searchParams.get('season');
        const episodeParam = searchParams.get('episode');

        if (!tmdbId || !mediaType) {
            return NextResponse.json({ error: 'Missing tmdbId or mediaType' }, { status: 400 });
        }

        if (mediaType !== 'movie' && mediaType !== 'tv') {
            return NextResponse.json({ error: 'Invalid mediaType' }, { status: 400 });
        }

        const moviedb = getTmdbClient();
        const id = parseInt(tmdbId);
        if (Number.isNaN(id) || id <= 0) {
            return NextResponse.json({ error: 'Invalid tmdbId' }, { status: 400 });
        }

        const season = seasonParam != null ? parseInt(seasonParam, 10) : undefined;
        const episode = episodeParam != null ? parseInt(episodeParam, 10) : undefined;

        if ((seasonParam != null || episodeParam != null) && mediaType !== 'tv') {
            return NextResponse.json({ error: 'Episode trailers are only available for TV shows' }, { status: 400 });
        }

        if (mediaType === 'tv' && (seasonParam != null || episodeParam != null)) {
            if (!Number.isInteger(season) || season! < 0 || !Number.isInteger(episode) || episode! <= 0) {
                return NextResponse.json({ error: 'Invalid season or episode' }, { status: 400 });
            }
        }

        let videosRes;
        if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
            videosRes = await cachedTmdbCall(
                `tmdb-videos-tv-${id}-s${season}-e${episode}`,
                () => fetchEpisodeVideos(id, season, episode),
                24 * 60
            );
        } else if (mediaType === 'tv') {
            videosRes = await cachedTmdbCall(`tmdb-videos-tv-${id}`, () => moviedb.tvVideos(id), 24 * 60);
        } else {
            videosRes = await cachedTmdbCall(`tmdb-videos-movie-${id}`, () => moviedb.movieVideos(id), 24 * 60);
        }

        const videos = videosRes.results || [];

        const trailer = pickBestTrailer(videos);

        if (!trailer) {
            return NextResponse.json({ error: 'No trailer found' }, { status: 404 });
        }

        return NextResponse.json({
            key: trailer.key,
            name: trailer.name,
            site: trailer.site,
            type: trailer.type,
        });
    } catch (e: unknown) {
        console.error('Trailer fetch error:', e);
        const message = e instanceof Error ? e.message : 'Failed to fetch trailer';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
