import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

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

        const channels = db.prepare('SELECT * FROM iptv_channels ORDER BY name').all();
        db.close();

        return NextResponse.json({ channels });
    } catch (error) {
        console.error('Failed to fetch IPTV channels:', error);
        return NextResponse.json({ channels: [], error: 'Failed to fetch channels' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { name, url, logo, category } = await req.json();

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
