import os from 'os';
import path from 'path';
import fs from 'fs';
import { getEnhancedTrackers, enrichMagnetUri } from './torrentTrackers';
import { getLocalIpAddress } from './network';

export interface TorrentStreamFile {
  index: number;
  name: string;
  path: string;
  length: number;
  isVideo: boolean;
  isSubtitle: boolean;
  mimeType: string;
  streamUrl: string;
  localStreamUrl: string;
  nextStreamUrl: string;
}

export interface TorrentStreamStats {
  infoHash: string;
  name: string;
  status: 'metadata' | 'ready' | 'streaming' | 'error';
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  numPeers: number;
  totalSize: number;
  downloaded: number;
  selectedFileIndex: number;
  files: TorrentStreamFile[];
  streamUrl: string;
  localStreamUrl: string;
  nextStreamUrl: string;
  errorMessage?: string;
  createdAt: number;
  lastActiveAt: number;
}

interface FileLike {
  name?: string;
  path?: string;
  length?: number;
  _startPiece?: number;
  _endPiece?: number;
  select?: (priority?: number) => void;
  deselect?: () => void;
}

interface TorrentLike {
  infoHash?: string;
  name?: string;
  length?: number;
  downloaded?: number;
  downloadSpeed?: number;
  uploadSpeed?: number;
  progress?: number;
  numPeers?: number;
  pieceLength?: number;
  files?: FileLike[];
  critical?: (start: number, end: number) => void;
  select?: (start: number, end: number, priority?: number) => void;
  deselect?: (start: number, end: number) => void;
  destroy?: (opts: { destroyStore?: boolean }, cb: () => void) => void;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  once?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
}

interface ClientLike {
  torrents?: TorrentLike[];
  add: (torrentId: string, opts?: Record<string, unknown>) => TorrentLike;
  createServer: (opts?: Record<string, unknown>) => ServerLike;
  destroy: (cb?: () => void) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
}

interface ServerLike {
  listen: (port: number, host: string, cb: () => void) => void;
  close: (cb?: () => void) => void;
  address: () => { port: number; address: string } | null;
  once: (event: string, cb: (err: unknown) => void) => void;
  removeListener: (event: string, cb: (err: unknown) => void) => void;
}

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  '.ts',
  '.m4v',
  '.wmv',
  '.flv',
]);

const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.sub', '.ass', '.ssa']);

function getMimeTypeByExt(ext: string): string {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.ts': 'video/mp2t',
    '.m4v': 'video/mp4',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.srt': 'text/plain',
    '.vtt': 'text/vtt',
  };
  return map[ext] || 'application/octet-stream';
}

function normalizeInfoHash(input: string): string {
  if (input.startsWith('magnet:')) {
    const match = input.match(/[?&]xt=urn:btih:([^&]+)/i);
    if (match) {
      return decodeURIComponent(match[1]).toLowerCase();
    }
  }
  return input.toLowerCase().replace(/^urn:btih:/, '').replace(/[^a-z0-9]/g, '');
}

export class TorrentStreamManager {
  private static instance: TorrentStreamManager | null = null;
  private client: ClientLike | null = null;
  private server: ServerLike | null = null;
  private serverPort: number | null = null;
  private serverStarting: Promise<number> | null = null;
  private activeStreams: Map<
    string,
    { torrent: TorrentLike; selectedIndex: number; createdAt: number; lastActiveAt: number }
  > = new Map();
  private cacheBaseDir: string;
  private readonly metadataTimeoutMs = 40 * 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.cacheBaseDir = path.join(os.tmpdir(), 'lflix-torrent-streams');
    try {
      if (!fs.existsSync(this.cacheBaseDir)) {
        fs.mkdirSync(this.cacheBaseDir, { recursive: true });
      }
    } catch {
      // fallback to cwd scratch if tmpdir lacks write permission
      this.cacheBaseDir = path.join(process.cwd(), 'scratch', 'torrent-streams');
      if (!fs.existsSync(this.cacheBaseDir)) {
        fs.mkdirSync(this.cacheBaseDir, { recursive: true });
      }
    }

    // Auto-purge orphaned torrent cache directories from previous runs on startup
    this.purgeStaleCacheOnStartup();

