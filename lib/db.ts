
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'localflix.db');
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

export default db;

