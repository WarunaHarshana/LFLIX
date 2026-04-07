
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Support migration from old database locations
const oldRootDbPath = path.join(process.cwd(), 'localflix.db');
const oldRootDbPath2 = path.join(process.cwd(), 'lflix.db');
const newDbPath = path.join(dataDir, 'lflix.db');

// Migrate old database to new location if exists
if (fs.existsSync(oldRootDbPath) && !fs.existsSync(newDbPath)) {
  fs.renameSync(oldRootDbPath, newDbPath);
  console.log('Migrated database to data/lflix.db');
} else if (fs.existsSync(oldRootDbPath2) && !fs.existsSync(newDbPath)) {
  fs.renameSync(oldRootDbPath2, newDbPath);
  console.log('Migrated database to data/lflix.db');
}

const dbPath = fs.existsSync(newDbPath) ? newDbPath :
  fs.existsSync(oldRootDbPath) ? oldRootDbPath :
    fs.existsSync(oldRootDbPath2) ? oldRootDbPath2 : newDbPath;
const db = new Database(dbPath);

// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filePath TEXT UNIQUE NOT NULL,
    fileName TEXT NOT NULL,
    title TEXT,
    year INTEGER,
    tmdbId INTEGER,
    posterPath TEXT,
    backdropPath TEXT,
    overview TEXT,
    rating REAL,
    genres TEXT,
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT UNIQUE NOT NULL,
    tmdbId INTEGER,
    posterPath TEXT,
    backdropPath TEXT,
    overview TEXT,
    rating REAL,
    genres TEXT,
    firstAirDate TEXT,
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    showId INTEGER NOT NULL,
    filePath TEXT UNIQUE NOT NULL,
    fileName TEXT NOT NULL,
    seasonNumber INTEGER,
    episodeNumber INTEGER,
    title TEXT,
    overview TEXT,
    stillPath TEXT,
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(showId) REFERENCES shows(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contentType TEXT NOT NULL,
    contentId INTEGER NOT NULL,
    episodeId INTEGER,
    progress REAL DEFAULT 0,
    duration REAL DEFAULT 0,
    completed INTEGER DEFAULT 0,
    lastWatched DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contentType, contentId, episodeId)
  );

  CREATE TABLE IF NOT EXISTS scanned_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folderPath TEXT UNIQUE NOT NULL,
    folderName TEXT NOT NULL,
    contentType TEXT DEFAULT 'auto',
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('vlcPath', 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe');
  -- TMDB API key is now loaded from environment variable, not stored in DB

  -- IPTV Channels
  CREATE TABLE IF NOT EXISTS iptv_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    logo TEXT,
    category TEXT DEFAULT 'General',
    country TEXT,
    language TEXT,
    epgId TEXT,
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- IPTV Categories
  CREATE TABLE IF NOT EXISTS iptv_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    orderIndex INTEGER DEFAULT 0
  );

  -- Insert default categories
  INSERT OR IGNORE INTO iptv_categories (name, orderIndex) VALUES 
    ('General', 1),
    ('Sports', 2),
    ('News', 3),
    ('Entertainment', 4),
    ('Movies', 5),
    ('Kids', 6),
    ('Music', 7);

  -- Watchlist (TMDB items saved for later download)
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdbId INTEGER NOT NULL,
    mediaType TEXT NOT NULL,
    title TEXT NOT NULL,
    posterPath TEXT,
    backdropPath TEXT,
    overview TEXT,
    rating REAL,
    year TEXT,
    genres TEXT,
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE(tmdbId, mediaType)
  );

  -- Downloads (torrent downloads)
  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    magnetUri TEXT NOT NULL,
    infoHash TEXT,
    name TEXT,
    watchlistId INTEGER,
    status TEXT DEFAULT 'downloading',
    progress REAL DEFAULT 0,
    downloadSpeed REAL DEFAULT 0,
    totalSize INTEGER DEFAULT 0,
    downloadedSize INTEGER DEFAULT 0,
    downloadPath TEXT,
    errorMessage TEXT,
    startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    completedAt DATETIME,
    FOREIGN KEY(watchlistId) REFERENCES watchlist(id) ON DELETE SET NULL
  );

  -- Stream server quality observations (online providers)
  CREATE TABLE IF NOT EXISTS stream_server_quality_cache (
    serverId TEXT NOT NULL,
    tmdbId INTEGER NOT NULL,
    mediaType TEXT NOT NULL,
    seasonNumber INTEGER NOT NULL DEFAULT 0,
    episodeNumber INTEGER NOT NULL DEFAULT 0,
    maxQuality TEXT NOT NULL DEFAULT 'unknown',
    confidence REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'fast',
    checkedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (serverId, tmdbId, mediaType, seasonNumber, episodeNumber)
  );

  -- Auto-track: which shows to monitor for new episodes
  CREATE TABLE IF NOT EXISTS auto_track (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    showId INTEGER NOT NULL,
    tmdbId INTEGER NOT NULL,
    title TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    qualityPreference TEXT DEFAULT '1080p',
    lastCheckedAt DATETIME,
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(showId)
  );

  -- In-app notifications log
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    showId INTEGER,
    tmdbId INTEGER,
    seasonNumber INTEGER,
    episodeNumber INTEGER,
    posterPath TEXT,
    read INTEGER DEFAULT 0,
    actionUrl TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Episode release tracking cache
  CREATE TABLE IF NOT EXISTS episode_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdbId INTEGER NOT NULL,
    seasonNumber INTEGER NOT NULL,
    episodeNumber INTEGER NOT NULL,
    episodeTitle TEXT,
    airDate TEXT,
    notified INTEGER DEFAULT 0,
    downloadAttempted INTEGER DEFAULT 0,
    downloadId INTEGER,
    lastAttemptAt DATETIME,
    UNIQUE(tmdbId, seasonNumber, episodeNumber)
  );
