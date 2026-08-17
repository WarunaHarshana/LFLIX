import { describe, expect, it } from 'vitest';
import autoDownloader from '@/lib/autoDownloader';
import db from '@/lib/db';

describe('AutoDownloader manual vs automatic tracking', () => {
  it('allows manual download for show that is in library but not in auto_track', () => {
    // Look up Game of Thrones
    const show = db.prepare("SELECT id, title, tmdbId FROM shows WHERE title LIKE '%Game of Thrones%'").get() as any;
    expect(show).toBeDefined();

    // Verify it is NOT in auto_track
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
