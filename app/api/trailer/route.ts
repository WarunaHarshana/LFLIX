import { NextResponse } from 'next/server';
import { cachedTmdbCall, getTmdbClient } from '@/lib/metadata';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const tmdbId = searchParams.get('tmdbId');
        const mediaType = searchParams.get('mediaType'); // movie or tv

        if (!tmdbId || !mediaType) {
            return NextResponse.json({ error: 'Missing tmdbId or mediaType' }, { status: 400 });
        }

        const moviedb = getTmdbClient();
        const id = parseInt(tmdbId);

        let videosRes;
        if (mediaType === 'tv') {
            videosRes = await cachedTmdbCall(`tmdb-videos-tv-${id}`, () => moviedb.tvVideos(id), 24 * 60);
        } else {
            videosRes = await cachedTmdbCall(`tmdb-videos-movie-${id}`, () => moviedb.movieVideos(id), 24 * 60);
        }

        const videos = videosRes.results || [];

        // Filter for YouTube videos only
        const youtubeVideos = videos.filter((v: any) => v.site === 'YouTube' && v.key);

        // Priority: Official Trailer > Trailer > Teaser > any other
        const trailer =
            youtubeVideos.find((v: any) => v.type === 'Trailer' && v.official === true) ||
            youtubeVideos.find((v: any) => v.type === 'Trailer') ||
            youtubeVideos.find((v: any) => v.type === 'Teaser') ||
            youtubeVideos[0] || null;

        if (!trailer) {
            return NextResponse.json({ error: 'No trailer found' }, { status: 404 });
        }

        return NextResponse.json({
            key: trailer.key,
            name: trailer.name,
            site: trailer.site,
            type: trailer.type,
        });
    } catch (e: any) {
        console.error('Trailer fetch error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
