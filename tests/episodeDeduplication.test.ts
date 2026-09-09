import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import db, { deduplicateEpisodes, deduplicateMovies } from '@/lib/db';

describe('Episode and Movie Deduplication', () => {
  let testShowId: number;

  beforeEach(() => {
    // Insert a test show
    const res = db.prepare(`
      INSERT INTO shows (title, tmdbId) VALUES ('Deduplication Test Show ' || hex(randomblob(4)), 999999)
    `).run();
    testShowId = Number(res.lastInsertRowid);
  });

  afterEach(() => {
    // Clean up test show and related records
    if (testShowId) {
      const eps = db.prepare('SELECT id FROM episodes WHERE showId = ?').all(testShowId) as { id: number }[];
      for (const ep of eps) {
        db.prepare('DELETE FROM watch_history WHERE episodeId = ?').run(ep.id);
      }
      db.prepare('DELETE FROM episodes WHERE showId = ?').run(testShowId);
      db.prepare('DELETE FROM shows WHERE id = ?').run(testShowId);
    }
  });

  it('prevents inserting duplicate episodes for the same show, season, and episode number', () => {
    db.prepare(`
      INSERT INTO episodes (showId, filePath, fileName, seasonNumber, episodeNumber, title)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testShowId, 'C:\\Media\\Show\\Season 1\\ep1.mkv', 'ep1.mkv', 1, 1, 'Episode 1');

    // Attempting to insert another record with the same showId, seasonNumber, episodeNumber should fail the unique constraint
    expect(() => {
      db.prepare(`
        INSERT INTO episodes (showId, filePath, fileName, seasonNumber, episodeNumber, title)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(testShowId, 'C:\\Media\\Show\\Season 1\\ep1_alternate.mkv', 'ep1_alternate.mkv', 1, 1, 'Episode 1 Duplicate');
    }).toThrow(/UNIQUE constraint failed/i);
  });

  it('prevents inserting duplicate episodes with different filePath casing', () => {
    db.prepare(`
      INSERT INTO episodes (showId, filePath, fileName, seasonNumber, episodeNumber, title)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testShowId, 'C:\\media\\show\\season 1\\ep2.mkv', 'ep2.mkv', 1, 2, 'Episode 2');

    // Attempting to insert the same file with different casing should fail case-insensitive index
    expect(() => {
      db.prepare(`
        INSERT INTO episodes (showId, filePath, fileName, seasonNumber, episodeNumber, title)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(testShowId, 'C:\\Media\\Show\\Season 1\\ep2.mkv', 'ep2.mkv', 1, 3, 'Episode 2 Cased');
    }).toThrow(/UNIQUE constraint failed/i);
  });

  it('deduplicateEpisodes cleans up duplicate records and preserves watch history', () => {
    // Temporarily disable the unique index to simulate an older database state before migration
    db.exec('DROP INDEX IF EXISTS idx_episodes_show_season_ep');
    db.exec('DROP INDEX IF EXISTS idx_episodes_filePath_nocase');

    // Insert original episode (ID 1 for this test)
    const ep1Res = db.prepare(`
      INSERT INTO episodes (showId, filePath, fileName, seasonNumber, episodeNumber, title, stillPath)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(testShowId, 'E:\\Movies\\TV Shows\\TestShow\\Season 1\\S01E04.mkv', 'S01E04.mkv', 1, 4, 'Ep 4 Old', '/still1.jpg');
    const ep1Id = Number(ep1Res.lastInsertRowid);

    // Add watch history to ep1
    db.prepare(`
      INSERT INTO watch_history (contentType, contentId, episodeId, progress, duration, completed)
      VALUES ('show', ?, ?, 0.85, 3600, 0)
    `).run(testShowId, ep1Id);

    // Insert duplicate episode created with different folder casing
    const ep2Res = db.prepare(`
      INSERT INTO episodes (showId, filePath, fileName, seasonNumber, episodeNumber, title, stillPath)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(testShowId, 'E:\\Movies\\TV Shows\\testshow\\Season 1\\S01E04.mkv', 'S01E04.mkv', 1, 4, 'Ep 4 New', '/still2.jpg');
    const ep2Id = Number(ep2Res.lastInsertRowid);

    // Before deduplication: 2 episodes exist for season 1 episode 4
    const beforeCount = db.prepare(`
      SELECT count(*) as count FROM episodes WHERE showId = ? AND seasonNumber = 1 AND episodeNumber = 4
    `).get(testShowId) as { count: number };
    expect(beforeCount.count).toBe(2);

    // Run deduplication
    const result = deduplicateEpisodes();
    expect(result.removedCount).toBeGreaterThanOrEqual(1);

    // Re-create the unique indexes
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_show_season_ep ON episodes(showId, seasonNumber, episodeNumber);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_filePath_nocase ON episodes(filePath COLLATE NOCASE);
    `);

    // After deduplication: exactly 1 episode remains
    const remaining = db.prepare(`
      SELECT id, filePath, stillPath FROM episodes WHERE showId = ? AND seasonNumber = 1 AND episodeNumber = 4
    `).all(testShowId) as { id: number; filePath: string; stillPath: string }[];
    expect(remaining).toHaveLength(1);

    // Watch history must point to the remaining episode
    const history = db.prepare(`
      SELECT * FROM watch_history WHERE episodeId = ?
    `).get(remaining[0].id) as { progress: number; completed: number } | undefined;
    expect(history).toBeDefined();
    expect(history?.progress).toBeCloseTo(0.85);
  });
});
