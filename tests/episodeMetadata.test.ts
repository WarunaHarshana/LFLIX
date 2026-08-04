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
