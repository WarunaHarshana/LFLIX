import { NextResponse } from 'next/server';
import { fetchPpvStreams, getPpvStreamsForMatch } from '@/lib/ppv';
import { fetchStrmFreeStreamByKey, fetchStrmFreeStreams, getStrmFreeStreamsForMatch } from '@/lib/strmfree';
import { fetchTimStreamsWatch } from '@/lib/timstreams';
import { fetchPitSportPlay, getPitSportStreams } from '@/lib/pitsport';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

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

  // 1. PPV.st streams
  if (source === 'ppv') {
    try {
      const items = await fetchPpvStreams();
      const numId = Number(id);
      const found = items.find(item => item.id === numId || item.uri_name === id || String(item.id) === id);

      if (!found) {
        return NextResponse.json({ streams: [] });
      }

      const streams = getPpvStreamsForMatch(found);
      return NextResponse.json({ streams });
    } catch (error) {
      console.error('PPV streams API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch streams from PPV.st' },
        { status: 500 }
      );
    }
  }

  // 2. StrmFree.pk streams
  if (source === 'strmfree') {
    try {
      let stream = await fetchStrmFreeStreamByKey(id);
      if (!stream) {
        // Fallback to searching all streams
        const all = await fetchStrmFreeStreams();
        stream = all.find(s => s.stream_key === id || s.id === id) || null;
      }

      if (!stream) {
        // Even if not in API list, generate the standard StrmFree embed fallback
        return NextResponse.json({
          streams: [
            {
              id: `strmfree-${id}-1`,
              streamNo: 1,
              language: 'HD Stream',
              hd: true,
              is4k: false,
              embedUrl: `https://strmfree.pk/embed/sports/${encodeURIComponent(id)}`,
              source: 'strmfree',
              referer: 'https://strmfree.pk/'
            }
          ]
        });
      }

      const streams = await getStrmFreeStreamsForMatch(stream);
      return NextResponse.json({ streams });
    } catch (error) {
      console.error('StrmFree streams API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch streams from StrmFree' },
        { status: 500 }
      );
    }
  }

  // 3. TimStreams streams
  if (source === 'timstreams') {
    try {
      const event = await fetchTimStreamsWatch(id);

      if (!event || !event.streams || event.streams.length === 0) {
        return NextResponse.json({ streams: [] });
      }

      const transformedStreams = event.streams.map((stream: any, index: number) => {
        const label = (stream.name || '').toUpperCase();
        const is4k = label.includes('4K') || label.includes('UHD');
        const isHd = is4k || label.includes('FHD') || label.includes('720P') || label.includes('1080P') || label.includes('MAX') || label.includes('HEVC');
        return {
          id: `timstreams-${id}-${index + 1}`,
          streamNo: index + 1,
          language: stream.name || `Stream ${index + 1}`,
          hd: !!isHd,
          is4k: is4k,
          embedUrl: stream.url,
          source: 'timstreams',
          referer: 'https://tim-streams.com/'
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

  // 4. PitSport.st streams
  if (source === 'pitsport') {
    try {
      const playData = await fetchPitSportPlay(id);

      if (!playData || !playData.hasVideo) {
        return NextResponse.json({ streams: [] });
      }

      const streams = getPitSportStreams(playData, id);
      return NextResponse.json({ streams });
    } catch (error) {
      console.error('PitSport streams API error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch streams from PitSport' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ streams: [] });
}
