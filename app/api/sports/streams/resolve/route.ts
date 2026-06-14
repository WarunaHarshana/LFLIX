import { NextRequest, NextResponse } from 'next/server';
import { resolveTimStream } from '@/lib/timstreams';
import { resolveEmbedStream } from '@/lib/embedResolver';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Cache resolved streams for 60 seconds to avoid re-resolving
const streamCache = new Map<string, { data: any; expiry: number }>();

function getCached(key: string) {
  const entry = streamCache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  streamCache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttlMs = 55000) {
  streamCache.set(key, { data, expiry: Date.now() + ttlMs });
  // Cleanup old entries
  if (streamCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of streamCache) {
      if (v.expiry < now) streamCache.delete(k);
    }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const streamId = searchParams.get('id');
  const type = searchParams.get('type'); // 'embed' for embed.st, default for timstreams
  const source = searchParams.get('source') || 'admin';
  const streamNo = searchParams.get('streamNo') || '1';
  const quality = searchParams.get('quality'); // 'high', 'low', etc.

  if (!streamId) {
    return NextResponse.json({ error: 'Stream ID is required' }, { status: 400 });
  }

  // Handle embed.st stream resolution
  if (type === 'embed') {
    const cacheKey = `embed:${source}:${streamId}:${streamNo}`;

    try {
      let resolved = getCached(cacheKey);
      if (!resolved) {
        resolved = await resolveEmbedStream(source, streamId, streamNo);
        setCache(cacheKey, resolved);
      }

      // If a specific quality is requested, return that playlist
      if (quality) {
        const q = resolved.qualities.find(
          (q: any) => q.name.toLowerCase().includes(quality.toLowerCase()) ||
            q.playlistUrl.includes(`/${quality}/`)
        );
        if (q?.playlistContent) {
          return new NextResponse(q.playlistContent, {
            headers: {
              'Content-Type': 'application/vnd.apple.mpegurl',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache',
            },
          });
        }
      }

      // Return the master playlist with rewritten quality URLs
      // pointing to our own API endpoint for proxying
      const baseUrl = `/api/sports/streams/resolve?type=embed&id=${encodeURIComponent(streamId)}&source=${encodeURIComponent(source)}&streamNo=${streamNo}`;
      let rewrittenMaster = resolved.masterPlaylist;

      // Replace relative quality playlist paths with our proxy URLs
      for (const q of resolved.qualities) {
        const qualityName = q.playlistUrl.split('/').slice(-2, -1)[0]; // e.g., 'high', 'low'
        const relPath = q.playlistUrl.split('/').slice(-2).join('/'); // e.g., 'high/mono.m3u8'
        rewrittenMaster = rewrittenMaster.replace(
          relPath,
          `${baseUrl}&quality=${qualityName}&ext=.m3u8`
        );
      }

      return new NextResponse(rewrittenMaster, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error: any) {
      console.error(`[EmbedResolver] Failed to resolve stream ${streamId}:`, error);
      return NextResponse.json(
        { error: `Failed to resolve embedded stream: ${error.message}` },
        { status: 500 }
      );
    }
  }

  // Default: handle junkieembeds/timstreams resolution
  try {
    const embedUrl = `https://junkieembeds.pages.dev/embed/${streamId}`;
    const decryptedUrl = await resolveTimStream(embedUrl);

    // Redirect to the decrypted stream (automatic 302 redirect)
    return NextResponse.redirect(decryptedUrl, { status: 302 });
  } catch (error: any) {
    console.error(`Failed to resolve TimStreams stream for ID ${streamId}:`, error);
    return NextResponse.json(
      { error: `Failed to resolve stream: ${error.message}` },
      { status: 500 }
    );
  }
}
