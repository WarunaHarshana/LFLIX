import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

type FileItem = {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
};

// Get available drives on Windows
function getWindowsDrives(): string[] {
    const drives: string[] = [];
    // Check common drive letters
    for (let i = 65; i <= 90; i++) { // A-Z
        const drive = String.fromCharCode(i) + ':\\';
        try {
            if (fs.existsSync(drive)) {
                drives.push(drive);
            }
        } catch {
            // Drive not accessible
        }
    }
    return drives;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        let dirPath = searchParams.get('path') || '';

        // If no path provided, return root drives (Windows) or home directory
        if (!dirPath) {
            if (os.platform() === 'win32') {
                const drives = getWindowsDrives();
                return NextResponse.json({
                    currentPath: '',
                    parentPath: null,
                    items: drives.map(drive => ({
                        name: drive,
                        path: drive,
                        isDirectory: true
                    }))
                });
            } else {
                dirPath = os.homedir();
            }
        }

        // Normalize path
        dirPath = path.normalize(dirPath);

        // Check if path exists
        if (!fs.existsSync(dirPath)) {
            return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
        }

        // Check if it's a directory
        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
            return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
        }

        // Read directory contents
        const files = fs.readdirSync(dirPath);
        const items: FileItem[] = [];

        for (const file of files) {
            // Skip hidden files and system files
            if (file.startsWith('.') || file.startsWith('$')) continue;

            const fullPath = path.join(dirPath, file);
            try {
                const fileStat = fs.statSync(fullPath);
                items.push({
                    name: file,
                    path: fullPath,
                    isDirectory: fileStat.isDirectory(),
                    size: fileStat.isFile() ? fileStat.size : undefined
                });
            } catch {
                // Skip files we can't access
            }
        }

        // Sort: directories first, then alphabetically
        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        // Calculate parent path
        const parentPath = path.dirname(dirPath);
        // Check if at root: on Windows, drive roots like C:\ have dirname equal to themselves
        // or match the pattern X:\ where X is a letter
        const isDriveRoot = os.platform() === 'win32' && /^[A-Z]:\\?$/i.test(dirPath);
        const isRoot = parentPath === dirPath || isDriveRoot;

        return NextResponse.json({
            currentPath: dirPath,
            // Return empty string for root to show drive list, otherwise return parent
            parentPath: isRoot ? '' : parentPath,
            items
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
