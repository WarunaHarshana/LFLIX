import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { scanFile } from '@/lib/scanner';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'];

function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

function getVideoFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        getVideoFiles(filePath, fileList);
      } else if (isVideoFile(filePath)) {
        fileList.push(filePath);
      }
    } catch {
      // ignore access errors
    }
  }
  return fileList;
}

export async function POST() {
  try {
    // Get all watched folders
    const folders = db.prepare('SELECT folderPath FROM scanned_folders').all() as { folderPath: string }[];
    
    if (folders.length === 0) {
      return NextResponse.json({ error: 'No folders to scan' }, { status: 400 });
    }

    let totalAdded = 0;
    const errors: string[] = [];

    // Scan each folder
    for (const { folderPath } of folders) {
      if (!fs.existsSync(folderPath)) {
        errors.push(`Folder not found: ${folderPath}`);
        continue;
      }

      // Get all video files
      const videoFiles = getVideoFiles(folderPath);
      
      // Scan each file
      for (const filePath of videoFiles) {
        try {
          const result = await scanFile(filePath);
          if (result.added) {
            totalAdded++;
          }
        } catch (e: any) {
          errors.push(`Error scanning ${filePath}: ${e.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      folders: folders.length,
      added: totalAdded,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (e: any) {
    console.error('Rescan error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
