
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
`);

// Run migrations for existing databases (add columns if they don't exist)
// WHITELIST of valid tables and columns to prevent SQL injection
const VALID_TABLES = ['movies', 'shows', 'episodes', 'watch_history', 'scanned_folders', 'settings'];
const VALID_COLUMNS: Record<string, string[]> = {
  movies: ['genres', 'backdropPath', 'overview', 'rating'],
  shows: ['genres', 'backdropPath', 'overview', 'rating'],
  episodes: ['stillPath', 'overview'],
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

export default db;

