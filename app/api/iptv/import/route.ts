import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'localflix.db');

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
        const body = await req.json();
        const { m3uUrl, m3uContent, source } = body;

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
            const response = await fetch(m3uUrl);
            if (!response.ok) {
                return NextResponse.json({ error: 'Failed to fetch M3U from URL' }, { status: 500 });
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

        // Insert into database
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

        let imported = 0;
        for (const channel of channels) {
            try {
                stmt.run(channel.name, channel.url, channel.logo || null, channel.category || 'General');
                imported++;
            } catch (error) {
                // Skip duplicates or errors
                console.error('Failed to import channel:', channel.name, error);
            }
        }

        db.close();

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