    // Auto-cleanup idle streams every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleStreams();
    }, 5 * 60 * 1000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  public static getInstance(): TorrentStreamManager {
    const globalForTorrentStream = globalThis as unknown as {
      __torrentStreamManager?: TorrentStreamManager;
    };
    if (globalForTorrentStream.__torrentStreamManager) {
      TorrentStreamManager.instance = globalForTorrentStream.__torrentStreamManager;
      return globalForTorrentStream.__torrentStreamManager;
    }
    if (!TorrentStreamManager.instance) {
      TorrentStreamManager.instance = new TorrentStreamManager();
      if (process.env.NODE_ENV !== 'production') {
        globalForTorrentStream.__torrentStreamManager = TorrentStreamManager.instance;
      }
    }
    return TorrentStreamManager.instance;
  }

  public async getClient(): Promise<ClientLike> {
    if (this.client) return this.client;
    const WebTorrent = (await import('webtorrent')).default;
    const clientInstance = new (WebTorrent as unknown as new (opts: Record<string, unknown>) => ClientLike)({
      maxConns: 80,
      dht: true,
      tracker: true,
    });

    clientInstance.on('error', (err: unknown) => {
      console.warn('[TorrentStreamer] Client warning:', err);
    });

    this.client = clientInstance;
    return this.client;
  }

  public async getServerPort(): Promise<number> {
    if (this.serverPort !== null) return this.serverPort;
    if (this.serverStarting) return this.serverStarting;

    this.serverStarting = (async () => {
      const client = await this.getClient();
      const existingServer = (client as unknown as { _server?: ServerLike })._server;

      if (existingServer) {
        this.server = existingServer;
        const addr = existingServer.address();
        if (addr && typeof addr === 'object' && addr.port) {
          this.serverPort = addr.port;
          return addr.port;
        }
      } else {
        this.server = client.createServer({
          origin: '*',
        });
      }

      if ((this.server as unknown as { listening?: boolean }).listening) {
        const addr = this.server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 42069;
        this.serverPort = port;
        return port;
      }

      return new Promise<number>((resolve, reject) => {
        const tryListen = (portToTry: number) => {
          const httpServer = (this.server as unknown as { server?: ServerLike }).server || this.server;

          const onError = (err: unknown) => {
            if (httpServer && typeof httpServer.removeListener === 'function') {
              httpServer.removeListener('error', onError);
            }
            const nodeErr = err as NodeJS.ErrnoException;
            if (portToTry !== 0 && (nodeErr?.code === 'EADDRINUSE' || nodeErr?.code === 'EACCES')) {
              console.log(`[TorrentStreamer] Port ${portToTry} in use, picking dynamic port...`);
              tryListen(0);
            } else {
              reject(err);
            }
          };

          if (httpServer && typeof httpServer.once === 'function') {
            httpServer.once('error', onError);
          }

          if (this.server) {
            this.server.listen(portToTry, '0.0.0.0', () => {
              if (httpServer && typeof httpServer.removeListener === 'function') {
                httpServer.removeListener('error', onError);
              }
              const addr = this.server?.address();
              const port = typeof addr === 'object' && addr ? addr.port : portToTry;
              this.serverPort = port;
              console.log(`[TorrentStreamer] HTTP streaming server listening on 0.0.0.0:${port}`);
              resolve(port);
            });
          }
        };

        tryListen(42069);
      });
    })();

    try {
      return await this.serverStarting;
    } finally {
      this.serverStarting = null;
    }
  }

  private prioritizeContainerHeaders(torrent: TorrentLike, file: FileLike) {
    if (!torrent || !file || typeof torrent.critical !== 'function') return;

    try {
      const startPiece = file._startPiece;
      const endPiece = file._endPiece;
      if (typeof startPiece !== 'number' || typeof endPiece !== 'number' || endPiece < startPiece) {
        return;
      }

      // 1. Fetch initial container headers (EBML/moov/codec params)
      const headerEnd = Math.min(startPiece + 2, endPiece);
      torrent.critical(startPiece, headerEnd);

      // 2. Fetch trailing container index (MP4 moov atom or MKV Cues frequently at the end of the file)
      const tailStart = Math.max(endPiece - 2, startPiece);
      torrent.critical(tailStart, endPiece);

      // 3. Mark the active file with elevated priority
      if (typeof file.select === 'function') {
        file.select(1);
      }
    } catch (err: unknown) {
      console.warn('[TorrentStreamer] Failed to prioritize container headers:', err);
    }
  }

  public setPlayhead(
    infoHash: string,
    fileIndex: number,
    currentTimeSeconds: number,
    durationSeconds: number
  ): boolean {
    const normalized = normalizeInfoHash(infoHash);
    const session = this.activeStreams.get(normalized);
    if (!session || !session.torrent) return false;

    session.lastActiveAt = Date.now();
    const torrent = session.torrent;
    const file = torrent.files?.[fileIndex];
    if (!file || typeof torrent.critical !== 'function') return false;

    try {
      if (durationSeconds <= 0 || currentTimeSeconds < 0) return false;
      const progressRatio = Math.min(Math.max(currentTimeSeconds / durationSeconds, 0), 1);
      const fileBytes = file.length || 0;
      const targetByteOffset = Math.floor(fileBytes * progressRatio);

      const pieceLength = torrent.pieceLength || 1;
      const pieceOffset = Math.floor(targetByteOffset / pieceLength);
      const startPiece = typeof file._startPiece === 'number' ? file._startPiece : 0;
      const endPiece = typeof file._endPiece === 'number' ? file._endPiece : startPiece;
      const targetPiece = Math.min(startPiece + pieceOffset, endPiece);
      const windowEnd = Math.min(targetPiece + 4, endPiece);

      torrent.critical(targetPiece, windowEnd);
      return true;
    } catch {
      return false;
    }
  }

  public async startStream(
    magnetUri: string,
    preferredFileIndex?: number
  ): Promise<TorrentStreamStats> {
    const rawInfoHash = normalizeInfoHash(magnetUri);
    if (!rawInfoHash) {
      throw new Error('Invalid magnet URI or torrent info hash');
    }

    const client = await this.getClient();
    const port = await this.getServerPort();

    // Limit active sessions to max 2 to prevent disk exhaustion
    if (this.activeStreams.size >= 2 && !this.activeStreams.has(rawInfoHash)) {
      let oldestHash: string | null = null;
      let oldestTime = Infinity;
      for (const [hash, s] of this.activeStreams) {
        if (s.lastActiveAt < oldestTime) {
          oldestTime = s.lastActiveAt;
          oldestHash = hash;
        }
      }
      if (oldestHash) {
        console.log(`[TorrentStreamer] Auto-pruning oldest stream session to conserve disk space: ${oldestHash}`);
        void this.stopStream(oldestHash, true);
      }
    }

    // Check if torrent is already active in our stream manager
    let session = this.activeStreams.get(rawInfoHash);
    let torrent: TorrentLike | null = null;

    if (session && session.torrent) {
      torrent = session.torrent;
      session.lastActiveAt = Date.now();
      if (typeof preferredFileIndex === 'number' && torrent.files?.[preferredFileIndex]) {
        session.selectedIndex = preferredFileIndex;
        this.prioritizeContainerHeaders(torrent, torrent.files[preferredFileIndex]);
      }
    } else {
      // Check if client already has this torrent
      const existing = client.torrents?.find(
        (t) => (t.infoHash && t.infoHash.toLowerCase() === rawInfoHash)
      );

      if (existing) {
        torrent = existing;
      } else {
        const enriched = enrichMagnetUri(magnetUri);
        const torrentDir = path.join(this.cacheBaseDir, rawInfoHash);
        if (!fs.existsSync(torrentDir)) {
          fs.mkdirSync(torrentDir, { recursive: true });
        }

        torrent = client.add(enriched, {
          path: torrentDir,
          announce: [...getEnhancedTrackers()],
          maxConns: 60,
        });
      }

      this.activeStreams.set(rawInfoHash, {
        torrent,
        selectedIndex: preferredFileIndex ?? -1,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    }

    // Wait for metadata if not ready yet
    if (!torrent.files || torrent.files.length === 0) {
      await new Promise<void>((resolve, reject) => {
        let timer: NodeJS.Timeout | null = null;

        const onMetadata = () => {
          if (timer) clearTimeout(timer);
          resolve();
        };

        const onError = (err: unknown) => {
          if (timer) clearTimeout(timer);
          reject(err);
        };

        timer = setTimeout(() => {
          if (torrent) {
            torrent.removeListener?.('metadata', onMetadata);
            torrent.removeListener?.('error', onError);
          }
          reject(new Error('Swarm metadata resolution timed out. Try again or pick a torrent with more active seeders.'));
        }, this.metadataTimeoutMs);

        if (torrent?.name && torrent.files && torrent.files.length > 0) {
          if (timer) clearTimeout(timer);
          return resolve();
        }

        torrent?.once?.('metadata', onMetadata);
        torrent?.once?.('error', onError);
      });
    }

    // Pick best video file
    session = this.activeStreams.get(rawInfoHash);
    const torrentFiles = torrent.files || [];
    const selectedIdx = this.pickBestFileIndex(torrentFiles, preferredFileIndex);
    if (session) {
      session.selectedIndex = selectedIdx;
      session.lastActiveAt = Date.now();
    }

    const selectedFile = torrentFiles[selectedIdx];
    if (selectedFile) {
      this.prioritizeContainerHeaders(torrent, selectedFile);
    }

    // Deselect non-active files so multi-file torrents (season packs/extras) don't fill the disk
    if (torrent.files) {
      torrent.files.forEach((f, idx) => {
        if (idx !== selectedIdx && typeof f.deselect === 'function') {
          f.deselect();
        }
      });
    }

    return this.buildStats(torrent, selectedIdx, port);
  }

  public getStreamStats(infoHash: string): TorrentStreamStats | null {
    const normalized = normalizeInfoHash(infoHash);
    const session = this.activeStreams.get(normalized);
    if (!session || !session.torrent || this.serverPort === null) return null;

    session.lastActiveAt = Date.now();
    return this.buildStats(session.torrent, session.selectedIndex, this.serverPort);
  }

  public listStreams(): TorrentStreamStats[] {
    const results: TorrentStreamStats[] = [];
    if (this.serverPort === null) return results;

    for (const [, session] of this.activeStreams) {
      if (session.torrent) {
        results.push(this.buildStats(session.torrent, session.selectedIndex, this.serverPort));
      }
    }
    return results;
  }

  public async stopStream(infoHash: string, cleanDisk = true): Promise<boolean> {
    const normalized = normalizeInfoHash(infoHash);
    const session = this.activeStreams.get(normalized);
    if (!session) return false;

    this.activeStreams.delete(normalized);

    const torrent = session.torrent;
    if (torrent && typeof torrent.destroy === 'function') {
      try {
        await new Promise<void>((resolve) => {
          torrent.destroy?.({ destroyStore: cleanDisk }, () => resolve());
        });
      } catch {
        // ignore destroy error
      }
    }

    if (cleanDisk) {
      const torrentDir = path.join(this.cacheBaseDir, normalized);
      try {
        if (fs.existsSync(torrentDir)) {
          fs.rmSync(torrentDir, { recursive: true, force: true });
        }
      } catch {
        // ignore deletion error
      }
    }

    return true;
  }

  private pickBestFileIndex(files: FileLike[], preferredIndex?: number): number {
    if (!Array.isArray(files) || files.length === 0) return 0;

    if (
      typeof preferredIndex === 'number' &&
      preferredIndex >= 0 &&
      preferredIndex < files.length
    ) {
      return preferredIndex;
    }

    // 1. Filter video files
    const videoFiles = files
      .map((f, idx) => ({ f, idx, ext: path.extname(f.name || f.path || '').toLowerCase() }))
      .filter((item) => VIDEO_EXTENSIONS.has(item.ext));

    if (videoFiles.length > 0) {
      // Pick the largest video file (usually the main movie or episode)
      videoFiles.sort((a, b) => (b.f.length || 0) - (a.f.length || 0));
      return videoFiles[0].idx;
    }

    // 2. Fallback: largest file overall
    let maxLen = -1;
    let maxIdx = 0;
    for (let i = 0; i < files.length; i++) {
      const len = files[i].length || 0;
      if (len > maxLen) {
        maxLen = len;
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  public getFile(infoHash: string, fileIndex: number): { file: FileLike; torrent: TorrentLike } | null {
    const normalized = normalizeInfoHash(infoHash);
    const session = this.activeStreams.get(normalized);
    if (!session || !session.torrent) return null;
    const files = session.torrent.files || [];
    const safeIdx = fileIndex >= 0 && fileIndex < files.length ? fileIndex : 0;
    const file = files[safeIdx];
    if (!file) return null;
    session.lastActiveAt = Date.now();
    return { file, torrent: session.torrent };
  }

  private buildStats(torrent: TorrentLike, selectedIndex: number, port: number): TorrentStreamStats {
    const rawHash = (torrent.infoHash || '').toLowerCase();
    const lanIp = getLocalIpAddress();

    const files: TorrentStreamFile[] = (torrent.files || []).map((f: FileLike, idx: number) => {
      const ext = path.extname(f.name || f.path || '').toLowerCase();
      const isVideo = VIDEO_EXTENSIONS.has(ext);
      const isSubtitle = SUBTITLE_EXTENSIONS.has(ext);
      const mimeType = getMimeTypeByExt(ext);
      const relPath = (f.path || f.name || `file_${idx}`).replace(/\\/g, '/');
      const encodedPath = encodeURI(relPath);
      const nextStreamUrl = `/api/torrent-stream/video?infoHash=${rawHash}&fileIndex=${idx}`;

      return {
        index: idx,
        name: f.name || `file_${idx}`,
        path: relPath,
        length: f.length || 0,
        isVideo,
        isSubtitle,
        mimeType,
        streamUrl: `http://${lanIp}:${port}/webtorrent/${rawHash}/${encodedPath}`,
        localStreamUrl: `http://127.0.0.1:${port}/webtorrent/${rawHash}/${encodedPath}`,
        nextStreamUrl,
      };
    });

    const safeIndex = selectedIndex >= 0 && selectedIndex < files.length ? selectedIndex : 0;
    const selectedFile = files[safeIndex];

    const streamUrl = selectedFile ? selectedFile.streamUrl : `http://${lanIp}:${port}/webtorrent/${rawHash}`;
    const localStreamUrl = selectedFile
      ? selectedFile.localStreamUrl
      : `http://127.0.0.1:${port}/webtorrent/${rawHash}`;
    const nextStreamUrl = selectedFile
      ? selectedFile.nextStreamUrl
      : `/api/torrent-stream/video?infoHash=${rawHash}&fileIndex=0`;

    const progress = typeof torrent.progress === 'number' ? torrent.progress : 0;
    const downloadSpeed = typeof torrent.downloadSpeed === 'number' ? torrent.downloadSpeed : 0;
    const uploadSpeed = typeof torrent.uploadSpeed === 'number' ? torrent.uploadSpeed : 0;
    const numPeers = typeof torrent.numPeers === 'number' ? torrent.numPeers : 0;
    const totalSize = typeof torrent.length === 'number' ? torrent.length : 0;
    const downloaded = typeof torrent.downloaded === 'number' ? torrent.downloaded : 0;

    return {
      infoHash: rawHash,
      name: torrent.name || rawHash,
      status: files.length > 0 ? 'ready' : 'metadata',
      downloadSpeed,
      uploadSpeed,
      progress,
      numPeers,
      totalSize,
      downloaded,
      selectedFileIndex: safeIndex,
      files,
      streamUrl,
      localStreamUrl,
      nextStreamUrl,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
  }

  private purgeStaleCacheOnStartup() {
    try {
      if (!fs.existsSync(this.cacheBaseDir)) return;
      const entries = fs.readdirSync(this.cacheBaseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(this.cacheBaseDir, entry.name);
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`[TorrentStreamer] Cleaned orphaned cache folder on startup: ${entry.name}`);
          } catch {
            // ignore if locked
          }
        }
      }
    } catch (err) {
      console.warn('[TorrentStreamer] Failed to purge stale cache on startup:', err);
    }
  }

  private cleanupIdleStreams() {
    const now = Date.now();
    const idleThresholdMs = 30 * 60 * 1000; // 30 minutes of zero read requests

    for (const [hash, session] of this.activeStreams) {
      if (now - session.lastActiveAt > idleThresholdMs) {
        console.log(`[TorrentStreamer] Auto-cleaning idle stream session: ${hash}`);
        void this.stopStream(hash, true);
      }
    }
  }

  public async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const hash of Array.from(this.activeStreams.keys())) {
      await this.stopStream(hash, true);
    }

    if (this.server) {
      try {
        await new Promise<void>((resolve) => {
          this.server?.close(() => resolve());
        });
      } catch {
        // ignore
      }
      this.server = null;
      this.serverPort = null;
      if (this.client) {
        (this.client as unknown as { _server?: unknown })._server = null;
      }
    }

    if (this.client) {
      try {
        await new Promise<void>((resolve) => {
          this.client?.destroy(() => resolve());
        });
      } catch {
        // ignore
      }
      this.client = null;
    }
  }
}

const globalForTorrentStream = globalThis as unknown as {
  __torrentStreamManager?: TorrentStreamManager;
};

export const torrentStreamManager =
  globalForTorrentStream.__torrentStreamManager || TorrentStreamManager.getInstance();

if (process.env.NODE_ENV !== 'production') {
  globalForTorrentStream.__torrentStreamManager = torrentStreamManager;
}
