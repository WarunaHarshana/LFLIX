import { NextResponse } from 'next/server';
import { fetchStreamiEventById, getStreamiStreams } from '@/lib/streami';
import { fetchXyzStreams } from '@/lib/xyzstreams';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Get stream URLs for a specific match
const API_BASE = 'https://streamed.pk/api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get('source');
  const id = searchParams.get('id');

  if (!source || !id) {
    return NextResponse.json(
      { error: 'Source and ID are required' },
      { status: 400 }
    );
  }

  if (source === 'streami') {
    try {
      const event = await fetchStreamiEventById(id);
      if (!event) {
        return NextResponse.json({ streams: [] });
      }
      const transformedStreams = getStreamiStreams(event);
      return NextResponse.json({ streams: transformedStreams });
    } catch (error) {
      console.error('Streami sports streams API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch streams from Streami' },
        { status: 500 }
      );
    }
  }

  if (source === 'xyzstreams') {
    try {
      const transformedStreams = await fetchXyzStreams(id);
      return NextResponse.json({ streams: transformedStreams });
    } catch (error) {
      console.error('xyzstreams sports streams API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch streams from xyzstreams' },
        { status: 500 }
      );
    }
  }

  if (source === 'timstreams') {
    try {
      // Fetch watch details which returns all available qualities/sources for the event
      const response = await fetch(`https://api.nuevasantino.xyz/api/watch/${encodeURIComponent(id)}`, {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 30 } // Cache for 30 seconds
      });
      
      let event = null;
      if (response.ok) {
        const data = await response.json();
        event = data.item;
      }
      
      // Fallback to live-upcoming if watch API fails or has no streams
      if (!event || !event.streams || event.streams.length === 0) {
        const fallbackResponse = await fetch('https://api.nuevasantino.xyz/api/live-upcoming', {
          headers: {
            'Accept': 'application/json',
          },
          next: { revalidate: 30 }
        });
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          event = fallbackData.events?.find((e: any) => e.url === id);
        }
      }

      if (!event || !event.streams) {
        return NextResponse.json({ streams: [] });
      }

      const transformedStreams = event.streams.map((stream: any, index: number) => {
        const label = (stream.name || '').toUpperCase();
        const is4k = label.includes('4K') || label.includes('UHD');
        const isHd = is4k || label.includes('FHD') || label.includes('720P') || label.includes('MAX') || label.includes('HEVC');
        return {
          id: `${id}-${index}`,
          streamNo: index + 1,
          language: stream.name || `Stream ${index + 1}`,
          hd: !!isHd,
          is4k: is4k,
          embedUrl: stream.url,
          source: 'timstreams'
        };
      });

      return NextResponse.json({ streams: transformedStreams });
    } catch (error) {
      console.error('TimStreams sports streams API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch streams from TimStreams' },
        { status: 500 }
      );
    }
  }

  try {
    const response = await fetch(`${API_BASE}/stream/${source}/${id}`, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 30 } // Cache for 30 seconds
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const streams = await response.json();
    
    // Transform streams
    const transformedStreams = streams.map((stream: any) => {
      const label = (stream.language || '').toUpperCase();
      const is4k = label.includes('4K') || label.includes('UHD');
      return {
        id: stream.id,
        streamNo: stream.streamNo,
        language: stream.language,
        hd: stream.hd || is4k,
        is4k: is4k,
        embedUrl: stream.embedUrl,
        source: stream.source
      };
    });

    return NextResponse.json({ streams: transformedStreams });
  } catch (error) {
    console.error('Sports sports streams API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch streams' },
      { status: 500 }
    );
  }
}
