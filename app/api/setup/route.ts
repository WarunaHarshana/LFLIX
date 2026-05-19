import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { getSafeErrorMessage, validateExistingDirectory } from '@/lib/security';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

// Check if setup is complete
export async function GET() {
  try {
    // Check if we have any settings in DB (means setup was done)
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('setupComplete') as { value: string } | undefined;
    const isSetup = setting?.value === 'true';

    return NextResponse.json({ setupComplete: isSetup });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}

// Save setup configuration
export async function POST(req: Request) {
  try {
    const { pin, folders } = await req.json();
    const mediaFolders = Array.isArray(folders) ? folders : [];

    if (!pin || pin.length < 4) {
      return NextResponse.json({ error: 'PIN must be at least 4 digits' }, { status: 400 });
    }

    // Save PIN to .env.local file
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    // Update or add APP_PIN
    if (envContent.includes('APP_PIN=')) {
      envContent = envContent.replace(/APP_PIN=.*/g, `APP_PIN=${pin}`);
    } else {
      envContent += `\nAPP_PIN=${pin}`;
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n');

    // Save folders to database with validation
    for (const folderPath of mediaFolders) {
      if (typeof folderPath !== 'string') {
        continue;
      }

      // SECURITY: Validate each folder path
      const validation = validateExistingDirectory(folderPath);
      if (validation.error !== null) {
        console.error('Invalid folder path:', folderPath, validation.error);
        continue;
      }

      const folderName = path.basename(validation.path) || 'Media Folder';
      try {
        db.prepare(`
          INSERT INTO scanned_folders (folderPath, folderName, contentType)
          VALUES (?, ?, 'mixed')
          ON CONFLICT(folderPath) DO NOTHING
        `).run(validation.path, folderName);
      } catch (e) {
        console.error('Failed to add folder:', folderPath, e);
      }
    }

    // Mark setup as complete
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('setupComplete', 'true')
      ON CONFLICT(key) DO UPDATE SET value = 'true'
    `).run();

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: getSafeErrorMessage(e) }, { status: 500 });
  }
}
