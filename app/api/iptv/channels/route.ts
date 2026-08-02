import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { readJsonObject } from '@/lib/apiSecurity';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

const dbPath = path.join(process.cwd(), 'localflix.db');

export async function GET(req: NextRequest) {
    try {
        const db = new Database(dbPath);

        // Create table if not exists
        db.exec(`
          CREATE TABLE IF NOT EXISTS iptv_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            logo TEXT,
            category TEXT DEFAULT 'General',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        const dbChannels = db.prepare('SELECT * FROM iptv_channels ORDER BY name').all();
        db.close();

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
        const { name, url, logo, category } = await readJsonObject(req);

        if (!name || !url) {
            return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
        }

        const db = new Database(dbPath);

        // Create table if not exists
        db.exec(`
      CREATE TABLE IF NOT EXISTS iptv_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        logo TEXT,
        category TEXT DEFAULT 'General',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        const stmt = db.prepare('INSERT INTO iptv_channels (name, url, logo, category) VALUES (?, ?, ?, ?)');
        const result = stmt.run(name, url, logo || null, category || 'General');

        const channel = db.prepare('SELECT * FROM iptv_channels WHERE id = ?').get(result.lastInsertRowid);
        db.close();

        return NextResponse.json(channel);
    } catch (error) {
        console.error('Failed to add IPTV channel:', error);
        return NextResponse.json({ error: 'Failed to add channel' }, { status: 500 });
    }
}
