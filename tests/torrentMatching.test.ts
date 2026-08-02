import { describe, expect, it } from 'vitest';
import {
  extractCleanTitle,
  extractEpisodeQuery,
  getSignificantWords,
  isCamQualityResult,
  isGoodMovieReleaseQuality,
  isTvShowTitle,
  matchesMovieTitleStrictly,
  parseSizeToBytes,
  relevanceScore,
  titleMatchesEpisode,
} from '@/lib/torrentSearch';

describe('parseSizeToBytes', () => {
  it('parses each unit', () => {
    expect(parseSizeToBytes('1 GiB')).toBe(1024 ** 3);
    expect(parseSizeToBytes('1 MiB')).toBe(1024 ** 2);
    expect(parseSizeToBytes('1 KiB')).toBe(1024);
  });

  it('parses fractional sizes', () => {
    expect(parseSizeToBytes('2.5 GiB')).toBeCloseTo(2.5 * 1024 ** 3, 0);
  });

  it('returns 0 for unparseable input', () => {
    expect(parseSizeToBytes('')).toBe(0);
    expect(parseSizeToBytes('unknown')).toBe(0);
  });
});

describe('isCamQualityResult', () => {
  it.each(['Movie 2024 CAM', 'Movie.2024.HDCAM.x264', 'Movie TS 2024', 'Movie.2024.TELESYNC'])(
    'flags %s as cam',
    (title) => expect(isCamQualityResult({ title, quality: '' })).toBe(true)
  );

  it('does not flag legitimate web/bluray releases', () => {
    expect(isCamQualityResult({ title: 'Movie.2024.1080p.WEB-DL.x264', quality: '1080p' })).toBe(false);
    expect(isCamQualityResult({ title: 'Movie.2024.2160p.BluRay', quality: '2160p' })).toBe(false);
  });
});

describe('isTvShowTitle', () => {
  it('recognises season/episode markers', () => {
    expect(isTvShowTitle('Breaking Bad S01E05 1080p')).toBe(true);
    expect(isTvShowTitle('Show 1x05')).toBe(true);
    expect(isTvShowTitle('Show Season 2 Complete')).toBe(true);
  });

  it('does not flag a plain movie release', () => {
    expect(isTvShowTitle('Inception 2010 1080p BluRay x264')).toBe(false);
  });
});

describe('extractEpisodeQuery', () => {
  it('extracts season and episode from a query', () => {
    expect(extractEpisodeQuery('Vikings S01E01')).toEqual({ season: 1, episode: 1 });
    expect(extractEpisodeQuery('Vikings 2x10')).toEqual({ season: 2, episode: 10 });
  });

  it('returns null when the query names no episode', () => {
    expect(extractEpisodeQuery('Vikings')).toBeNull();
    expect(extractEpisodeQuery('Inception 2010')).toBeNull();
  });
});

describe('titleMatchesEpisode', () => {
  const target = { season: 1, episode: 5 };

  it('matches the requested episode across notations', () => {
    expect(titleMatchesEpisode('Show.S01E05.1080p.mkv', target)).toBe(true);
    expect(titleMatchesEpisode('Show 1x05 1080p', target)).toBe(true);
  });

  it('rejects a different episode', () => {
    expect(titleMatchesEpisode('Show.S01E06.1080p.mkv', target)).toBe(false);
  });

  it('rejects the same episode number in a different season', () => {
    expect(titleMatchesEpisode('Show.S02E05.1080p.mkv', target)).toBe(false);
  });
});

describe('matchesMovieTitleStrictly', () => {
  it('accepts the same film in common release formats', () => {
    expect(matchesMovieTitleStrictly('Inception 2010 1080p BluRay x264', 'Inception')).toBe(true);
    expect(matchesMovieTitleStrictly('Inception.2010.2160p.UHD.BluRay', 'Inception')).toBe(true);
  });

  it('rejects a different film that merely shares a word', () => {
    expect(matchesMovieTitleStrictly('The Dark Knight Rises 2012 1080p', 'The Dark Knight')).toBe(false);
  });

  it('is case-insensitive and separator-insensitive', () => {
    expect(matchesMovieTitleStrictly('THE.MATRIX.1999.1080p', 'the matrix')).toBe(true);
  });
});

describe('relevanceScore', () => {
  // The score measures how much of the *query* the title covers. It is
  // deliberately blind to extra words in the title — narrowing that down is
  // matchesMovieTitleStrictly's job, not this function's.
  it('scores 0 for a title sharing none of the query', () => {
    expect(relevanceScore('Completely Different Film 2020', 'Inception')).toBe(0);
  });

  it('scores 0 for an empty query', () => {
    expect(relevanceScore('Inception 2010', '')).toBe(0);
  });

  it('scores 0 when under half the query words match', () => {
    expect(relevanceScore('Rings 2001 1080p', 'The Lord of the Rings Fellowship')).toBe(0);
  });

  it('rewards a full match over a partial one', () => {
    const full = relevanceScore('The Dark Knight 2008 1080p', 'The Dark Knight');
    const partial = relevanceScore('The Dark Tower 2017 1080p', 'The Dark Knight');
    expect(full).toBeGreaterThan(partial);
  });

  it('prefers a whole-word hit over a substring hit', () => {
    const wholeWord = relevanceScore('Dune 2021 1080p', 'Dune');
    const substring = relevanceScore('Dunes 2021 1080p', 'Dune');
    expect(wholeWord).toBeGreaterThan(substring);
  });

  it('penalises very long pack-style titles', () => {
    const normal = relevanceScore('Inception 2010 1080p', 'Inception');
    const spammy = relevanceScore(`Inception ${'x'.repeat(130)}`, 'Inception');
    expect(spammy).toBeLessThan(normal);
  });

  it('never leaves the 0..100 range', () => {
    for (const title of ['Inception', 'x'.repeat(300), '']) {
      const score = relevanceScore(title, 'Inception');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('getSignificantWords', () => {
  it('drops short filler words', () => {
    const words = getSignificantWords('The Lord of the Rings');
    expect(words).not.toContain('of');
    expect(words.join(' ')).toMatch(/lord/i);
  });

  it('returns an empty list for empty input', () => {
    expect(getSignificantWords('')).toEqual([]);
  });
});

describe('extractCleanTitle', () => {
  it('strips release metadata down to the title', () => {
    const cleaned = extractCleanTitle('Inception.2010.1080p.BluRay.x264-GROUP', 'Inception');
    expect(cleaned.toLowerCase()).toContain('inception');
    expect(cleaned).not.toMatch(/1080p|x264|GROUP/);
  });
});

describe('isGoodMovieReleaseQuality', () => {
  it('accepts a standard web/bluray encode', () => {
    expect(
      isGoodMovieReleaseQuality({ title: 'Movie.2024.1080p.BluRay.x264', quality: '1080p', source: 'YTS' })
    ).toBe(true);
  });

  it('rejects cam-sourced releases', () => {
    expect(
      isGoodMovieReleaseQuality({ title: 'Movie.2024.HDCAM.x264', quality: '', source: 'TPB' })
    ).toBe(false);
  });
});
