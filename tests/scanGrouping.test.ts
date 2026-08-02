import { describe, expect, it, vi } from 'vitest';

// lib/scanner opens the database and reaches TMDB on import; stub both so the
// pure grouping logic can be tested on its own.
vi.mock('@/lib/db', () => ({ default: { prepare: () => ({ get: () => undefined, run: () => ({}), all: () => [] }) }, cleanupOrphanedAutoTracks: () => {} }));
vi.mock('@/lib/metadata', () => ({
  fetchMovieMetadata: async () => ({}),
  fetchShowMetadata: async () => ({}),
  fetchEpisodeMetadata: async () => ({}),
  normalizeShowName: (s: string) => s,
  normalizeShowNameForMatch: (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ''),
}));
vi.mock('@/lib/mediainfo', () => ({ probeFile: async () => null }));

const { groupFilesForScan } = await import('@/lib/scanner');

describe('groupFilesForScan', () => {
  it('keeps every episode of one show in a single group', () => {
    const groups = groupFilesForScan([
      'D:/TV/Breaking Bad/Breaking.Bad.S01E01.mkv',
      'D:/TV/Breaking Bad/Breaking.Bad.S01E02.mkv',
      'D:/TV/Breaking Bad/Breaking.Bad.S02E01.mkv',
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('separates different shows so they can run in parallel', () => {
    const groups = groupFilesForScan([
      'D:/TV/Breaking.Bad.S01E01.mkv',
      'D:/TV/Better.Call.Saul.S01E01.mkv',
    ]);
    expect(groups).toHaveLength(2);
  });

  it('gives each movie its own group', () => {
    const groups = groupFilesForScan([
      'D:/Movies/Inception (2010).mkv',
      'D:/Movies/Dune (2021).mkv',
      'D:/Movies/Arrival (2016).mkv',
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.length === 1)).toBe(true);
  });

  it('groups the same show across differing filename separators', () => {
    const groups = groupFilesForScan([
      'D:/TV/Breaking.Bad.S01E01.mkv',
      'D:/TV/Breaking_Bad_S01E02.mkv',
      'D:/TV/Breaking Bad S01E03.mkv',
    ]);
    expect(groups).toHaveLength(1);
  });

  it('loses no files while partitioning', () => {
    const input = [
      'D:/TV/Show.A.S01E01.mkv',
      'D:/TV/Show.A.S01E02.mkv',
      'D:/TV/Show.B.S01E01.mkv',
      'D:/Movies/Film One (2020).mkv',
      'D:/Movies/Film Two (2021).mkv',
    ];
    const flattened = groupFilesForScan(input).flat();
    expect(flattened.sort()).toEqual([...input].sort());
  });

  it('handles an empty list', () => {
    expect(groupFilesForScan([])).toEqual([]);
  });
});
