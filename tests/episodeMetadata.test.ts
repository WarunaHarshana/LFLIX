import { describe, expect, it } from 'vitest';
import { isPlaceholderEpisodeTitle, MIN_EPISODE_VOTES } from '@/lib/metadata';

describe('isPlaceholderEpisodeTitle', () => {
  it("matches TMDB's own placeholder", () => {
    // The bug this exists for: an episode scanned on air night stored TMDB's
    // "Episode 6", which the old refresh filter (`title LIKE 'S% E%'`) missed,
    // so the real title never replaced it.
    for (const title of ['Episode 6', 'Episode 12', 'episode 7', 'EPISODE 1']) {
      expect(isPlaceholderEpisodeTitle(title), title).toBe(true);
    }
  });

  it('matches our own scan fallback', () => {
    for (const title of ['S3 E6', 's1 e1', 'S10E24', 'S2 E10']) {
      expect(isPlaceholderEpisodeTitle(title), title).toBe(true);
    }
  });

  it('treats missing titles as placeholders', () => {
    expect(isPlaceholderEpisodeTitle(null)).toBe(true);
    expect(isPlaceholderEpisodeTitle(undefined)).toBe(true);
    expect(isPlaceholderEpisodeTitle('')).toBe(true);
    expect(isPlaceholderEpisodeTitle('   ')).toBe(true);
  });

  it('leaves real titles alone', () => {
    for (const title of [
      'Faceless Men',
      'The Dragon in Winter',
      'Unbowed and Unbent',
      'Salt and Sea, Fire and Blood',
    ]) {
      expect(isPlaceholderEpisodeTitle(title), title).toBe(false);
    }
  });

  it('does not mistake a real title that merely mentions an episode', () => {
    // Guard against a looser regex: these are genuine titles, not placeholders.
    expect(isPlaceholderEpisodeTitle('Episode 6: The Reckoning')).toBe(false);
    expect(isPlaceholderEpisodeTitle('The Last Episode')).toBe(false);
    expect(isPlaceholderEpisodeTitle('Episodes')).toBe(false);
  });
});

describe('MIN_EPISODE_VOTES', () => {
  it('is high enough to reject a handful of early votes', () => {
    // Real case: House of the Dragon S3E7 showed 2.8 off 4 votes, and settled
    // at 5.6 once 21 people had voted.
    expect(MIN_EPISODE_VOTES).toBeGreaterThan(4);
  });
});

describe('rating source preference', () => {
  // Mirrors episodeScore() in EpisodeModal: IMDb wins where it exists, TMDB is
  // the fallback and only once enough people have voted.
  function episodeScore(imdb?: number | null, tmdb?: number | null, votes?: number | null) {
    if (imdb != null && imdb > 0) return { value: imdb, source: 'IMDb' as const };
    if (tmdb == null || tmdb <= 0) return null;
    if (votes != null && votes < MIN_EPISODE_VOTES) return null;
    return { value: tmdb, source: 'TMDB' as const };
  }

  it('prefers IMDb when both exist', () => {
    expect(episodeScore(9.2, 7.6, 98)).toEqual({ value: 9.2, source: 'IMDb' });
  });

  it('shows IMDb even when TMDB is too thinly voted', () => {
    // IMDb ratings do not carry a vote count here, and IMDb only publishes one
    // after enough activity, so it is trustworthy on its own.
    expect(episodeScore(8.4, 2.8, 4)).toEqual({ value: 8.4, source: 'IMDb' });
  });

  it('falls back to a well-voted TMDB score', () => {
    expect(episodeScore(null, 6.5, 36)).toEqual({ value: 6.5, source: 'TMDB' });
  });

  it('hides a thinly-voted TMDB score when IMDb has nothing', () => {
    expect(episodeScore(null, 2.8, 4)).toBeNull();
  });

  it('shows legacy rows that predate vote tracking', () => {
    expect(episodeScore(null, 7.4, null)).toEqual({ value: 7.4, source: 'TMDB' });
  });

  it('returns nothing when neither source has a rating', () => {
    expect(episodeScore(null, null, null)).toBeNull();
    expect(episodeScore(0, 0, 50)).toBeNull();
  });
});
