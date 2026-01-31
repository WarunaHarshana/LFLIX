import { NextResponse } from 'next/server';
import db from '@/lib/db';

// Get all settings
export async function GET() {
    try {
        const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];

        const settingsObj: Record<string, string> = {};
        for (const s of settings) {
            settingsObj[s.key] = s.value;
        }

        return NextResponse.json(settingsObj);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// Update settings
export async function POST(req: Request) {
    try {
        const settings = await req.json();

        const updateSetting = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

        for (const [key, value] of Object.entries(settings)) {
            if (typeof value === 'string') {
                updateSetting.run(key, value);
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
