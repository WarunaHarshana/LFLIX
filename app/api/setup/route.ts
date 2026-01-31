import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';

// SECURITY: Validate folder path to prevent directory traversal
function validateFolderPath(folderPath: string): { valid: boolean; error?: string } {
  // Check for null bytes (path injection)
  if (folderPath.includes('\0')) {
    return { valid: false, error: 'Invalid path' };
  }

  // Normalize the path
  const normalizedPath = path.normalize(folderPath);

  // Check for path traversal attempts (..)
  if (normalizedPath.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  // Must be an absolute path
  if (!path.isAbsolute(normalizedPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  // Must exist and be a directory
  if (!fs.existsSync(normalizedPath)) {
    return { valid: false, error: 'Path does not exist' };
  }

  const stat = fs.statSync(normalizedPath);
  if (!stat.isDirectory()) {
    return { valid: false, error: 'Path is not a directory' };
  }

  return { valid: true };
}

// Check if setup is complete
export async function GET() {
  try {
    // Check if we have any settings in DB (means setup was done)
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('setupComplete') as { value: string } | undefined;
    const isSetup = setting?.value === 'true';

    return NextResponse.json({ setupComplete: isSetup });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Save setup configuration
export async function POST(req: Request) {
  try {
    const { pin, apiKey, folders } = await req.json();

    if (!pin || pin.length < 4) {
      return NextResponse.json({ error: 'PIN must be at least 4 digits' }, { status: 400 });
    }

    if (!apiKey || apiKey.length < 10) {
      return NextResponse.json({ error: 'Valid TMDB API key required' }, { status: 400 });
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

    // Update or add TMDB_API_KEY
    if (envContent.includes('TMDB_API_KEY=')) {
      envContent = envContent.replace(/TMDB_API_KEY=.*/g, `TMDB_API_KEY=${apiKey}`);
    } else {
      envContent += `\nTMDB_API_KEY=${apiKey}`;
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n');

    // Save folders to database with validation
    for (const folderPath of folders) {
      // SECURITY: Validate each folder path
      const validation = validateFolderPath(folderPath);
      if (!validation.valid) {
        console.error('Invalid folder path:', folderPath, validation.error);
        continue;
      }

      const folderName = path.basename(folderPath) || 'Media Folder';
      try {
        db.prepare(`
          INSERT INTO scanned_folders (folderPath, folderName, contentType)
          VALUES (?, ?, 'mixed')
          ON CONFLICT(folderPath) DO NOTHING
        `).run(folderPath, folderName);
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
