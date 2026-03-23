import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type StreamServer = {
  name: string;
  url: string;
  color: string;
};

function buildServerUrls(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): StreamServer[] {
  const servers: StreamServer[] = [];
  const episodeSuffix = type === 'tv' && season && episode ? `/${season}/${episode}` : '';

  // ZXCSTREAM
  servers.push({
    name: 'ZXCSTREAM',
    url: `https://vidsrc.xyz/embed/${type}/${tmdbId}${episodeSuffix}`,
    color: '#3b82f6', // Blue
  });

  // VIDLINK
  if (type === 'movie') {
    servers.push({
      name: 'VIDLINK',
      url: `https://vidlink.pro/movie/${tmdbId}`,
      color: '#ef4444', // Red
    });
  } else {
    servers.push({
      name: 'VIDLINK',
      url: `https://vidlink.pro/tv/${tmdbId}/${season || 1}/${episode || 1}`,
      color: '#ef4444', // Red
    });
  }

  // FREMBED
  if (type === 'movie') {
    servers.push({
      name: 'FREMBED',
      url: `https://frembed.pro/api/film.php?id=${tmdbId}`,
      color: '#10b981', // Green
    });
  } else {
    servers.push({
      name: 'FREMBED',
      url: `https://frembed.pro/api/serie.php?id=${tmdbId}&sa=${season || 1}&epi=${episode || 1}`,
      color: '#10b981', // Green
    });
  }

  // VIXSRC (Using reliable vidsrc.cc backend)
  servers.push({
    name: 'VIXSRC',
    url: `https://vidsrc.cc/v2/embed/${type}/${tmdbId}${episodeSuffix}`,
    color: '#f97316', // Orange
  });

  // RGSHOWS (Using reliable multiembed backend)
  if (type === 'movie') {
    servers.push({
      name: 'RGSHOWS',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      color: '#8b5cf6', // Purple
    });
  } else {
    servers.push({
      name: 'RGSHOWS',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}`,
      color: '#8b5cf6', // Purple
    });
  }

  // SUPERFLIX (Using vidsrc.xyz backend)
  servers.push({
    name: 'SUPERFLIX',
    url: `https://vidsrc.xyz/embed/${type}/${tmdbId}${episodeSuffix}`,
    color: '#ec4899', // Pink
  });

  // MODOCINE (Using vidsrc.cc backend)
  servers.push({
    name: 'MODOCINE',
    url: `https://vidsrc.cc/v2/embed/${type}/${tmdbId}${episodeSuffix}`,
    color: '#06b6d4', // Cyan
  });

  // 2EMBED (Using multiembed backend)
  if (type === 'movie') {
    servers.push({
      name: '2EMBED',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      color: '#f59e0b', // Yellow
    });
  } else {
    servers.push({
      name: '2EMBED',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season || 1}&e=${episode || 1}`,
      color: '#f59e0b', // Yellow
    });
  }

  // SMASHYSTREAM
  if (type === 'movie') {
    servers.push({
      name: 'SMASHYSTREAM',
      url: `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}`,
      color: '#8b5cf6', // Purple
    });
  } else {
    servers.push({
      name: 'SMASHYSTREAM',
      url: `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&season=${season || 1}&episode=${episode || 1}`,
      color: '#8b5cf6', // Purple
    });
  }

  return servers;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get('tmdbId');
    const type = searchParams.get('type') as 'movie' | 'tv' | null;
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!tmdbId || !type) {
      return NextResponse.json({ error: 'Missing tmdbId or type' }, { status: 400 });
    }

    if (type !== 'movie' && type !== 'tv') {
      return NextResponse.json({ error: 'Invalid type, must be movie or tv' }, { status: 400 });
    }

    const servers = buildServerUrls(
      parseInt(tmdbId, 10),
      type,
      season ? parseInt(season, 10) : undefined,
      episode ? parseInt(episode, 10) : undefined
    );

    return NextResponse.json({ servers });
  } catch (e: any) {
    console.error('Stream servers error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
