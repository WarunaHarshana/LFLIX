import { NextRequest, NextResponse } from 'next/server';
import { iptvDb } from '@/lib/db';
import { readJsonObject } from '@/lib/apiSecurity';
import { validateHttpDownloadUrl } from '@/lib/security';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Parse M3U content
function parseM3U(content: string): Array<{ name: string; url: string; logo?: string; category?: string }> {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    const channels: Array<{ name: string; url: string; logo?: string; category?: string }> = [];

    let currentChannel: any = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('#EXTINF:')) {
            // Extract channel info
            const nameMatch = line.match(/,(.+)$/);
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            const groupMatch = line.match(/group-title="([^"]+)"/);

            currentChannel = {
                name: nameMatch ? nameMatch[1].trim() : 'Unknown Channel',
                logo: logoMatch ? logoMatch[1] : undefined,
                category: groupMatch ? groupMatch[1] : 'General'
            };
        } else if (line.startsWith('http')) {
            // This is a URL
            if (currentChannel.name) {
                channels.push({
                    ...currentChannel,
                    url: line
                });
                currentChannel = {};
            }
        }
    }

    return channels;
}

export async function POST(req: NextRequest) {
    try {
        const body = await readJsonObject(req);
        const m3uUrl = typeof body.m3uUrl === 'string' ? body.m3uUrl : null;
        const m3uContent = typeof body.m3uContent === 'string' ? body.m3uContent : null;
        const source = body.source;

        let content = '';

        // If importing from iptv-org
        if (source === 'iptv-org') {
            const response = await fetch('https://iptv-org.github.io/iptv/index.m3u');
            if (!response.ok) {
                return NextResponse.json({ error: 'Failed to fetch from iptv-org' }, { status: 500 });
            }
            content = await response.text();
        }
        // If importing from URL
        else if (m3uUrl) {
            // The server performs this fetch, so an unvalidated URL would let a
            // caller probe the loopback interface and the local network.
            const validated = await validateHttpDownloadUrl(m3uUrl);
            if (validated.error !== null) {
                return NextResponse.json({ error: validated.error }, { status: 400 });
            }

            const response = await fetch(validated.url, { redirect: 'error' });
            if (!response.ok) {
                return NextResponse.json({ error: 'Failed to fetch M3U from URL' }, { status: 502 });
            }
            content = await response.text();
        }
        // If importing from content
        else if (m3uContent) {
            content = m3uContent;
        } else {
            return NextResponse.json({ error: 'No M3U source provided' }, { status: 400 });
        }

        // Parse M3U
        const channels = parseM3U(content);

        if (channels.length === 0) {
            return NextResponse.json({ error: 'No channels found in M3U' }, { status: 400 });
        }

        // Insert via the shared connection. This previously opened its own
        // handle on ./localflix.db, so every imported channel landed in a file
        // the rest of the app never reads.
        let imported = 0;
        for (const channel of channels) {
            try {
                iptvDb.addChannel({
                    name: channel.name,
                    url: channel.url,
                    logo: channel.logo,
                    category: channel.category,
                });
                imported++;
            } catch (error) {
                // Skip duplicates or errors
                console.error('Failed to import channel:', channel.name, error);
            }
        }

        return NextResponse.json({
            success: true,
            imported,
            total: channels.length
        });
    } catch (error) {
        console.error('Failed to import IPTV channels:', error);
        return NextResponse.json({ error: 'Failed to import channels' }, { status: 500 });
    }
}
