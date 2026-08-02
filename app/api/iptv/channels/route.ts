import { NextRequest, NextResponse } from 'next/server';
import { iptvDb } from '@/lib/db';
import { readJsonObject } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        // Uses the shared connection in lib/db.ts. This route previously opened
        // its own handle on ./localflix.db and declared a reduced iptv_channels
        // table there, so imported channels landed in a file nothing else read,
        // with none of the schema or indexes the rest of the app expects.
        const dbChannels = iptvDb.getChannels();

        let timStreamsChannels: any[] = [];
        try {
            const response = await fetch('https://api.nuevasantino.xyz/api/channels', {
                headers: {
                    'Accept': 'application/json',
                },
                next: { revalidate: 300 } // Cache for 5 minutes
            });
            if (response.ok) {
                const data = await response.json();
                if (data.channels && Array.isArray(data.channels)) {
                    const genres = data.genres || {};
                    timStreamsChannels = data.channels.map((ch: any, index: number) => {
                        let streamUrl = ch.streams && ch.streams[0] ? ch.streams[0].url : '';
                        if (streamUrl && (streamUrl.includes('junkieembeds.pages.dev') || streamUrl.includes('vivocdn'))) {
                            const match = streamUrl.match(/\/embed\/([^\/?#]+)/);
                            const streamId = match ? match[1] : streamUrl.split('/').pop();
                            if (streamId) {
                                streamUrl = `/api/sports/streams/resolve?id=${streamId}&ext=.m3u8`;
                            }
                        }
                        return {
                            id: -1000 - index,
                            name: ch.name || 'Unknown Channel',
                            url: streamUrl,
                            logo: ch.logo || null,
                            category: genres[ch.genre] || 'TimStreams',
                            country: 'Global'
                        };
                    });
                }
            }
        } catch (error) {
            console.error('Failed to fetch TimStreams channels:', error);
        }

        const channels = [...dbChannels, ...timStreamsChannels];
        return NextResponse.json({ channels });
    } catch (error) {
        console.error('Failed to fetch IPTV channels:', error);
        return NextResponse.json({ channels: [], error: 'Failed to fetch channels' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await readJsonObject(req);
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const url = typeof body.url === 'string' ? body.url.trim() : '';
        const logo = typeof body.logo === 'string' ? body.logo : undefined;
        const category = typeof body.category === 'string' ? body.category : undefined;

        if (!name || !url) {
            return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
        }

        const result = iptvDb.addChannel({ name, url, logo, category });
        const channel = iptvDb.getChannel(Number(result.lastInsertRowid));

        return NextResponse.json(channel);
    } catch (error) {
        console.error('Failed to add IPTV channel:', error);
        return NextResponse.json({ error: 'Failed to add channel' }, { status: 500 });
    }
}
