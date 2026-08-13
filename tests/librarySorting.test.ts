import { describe, expect, it } from 'vitest';
import type { ContentItem } from '@/app/types';

describe('Library Sorting Logic', () => {
  const getItemYear = (item: ContentItem): number => {
    if (typeof item.year === 'number' && !isNaN(item.year) && item.year > 0) {
      return item.year;
    }
    if (item.firstAirDate) {
      const parsed = parseInt(item.firstAirDate.substring(0, 4), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 0;
  };

  const sampleLibrary: ContentItem[] = [
    {
      id: 1,
      type: 'movie',
      title: 'Interstellar',
      year: 2014,
      posterPath: '/interstellar.jpg',
      backdropPath: null,
      overview: null,
      rating: 8.7,
      imdbRating: 8.7,
      addedAt: '2024-01-01T10:00:00Z',
    },
    {
      id: 2,
      type: 'show',
      title: 'Severance',
      firstAirDate: '2022-02-18', // TV Show with firstAirDate
      posterPath: '/severance.jpg',
      backdropPath: null,
      overview: null,
      rating: 8.4,
      imdbRating: 8.7,
      addedAt: '2024-03-01T10:00:00Z',
    },
    {
      id: 3,
      type: 'show',
      title: 'Breaking Bad',
      firstAirDate: '2008-01-20',
      posterPath: '/bb.jpg',
      backdropPath: null,
      overview: null,
      rating: 9.5,
      imdbRating: 9.5,
      addedAt: '2023-12-01T10:00:00Z',
    },
    {
      id: 4,
      type: 'movie',
      title: 'Dune: Part Two',
      year: 2024,
      posterPath: '/dune2.jpg',
      backdropPath: null,
      overview: null,
      rating: 8.6,
      imdbRating: 8.6,
      addedAt: '2024-04-01T10:00:00Z',
    },
  ];

  it('sorts by Year (Newest) correctly across both movies and TV shows', () => {
    const sorted = [...sampleLibrary].sort((a, b) => {
      const yearDiff = getItemYear(b) - getItemYear(a);
      if (yearDiff !== 0) return yearDiff;
      return a.title.localeCompare(b.title);
    });

    expect(sorted.map(i => i.title)).toEqual([
      'Dune: Part Two', // 2024
      'Severance',      // 2022
      'Interstellar',   // 2014
      'Breaking Bad',   // 2008
    ]);
  });

  it('sorts by Year (Oldest) correctly across both movies and TV shows', () => {
    const sorted = [...sampleLibrary].sort((a, b) => {
      const yearDiff = getItemYear(a) - getItemYear(b);
      if (yearDiff !== 0) return yearDiff;
      return a.title.localeCompare(b.title);
    });

    expect(sorted.map(i => i.title)).toEqual([
      'Breaking Bad',   // 2008
      'Interstellar',   // 2014
      'Severance',      // 2022
      'Dune: Part Two', // 2024
    ]);
  });

  it('sorts by Rating (Highest first)', () => {
    const sorted = [...sampleLibrary].sort((a, b) => {
      const ratingA = (a.imdbRating ?? a.rating) || 0;
      const ratingB = (b.imdbRating ?? b.rating) || 0;
      const ratingDiff = ratingB - ratingA;
      if (ratingDiff !== 0) return ratingDiff;
      return a.title.localeCompare(b.title);
    });

    expect(sorted[0].title).toBe('Breaking Bad'); // 9.5
  });

  it('sorts by Title A-Z and Title Z-A', () => {
    const az = [...sampleLibrary].sort((a, b) => a.title.localeCompare(b.title));
    expect(az.map(i => i.title)).toEqual(['Breaking Bad', 'Dune: Part Two', 'Interstellar', 'Severance']);

    const za = [...sampleLibrary].sort((a, b) => b.title.localeCompare(a.title));
    expect(za.map(i => i.title)).toEqual(['Severance', 'Interstellar', 'Dune: Part Two', 'Breaking Bad']);
  });

  it('sorts by Date Added (Newest first)', () => {
    const sorted = [...sampleLibrary].sort((a, b) => {
      const timeA = new Date(a.addedAt || 0).getTime();
      const timeB = new Date(b.addedAt || 0).getTime();
      return timeB - timeA;
    });

    expect(sorted.map(i => i.title)).toEqual([
      'Dune: Part Two', // 2024-04-01
      'Severance',      // 2024-03-01
      'Interstellar',   // 2024-01-01
      'Breaking Bad',   // 2023-12-01
    ]);
  });
});
