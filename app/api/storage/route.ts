import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { rateLimit } from '@/lib/apiSecurity';
import db from '@/lib/db';
import { getSafeErrorMessage } from '@/lib/security';

export const dynamic = 'force-dynamic';

type StorageLocation = {
  kind: 'app' | 'download' | 'library' | 'download-history';
  label: string;
  path: string;
  contentType?: string | null;
};

type DriveStatus = 'ok' | 'low' | 'critical' | 'unknown';

type DriveRecord = {
  name: string;
  path: string;
  status: DriveStatus;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  freePercent: number;
  locations: StorageLocation[];
  error?: string;
};

type ScannedFolderRow = {
  folderPath: string;
  folderName: string;
  contentType: string | null;
};

type SettingRow = { value: string };
type DownloadPathRow = { downloadPath: string | null };

const GIB = 1024 * 1024 * 1024;
const LOW_FREE_PERCENT = 12;
const CRITICAL_FREE_PERCENT = 5;
const LOW_FREE_BYTES = 50 * GIB;
const CRITICAL_FREE_BYTES = 10 * GIB;

function getWindowsDriveRoots(): string[] {
  const drives: string[] = [];

  for (let code = 65; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(drive)) {
        drives.push(drive);
      }
    } catch {
      // Ignore inaccessible removable or network drives.
    }
  }

  return drives;
}

function getRootForPath(inputPath: string): string | null {
  if (!inputPath) {
    return null;
  }

  const normalized = path.normalize(inputPath);

  if (os.platform() === 'win32') {
    const driveMatch = normalized.match(/^([a-zA-Z]:)[\\/]/);
    if (driveMatch) {
      return `${driveMatch[1].toUpperCase()}\\`;
    }

    const uncMatch = normalized.match(/^\\\\([^\\/]+)[\\/]([^\\/]+)/);
    if (uncMatch) {
      return `\\\\${uncMatch[1]}\\${uncMatch[2]}\\`;
    }
  }

  return path.parse(normalized).root || null;
}

function getDriveName(rootPath: string): string {
  if (os.platform() === 'win32') {
    return rootPath.replace(/[\\/]+$/, '');
  }

  return rootPath === '/' ? 'Root' : rootPath;
}

function getDriveStatus(freeBytes: number, totalBytes: number): DriveStatus {
  if (totalBytes <= 0) {
    return 'unknown';
  }

  const freePercent = (freeBytes / totalBytes) * 100;

  if (freePercent <= CRITICAL_FREE_PERCENT || freeBytes <= CRITICAL_FREE_BYTES) {
    return 'critical';
  }

  if (freePercent <= LOW_FREE_PERCENT || freeBytes <= LOW_FREE_BYTES) {
    return 'low';
  }

  return 'ok';
}

function uniqueLocations(locations: StorageLocation[]): StorageLocation[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = `${location.kind}:${location.path.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readStorageLocations(): StorageLocation[] {
  const locations: StorageLocation[] = [
    {
      kind: 'app',
      label: 'LFLIX app',
      path: process.cwd(),
    },
    {
      kind: 'download',
      label: 'Default downloads',
      path: path.join(process.cwd(), 'downloads'),
    },
  ];

  try {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('downloadPath') as SettingRow | undefined;
    if (setting?.value) {
      locations.push({
        kind: 'download',
        label: 'Configured downloads',
        path: setting.value,
      });
    }
  } catch {
    // Settings table can be unavailable during very early setup.
  }

  try {
    const folders = db.prepare('SELECT folderPath, folderName, contentType FROM scanned_folders').all() as ScannedFolderRow[];
    for (const folder of folders) {
      locations.push({
        kind: 'library',
        label: folder.folderName || 'Library folder',
        path: folder.folderPath,
        contentType: folder.contentType,
      });
    }
  } catch {
    // Ignore; storage still works without library rows.
  }

  try {
    const downloadPaths = db.prepare(`
      SELECT DISTINCT downloadPath
      FROM downloads
      WHERE downloadPath IS NOT NULL AND TRIM(downloadPath) != ''
      LIMIT 25
    `).all() as DownloadPathRow[];

    for (const row of downloadPaths) {
      if (row.downloadPath) {
        locations.push({
          kind: 'download-history',
          label: 'Download history',
          path: row.downloadPath,
        });
      }
    }
  } catch {
    // Ignore; downloads table can be empty or unavailable during setup.
  }

  return uniqueLocations(locations);
}

function getCandidateRoots(locations: StorageLocation[]): string[] {
  const roots = new Set<string>();

  if (os.platform() === 'win32') {
    for (const drive of getWindowsDriveRoots()) {
      roots.add(drive);
    }
  } else {
    roots.add('/');
    roots.add(getRootForPath(os.homedir()) || '/');
  }

  for (const location of locations) {
    const root = getRootForPath(location.path);
    if (root) {
      roots.add(root);
    }
  }

  return [...roots].sort((a, b) => a.localeCompare(b));
}

function buildDriveRecord(rootPath: string, locations: StorageLocation[]): DriveRecord {
  const driveLocations = locations.filter((location) => getRootForPath(location.path) === rootPath);

  try {
    const stats = fs.statfsSync(rootPath);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;

    return {
      name: getDriveName(rootPath),
      path: rootPath,
      status: getDriveStatus(freeBytes, totalBytes),
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent,
      freePercent,
      locations: driveLocations,
    };
  } catch (error) {
    return {
      name: getDriveName(rootPath),
      path: rootPath,
      status: 'unknown',
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      usedPercent: 0,
      freePercent: 0,
      locations: driveLocations,
      error: getSafeErrorMessage(error),
    };
  }
}

export async function GET(req: Request) {
  const checkedAt = new Date().toISOString();

  try {
    const limited = rateLimit(req, 'storage-read', { windowMs: 60 * 1000, max: 60 });
    if (limited) return limited;

    const locations = readStorageLocations();
    const drives = getCandidateRoots(locations).map((rootPath) => buildDriveRecord(rootPath, locations));
    const readableDrives = drives.filter((drive) => drive.totalBytes > 0);
    const totalBytes = readableDrives.reduce((sum, drive) => sum + drive.totalBytes, 0);
    const freeBytes = readableDrives.reduce((sum, drive) => sum + drive.freeBytes, 0);
    const lowDrives = drives.filter((drive) => drive.status === 'low').length;
    const criticalDrives = drives.filter((drive) => drive.status === 'critical').length;

    return NextResponse.json({
      status: criticalDrives > 0 ? 'critical' : lowDrives > 0 ? 'low' : 'ok',
      checkedAt,
      platform: os.platform(),
      summary: {
        driveCount: drives.length,
        totalBytes,
        freeBytes,
        usedBytes: Math.max(0, totalBytes - freeBytes),
        freePercent: totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0,
        lowDrives,
        criticalDrives,
      },
      drives,
    });
  } catch (error) {
    console.error('[Storage] storage sense failed:', error);
    return NextResponse.json(
      {
        status: 'unknown',
        checkedAt,
        error: getSafeErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