`);

// Create indexes for frequently queried columns
db.exec(`
  -- Movies: looked up by tmdbId during scan/refresh, sorted by addedAt on content page
  CREATE INDEX IF NOT EXISTS idx_movies_tmdbId ON movies(tmdbId);
  CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);
  CREATE INDEX IF NOT EXISTS idx_movies_addedAt ON movies(addedAt DESC);

  -- Shows: looked up by tmdbId and title during scan, refresh, and dedup
  CREATE INDEX IF NOT EXISTS idx_shows_tmdbId ON shows(tmdbId);
  CREATE INDEX IF NOT EXISTS idx_shows_title ON shows(title);
  CREATE INDEX IF NOT EXISTS idx_shows_addedAt ON shows(addedAt DESC);

  -- Episodes: constantly joined/filtered by showId, checked by filePath during scan
  CREATE INDEX IF NOT EXISTS idx_episodes_showId ON episodes(showId);
  CREATE INDEX IF NOT EXISTS idx_episodes_filePath ON episodes(filePath);
  CREATE INDEX IF NOT EXISTS idx_episodes_season_episode ON episodes(showId, seasonNumber, episodeNumber);

  -- Watch History: queried by contentType+contentId on every detail modal, sorted by lastWatched for continue watching
  CREATE INDEX IF NOT EXISTS idx_watch_history_content ON watch_history(contentType, contentId);
  CREATE INDEX IF NOT EXISTS idx_watch_history_lastWatched ON watch_history(lastWatched DESC);

  -- Watchlist: checked by tmdbId+mediaType for duplicates
  CREATE INDEX IF NOT EXISTS idx_watchlist_tmdbId ON watchlist(tmdbId, mediaType);
  CREATE INDEX IF NOT EXISTS idx_watchlist_addedAt ON watchlist(addedAt DESC);

  -- IPTV Channels: filtered by category
  CREATE INDEX IF NOT EXISTS idx_iptv_channels_category ON iptv_channels(category);

  -- Downloads: filtered by status
  CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);

  -- Auto-track: lookup by showId and tmdbId
  CREATE INDEX IF NOT EXISTS idx_auto_track_showId ON auto_track(showId);
  CREATE INDEX IF NOT EXISTS idx_auto_track_tmdbId ON auto_track(tmdbId);

  -- Notifications: filtered by read status, sorted by creation
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  CREATE INDEX IF NOT EXISTS idx_notifications_createdAt ON notifications(createdAt DESC);

  -- Episode releases: lookup by tmdbId
  CREATE INDEX IF NOT EXISTS idx_episode_releases_tmdbId ON episode_releases(tmdbId);
