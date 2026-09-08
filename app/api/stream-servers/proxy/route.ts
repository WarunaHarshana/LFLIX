import { NextRequest, NextResponse } from 'next/server';
import { isAllowedCinejoyHost, rewriteM3u8Playlist } from '@/lib/cinejoy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid url format' }, { status: 400 });
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
    }

    if (!isAllowedCinejoyHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: `Host not allowed: ${parsedUrl.hostname}` },
        { status: 403 }
      );
    }

    const headers: Record<string, string> = {
      Accept: '*/*',
      Referer: 'https://cinejoy.to/',
      Origin: 'https://cinejoy.to',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    };

    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      headers.Range = rangeHeader;
    }

    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(12000),
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return new NextResponse(upstreamRes.statusText, {
        status: upstreamRes.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const contentType = upstreamRes.headers.get('content-type') || '';
    const isM3u8 =
      parsedUrl.pathname.endsWith('.m3u8') ||
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      contentType.includes('audio/x-mpegurl');

    if (isM3u8) {
      const playlistText = await upstreamRes.text();
      const rewritten = rewriteM3u8Playlist(playlistText, targetUrl);

      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Media segments (.ts, .html chunk, .m4s, etc.)
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Cache-Control': 'public, max-age=3600',
    };

    let effectiveContentType = contentType;
    const pathname = parsedUrl.pathname.toLowerCase();
    if (
      pathname.endsWith('.html') ||
      pathname.endsWith('.m4s') ||
      pathname.endsWith('.mp4') ||
      pathname.includes('video_') ||
      pathname.includes('audio_') ||
      contentType.includes('text/html')
    ) {
      effectiveContentType = 'video/mp4';
    } else if (pathname.endsWith('.ts')) {
      effectiveContentType = 'video/mp2t';
    }

    if (effectiveContentType) responseHeaders['Content-Type'] = effectiveContentType;

    const contentEncoding = upstreamRes.headers.get('content-encoding');
    const contentLength = upstreamRes.headers.get('content-length');
    // Only forward content-length if fetch did not decompress the body (e.g. uncompressed)
    if (contentLength && !contentEncoding) {
      responseHeaders['Content-Length'] = contentLength;
    }

    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;
    const acceptRanges = upstreamRes.headers.get('accept-ranges');
    if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('[cinejoy-proxy] Error proxying stream:', error.message || error);
    return NextResponse.json(
      { error: `Proxy failure: ${error.message || 'unknown error'}` },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
