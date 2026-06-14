import { NextResponse } from 'next/server';

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

  if (source === 'timstreams') {
    try {
      const response = await fetch('https://api.nuevasantino.xyz/api/live-upcoming', {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 30 } // Cache for 30 seconds
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();
      const event = data.events?.find((e: any) => e.url === id);
      if (!event || !event.streams) {
        return NextResponse.json({ streams: [] });
      }
      const transformedStreams = event.streams.map((stream: any, index: number) => ({
        id: `${id}-${index}`,
        streamNo: index + 1,
        language: stream.name || 'English',
        hd: true,
        embedUrl: stream.url,
        source: 'timstreams'
      }));
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
    const transformedStreams = streams.map((stream: any) => ({
      id: stream.id,
      streamNo: stream.streamNo,
      language: stream.language,
      hd: stream.hd,
      embedUrl: stream.embedUrl,
      source: stream.source
    }));

    return NextResponse.json({ streams: transformedStreams });
  } catch (error) {
    console.error('Sports streams API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch streams' },
      { status: 500 }
    );
  }
}
