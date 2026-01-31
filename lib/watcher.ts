import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import db from './db';

// Video file extensions to watch
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm', '.ts'];

// Event emitter for SSE clients
type WatcherEventCallback = (event: WatcherEvent) => void;

export type WatcherEvent = {
    type: 'new_file' | 'scan_complete' | 'error';
    filePath?: string;
    added?: number;
    message?: string;
};

class FolderWatcher {
    private watcher: FSWatcher | null = null;
    private pendingFiles: Set<string> = new Set();
    private debounceTimer: NodeJS.Timeout | null = null;
    private listeners: Set<WatcherEventCallback> = new Set();
    private isScanning: boolean = false;

    // Subscribe to watcher events
    subscribe(callback: WatcherEventCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    // Emit event to all listeners
    private emit(event: WatcherEvent) {
        this.listeners.forEach(callback => {
            try {
                callback(event);
            } catch (e) {
                console.error('Watcher listener error:', e);
            }
        });
    }

    // Check if file is a video
    private isVideoFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return VIDEO_EXTENSIONS.includes(ext);
    }

    // Check if file is already in database
    private isAlreadyIndexed(filePath: string): boolean {
        const movie = db.prepare('SELECT id FROM movies WHERE filePath = ?').get(filePath);
        const episode = db.prepare('SELECT id FROM episodes WHERE filePath = ?').get(filePath);
        return !!(movie || episode);
    }

    // Scan pending files - now scans individual files efficiently
    private async scanPendingFiles() {
        if (this.isScanning || this.pendingFiles.size === 0) return;

        this.isScanning = true;
        const filesToScan = Array.from(this.pendingFiles);
        this.pendingFiles.clear();

        let addedCount = 0;

        for (const filePath of filesToScan) {
            // Skip if already indexed
            if (this.isAlreadyIndexed(filePath)) continue;

            // Find which folder this file belongs to
            const folders = db.prepare('SELECT folderPath FROM scanned_folders').all() as { folderPath: string }[];
            const folder = folders.find(f => filePath.startsWith(f.folderPath));

            if (folder) {
                try {
                    // Use absolute URL for server-side fetch
                    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                    const response = await fetch(`${baseUrl}/api/scan`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-app-pin': process.env.APP_PIN || '1234'
                        },
                        body: JSON.stringify({ 
                            folderPath: path.dirname(filePath),
                            specificFile: filePath
                        })
                    });
                    const data = await response.json();
                    addedCount += data.added || 0;
                } catch (e) {
                    console.error('Scan error for', filePath, e);
                }
            }
        }

        if (addedCount > 0) {
            this.emit({ type: 'scan_complete', added: addedCount });
        }

        this.isScanning = false;

        // Check if more files were added while scanning
        if (this.pendingFiles.size > 0) {
            this.scheduleScan();
        }
    }

    // Schedule a debounced scan
    private scheduleScan() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        // Wait 3 seconds for file copy/download to complete
        this.debounceTimer = setTimeout(() => {
            this.scanPendingFiles();
        }, 3000);
    }

    // Start watching all folders
    async start() {
        // Stop existing watcher
        await this.stop();

        // Get all folders to watch
        const folders = db.prepare('SELECT folderPath FROM scanned_folders').all() as { folderPath: string }[];

        if (folders.length === 0) {
            console.log('No folders to watch');
            return;
        }

        const paths = folders.map(f => f.folderPath);
        console.log('Starting folder watcher for:', paths);

        this.watcher = chokidar.watch(paths, {
            persistent: true,
            ignoreInitial: true, // Don't trigger events for existing files
            depth: 10, // Watch subdirectories
            awaitWriteFinish: {
                stabilityThreshold: 2000, // Wait for file to be stable for 2s
                pollInterval: 100
            },
            ignored: [
                /(^|[\/\\])\../, // Ignore dotfiles
                /\$RECYCLE\.BIN/,
                /System Volume Information/
            ]
        });

        this.watcher.on('add', (filePath) => {
            if (this.isVideoFile(filePath)) {
                console.log('New video detected:', filePath);
                this.pendingFiles.add(filePath);
                this.emit({ type: 'new_file', filePath });
                this.scheduleScan();
            }
        });

        this.watcher.on('error', (error: unknown) => {
            console.error('Watcher error:', error);
            const message = error instanceof Error ? error.message : String(error);
            this.emit({ type: 'error', message });
        });
    }

    // Stop watching
    async stop() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        this.pendingFiles.clear();
    }

    // Check if currently watching
    isWatching(): boolean {
        return this.watcher !== null;
    }

    // Get watched paths
    getWatchedPaths(): string[] {
        if (!this.watcher) return [];
        const watched = this.watcher.getWatched();
        return Object.keys(watched);
    }
}

// Singleton instance
export const folderWatcher = new FolderWatcher();
