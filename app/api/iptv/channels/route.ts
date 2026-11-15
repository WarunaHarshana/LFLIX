import { NextRequest, NextResponse } from 'next/server';
import { iptvDb } from '@/lib/db';
import { readJsonObject } from '@/lib/apiSecurity';
import { fetchTimStreamsChannels, TIMSTREAMS_BASE } from '@/lib/timstreams';
import { fetchPpvChannels } from '@/lib/ppv';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const dbChannels = iptvDb.getChannels();

        // 1. Fetch TimStreams channels (224 channels across USA, UK, Sports, News, etc.)
        let timStreamsChannels: any[] = [];
        try {
            const { channels: tsChannels, genres: tsGenres } = await fetchTimStreamsChannels();
            if (tsChannels && Array.isArray(tsChannels)) {
                timStreamsChannels = tsChannels.map((ch: any, index: number) => {
                    let streamUrl = ch.streams && ch.streams[0] ? ch.streams[0].url : '';
                    let logo = ch.logo || null;
                    if (logo && !logo.startsWith('http://') && !logo.startsWith('https://')) {
                        logo = `${TIMSTREAMS_BASE}${logo.startsWith('/') ? '' : '/'}${logo}`;
                    }

                    const flagToCountry: Record<string, string> = {
                        us: 'USA',
                        gb: 'UK',
                        uk: 'UK',
                        ca: 'Canada',
                        au: 'Australia',
                        es: 'Spain',
                        fr: 'France',
                        de: 'Germany',
                        it: 'Italy'
                    };
                    const country = (ch.flag && flagToCountry[ch.flag.toLowerCase()]) || 'Global';

                    return {
                        id: -1000 - index,
                        name: ch.name || 'Unknown Channel',
                        url: streamUrl,
                        logo,
                        category: tsGenres[ch.genre] || 'Entertainment',
                        country
                    };
                });
            }
        } catch (error) {
            console.error('Failed to fetch TimStreams channels:', error);
        }

        // 2. Fetch PPV.st 24/7 TV channels (NFL Network, etc.)
        let ppvChannels: any[] = [];
        try {
            const ppvItems = await fetchPpvChannels();
            if (Array.isArray(ppvItems)) {
                ppvChannels = ppvItems.map((item, index) => {
                    return {
                        id: -3000 - index,
                        name: item.name || '24/7 Live Channel',
                        url: item.iframe || '',
                        logo: item.poster || null,
                        category: item.category_name || 'Sports TV',
                        country: 'USA'
                    };
                });
            }
        } catch (error) {
            console.error('Failed to fetch PPV 24/7 channels:', error);
        }

        const channels = [...dbChannels, ...timStreamsChannels, ...ppvChannels];
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
