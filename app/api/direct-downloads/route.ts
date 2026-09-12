import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/apiSecurity';
import { parsePositiveInt } from '@/lib/security';
import { fetchCinejoyDirectDownloads } from '@/lib/cinejoy';
import { isDirectDownloadMatch } from '@/lib/titleMatching';
import { cachedTmdbCall, getTmdbClient } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const limited = rateLimit(req, 'direct-downloads', { windowMs: 60 * 1000, max: 60 });
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const tmdbIdParam = searchParams.get('tmdbId');
    const typeParam = searchParams.get('mediaType') || searchParams.get('type') || 'movie';
    const seasonParam = searchParams.get('season');
    const episodeParam = searchParams.get('episode');
    const query = searchParams.get('q')?.trim();
    const titleParam = searchParams.get('title')?.trim();
    const yearParam = searchParams.get('year')?.trim();

    const mediaType: 'movie' | 'tv' = typeParam === 'tv' ? 'tv' : 'movie';
    let tmdbId = tmdbIdParam ? parsePositiveInt(tmdbIdParam) : null;
    const season = seasonParam ? parsePositiveInt(seasonParam) ?? 1 : undefined;
    const episode = episodeParam ? parsePositiveInt(episodeParam) ?? 1 : undefined;

    // Fallback: If tmdbId not passed, resolve via TMDB search if query is provided
    if (!tmdbId && query && query.length >= 2) {
      try {
        const moviedb = getTmdbClient();
        const cacheKey = `tmdb-search-first-${mediaType}-${query.toLowerCase()}`;
        if (mediaType === 'movie') {
          const res = await cachedTmdbCall(cacheKey, () => moviedb.searchMovie({ query }), 10);
          if (res?.results?.[0]?.id) {
            tmdbId = res.results[0].id;
          }
        } else {
          const res = await cachedTmdbCall(cacheKey, () => moviedb.searchTv({ query }), 10);
          if (res?.results?.[0]?.id) {
            tmdbId = res.results[0].id;
          }
        }
      } catch (err) {
        console.error('[direct-downloads] TMDB search fallback error:', err);
      }
    }

    if (!tmdbId) {
      return NextResponse.json(
        { success: false, error: 'tmdbId is required (or a searchable query)', downloads: [], count: 0 },
        { status: 400 }
      );
    }

    const title = titleParam || query || undefined;
    const year = yearParam || undefined;
    const downloads = await fetchCinejoyDirectDownloads(tmdbId, mediaType, season, episode, {
      title,
      year,
      season,
      episode,
    });

    const filteredDownloads = title
      ? downloads.filter((dl) =>
          isDirectDownloadMatch(dl, title, {
            year,
            mediaType,
            season,
            episode,
          })
        )
      : downloads;

    return NextResponse.json({
      success: true,
      downloads: filteredDownloads,
      count: filteredDownloads.length,
      tmdbId,
      mediaType,
    });
  } catch (error: any) {
    console.error('[direct-downloads] Error resolving direct downloads:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch direct downloads', downloads: [], count: 0 },
      { status: 500 }
    );
  }
}