`);

// Run migrations for existing databases (add columns if they don't exist)
// WHITELIST of valid tables and columns to prevent SQL injection
const VALID_TABLES = ['movies', 'shows', 'episodes', 'watch_history', 'scanned_folders', 'settings', 'watchlist', 'downloads', 'auto_track', 'notifications', 'episode_releases'];
const VALID_COLUMNS: Record<string, string[]> = {
  movies: ['genres', 'backdropPath', 'overview', 'rating', 'isHDR', 'resolution', 'videoCodec', 'audioCodec', 'audioChannels', 'bitrate', 'duration', 'fileSize'],
  shows: ['genres', 'backdropPath', 'overview', 'rating'],
  episodes: ['stillPath', 'overview', 'rating', 'isHDR', 'resolution', 'videoCodec', 'audioCodec', 'audioChannels', 'bitrate', 'duration', 'fileSize'],
  watch_history: ['completed'],
  scanned_folders: ['contentType'],
  settings: []
};

function addColumnIfNotExists(table: string, column: string, type: string) {
  // Validate table name
  if (!VALID_TABLES.includes(table)) {
    console.error(`Invalid table name: ${table}`);
    return;
  }

  // Validate column name
  if (!VALID_COLUMNS[table]?.includes(column)) {
    console.error(`Invalid column name: ${column} for table ${table}`);
    return;
  }

  const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const columnExists = tableInfo.some(col => col.name === column);
  if (!columnExists) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      console.log(`Added column ${column} to ${table}`);
    } catch (e) {
      // Column might already exist
    }
  }
}

// Add genres column to movies and shows if missing (for existing databases)
addColumnIfNotExists('movies', 'genres', 'TEXT');
addColumnIfNotExists('shows', 'genres', 'TEXT');
addColumnIfNotExists('episodes', 'rating', 'REAL');

// Add HDR detection column
addColumnIfNotExists('movies', 'isHDR', 'INTEGER DEFAULT 0');
addColumnIfNotExists('episodes', 'isHDR', 'INTEGER DEFAULT 0');

// Add media info columns (FFprobe)
const MEDIA_INFO_COLS: [string, string][] = [
  ['resolution', 'TEXT'],
  ['videoCodec', 'TEXT'],
  ['audioCodec', 'TEXT'],
  ['audioChannels', 'TEXT'],
  ['bitrate', 'REAL'],
  ['duration', 'REAL'],
  ['fileSize', 'INTEGER'],
];
for (const [col, type] of MEDIA_INFO_COLS) {
  addColumnIfNotExists('movies', col, type);
  addColumnIfNotExists('episodes', col, type);
}

// IPTV Helper Functions
export const iptvDb = {
  // Get all channels
  getChannels: (category?: string) => {
    if (category && category !== 'all') {
      return db.prepare('SELECT * FROM iptv_channels WHERE category = ? ORDER BY name').all(category);
    }
    return db.prepare('SELECT * FROM iptv_channels ORDER BY category, name').all();
  },

  // Get channel by ID
  getChannel: (id: number) => {
    return db.prepare('SELECT * FROM iptv_channels WHERE id = ?').get(id);
  },

  // Add channel
  addChannel: (channel: { name: string; url: string; logo?: string; category?: string; country?: string; language?: string }) => {
    const stmt = db.prepare(`
      INSERT INTO iptv_channels (name, url, logo, category, country, language)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(channel.name, channel.url, channel.logo || null, channel.category || 'General', channel.country || null, channel.language || null);
  },

  // Delete channel
  deleteChannel: (id: number) => {
    return db.prepare('DELETE FROM iptv_channels WHERE id = ?').run(id);
  },

  // Clear all channels
  clearAllChannels: () => {
    return db.prepare('DELETE FROM iptv_channels').run();
  },

  // Get categories
  getCategories: () => {
    return db.prepare('SELECT * FROM iptv_categories ORDER BY orderIndex').all();
  },

  // Add category
  addCategory: (name: string) => {
    const maxOrder = db.prepare('SELECT MAX(orderIndex) as maxOrder FROM iptv_categories').get() as { maxOrder: number };
    return db.prepare('INSERT INTO iptv_categories (name, orderIndex) VALUES (?, ?)').run(name, (maxOrder?.maxOrder || 0) + 1);
  },

  // Import M3U playlist
  importM3U: (content: string) => {
    const channels: { name: string; url: string; logo?: string; category?: string }[] = [];
    const lines = content.split('\n');
    let currentChannel: Partial<{ name: string; url: string; logo: string; category: string }> = {};

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('#EXTINF:')) {
        // Parse EXTINF line
        const logoMatch = trimmed.match(/tvg-logo="([^"]+)"/);
        const nameMatch = trimmed.match(/,(.+)$/);
        const groupMatch = trimmed.match(/group-title="([^"]+)"/);

        currentChannel = {
          logo: logoMatch?.[1],
          category: groupMatch?.[1] || 'General',
          name: nameMatch?.[1]?.trim() || 'Unknown'
        };
      } else if (trimmed.startsWith('http') && currentChannel.name) {
        currentChannel.url = trimmed;
        channels.push(currentChannel as { name: string; url: string; logo?: string; category?: string });
        currentChannel = {};
      }
    }

    // Insert channels
    const insert = db.prepare(`
      INSERT OR IGNORE INTO iptv_channels (name, url, logo, category)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = db.transaction((channels: any[]) => {
      for (const ch of channels) {
        insert.run(ch.name, ch.url, ch.logo || null, ch.category || 'General');
      }
    });

    insertMany(channels);
    return channels.length;
  }
};

export type StreamQualityValue = '2160p' | '1080p' | '720p' | 'unknown';

type StreamQualityObservation = {
  serverId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  seasonNumber?: number;
  episodeNumber?: number;
  maxQuality: StreamQualityValue;
  confidence: number;
  source?: 'fast' | 'deep' | 'cached';
};

type StreamQualityRow = {
  serverId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  seasonNumber: number;
  episodeNumber: number;
  maxQuality: StreamQualityValue;
  confidence: number;
  source: 'fast' | 'deep' | 'cached';
  checkedAt: string;
  updatedAt: string;
};

export const streamQualityDb = {
  getObservation: (params: {
    serverId: string;
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    seasonNumber?: number;
    episodeNumber?: number;
  }) => {
    const row = db
      .prepare(
        `
          SELECT *
          FROM stream_server_quality_cache
          WHERE serverId = ?
            AND tmdbId = ?
            AND mediaType = ?
            AND seasonNumber = ?
            AND episodeNumber = ?
          LIMIT 1
        `
      )
      .get(
        params.serverId,
        params.tmdbId,
        params.mediaType,
        params.seasonNumber ?? 0,
        params.episodeNumber ?? 0
      ) as StreamQualityRow | undefined;

    return row || null;
  },

  upsertObservation: (observation: StreamQualityObservation) => {
    const stmt = db.prepare(`
      INSERT INTO stream_server_quality_cache (
        serverId,
        tmdbId,
        mediaType,
        seasonNumber,
        episodeNumber,
        maxQuality,
        confidence,
        source,
        checkedAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(serverId, tmdbId, mediaType, seasonNumber, episodeNumber)
      DO UPDATE SET
        maxQuality = excluded.maxQuality,
        confidence = excluded.confidence,
        source = excluded.source,
        checkedAt = CURRENT_TIMESTAMP,
        updatedAt = CURRENT_TIMESTAMP
    `);

    return stmt.run(
      observation.serverId,
      observation.tmdbId,
      observation.mediaType,
      observation.seasonNumber ?? 0,
      observation.episodeNumber ?? 0,
      observation.maxQuality,
      observation.confidence,
      observation.source || 'fast'
    );
  },
};

export default db;

