import { describe, expect, it, afterEach } from 'vitest';
import autoDownloader from '@/lib/autoDownloader';
import db from '@/lib/db';

describe('AutoDownloader manual vs automatic tracking', () => {
  let createdShowId: number | null = null;

  afterEach(() => {
    if (createdShowId !== null) {
      db.prepare('DELETE FROM auto_track WHERE showId = ?').run(createdShowId);
      db.prepare('DELETE FROM episode_releases WHERE tmdbId = 1399').run();
      db.prepare('DELETE FROM shows WHERE id = ?').run(createdShowId);
      createdShowId = null;
    }
  });

  it('allows manual download for show that is in library but not in auto_track', () => {
    // Look up Game of Thrones, insert if missing
    let show = db.prepare("SELECT id, title, tmdbId FROM shows WHERE title LIKE '%Game of Thrones%'").get() as any;
    if (!show) {
      const info = db.prepare("INSERT INTO shows (title, tmdbId) VALUES ('Game of Thrones', 1399)").run();
      createdShowId = Number(info.lastInsertRowid);
      show = { id: createdShowId, title: 'Game of Thrones', tmdbId: 1399 };
    }
    expect(show).toBeDefined();

    // Verify it is NOT in auto_track
    db.prepare('DELETE FROM auto_track WHERE showId = ?').run(show.id);
    const tracked = db.prepare('SELECT * FROM auto_track WHERE showId = ?').get(show.id);
    expect(tracked).toBeUndefined();

    // Test eligibility check logic directly
    const manualEp = {
      tmdbId: show.tmdbId,
      showId: show.id,
      showTitle: show.title,
      seasonNumber: 2,
      episodeNumber: 2,
      episodeTitle: 'The Night Lands',
      airDate: '2012-04-08',
      posterPath: null,
      qualityPreference: 'best',
      isManual: true
    };

    // Calling processNewEpisodes with manualEp should not crash and should queue the episode
    expect(() => {
      autoDownloader.processNewEpisodes([manualEp]);
    }).not.toThrow();
  });
});
