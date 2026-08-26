import { describe, expect, it } from 'vitest';
import { resolveLanguageName } from '@/lib/metadata';
import type { ContentItem } from '@/app/types';

describe('resolveLanguageName', () => {
  it('resolves standard ISO-639-1 language codes from TMDB', () => {
    expect(resolveLanguageName('ta')).toBe('Tamil');
    expect(resolveLanguageName('hi')).toBe('Hindi');
    expect(resolveLanguageName('te')).toBe('Telugu');
    expect(resolveLanguageName('ml')).toBe('Malayalam');
    expect(resolveLanguageName('kn')).toBe('Kannada');
    expect(resolveLanguageName('en')).toBe('English');
    expect(resolveLanguageName('ja')).toBe('Japanese');
    expect(resolveLanguageName('ko')).toBe('Korean');
    expect(resolveLanguageName('es')).toBe('Spanish');
    expect(resolveLanguageName('fr')).toBe('French');
    expect(resolveLanguageName('de')).toBe('German');
    expect(resolveLanguageName('it')).toBe('Italian');
    expect(resolveLanguageName('zh')).toBe('Chinese');
  });

  it('falls back to language keyword in filename when code is missing', () => {
    expect(resolveLanguageName(null, 'Peddi.2024.Tamil.1080p.mkv')).toBe('Tamil');
    expect(resolveLanguageName(null, 'Game.Over.2019.Telugu.WEB-DL.mkv')).toBe('Telugu');
    expect(resolveLanguageName(null, 'Attack.on.Titan.S01E01.Japanese.1080p.mkv')).toBe('Japanese');
    expect(resolveLanguageName(null, 'Money.Heist.S01E01.Spanish.720p.mkv')).toBe('Spanish');
    expect(resolveLanguageName(null, 'RRR.2022.HIN.1080p.mkv')).toBe('Hindi');
  });

  it('defaults to English when no language is detected', () => {
    expect(resolveLanguageName(null, 'Generic.Movie.2024.1080p.mkv')).toBe('English');
    expect(resolveLanguageName(null, null)).toBe('English');
  });
});

describe('Language Sorting and Filtering', () => {
  const sampleItems: ContentItem[] = [
    { id: 1, type: 'movie', title: 'Peddi', language: 'Tamil', rating: 8.0, posterPath: null, backdropPath: null, overview: null },
    { id: 2, type: 'movie', title: 'Inception', language: 'English', rating: 8.8, posterPath: null, backdropPath: null, overview: null },
    { id: 3, type: 'movie', title: 'Dangal', language: 'Hindi', rating: 8.4, posterPath: null, backdropPath: null, overview: null },
    { id: 4, type: 'movie', title: 'Parasite', language: 'Korean', rating: 8.5, posterPath: null, backdropPath: null, overview: null },
    { id: 5, type: 'movie', title: 'Avatar', language: 'English', rating: 7.9, posterPath: null, backdropPath: null, overview: null },
    { id: 6, type: 'movie', title: 'Spirited Away', language: 'Japanese', rating: 8.6, posterPath: null, backdropPath: null, overview: null },
  ];

  it('sorts library items by language ascending (A–Z)', () => {
    const sorted = [...sampleItems].sort((a, b) => {
      const langA = a.language || 'Unknown';
      const langB = b.language || 'Unknown';
      const langDiff = langA.localeCompare(langB, undefined, { sensitivity: 'base' });
      if (langDiff !== 0) return langDiff;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
    });

    const expectedOrder = [
      'Avatar',        // English
      'Inception',     // English
      'Dangal',        // Hindi
      'Spirited Away', // Japanese
      'Parasite',      // Korean
      'Peddi',         // Tamil
    ];

    expect(sorted.map(i => i.title)).toEqual(expectedOrder);
  });

  it('sorts library items by language descending (Z–A)', () => {
    const sorted = [...sampleItems].sort((a, b) => {
      const langA = a.language || 'Unknown';
      const langB = b.language || 'Unknown';
      const langDiff = langB.localeCompare(langA, undefined, { sensitivity: 'base' });
      if (langDiff !== 0) return langDiff;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
    });

    const expectedOrder = [
      'Peddi',         // Tamil
      'Parasite',      // Korean
      'Spirited Away', // Japanese
      'Dangal',        // Hindi
      'Avatar',        // English
      'Inception',     // English
    ];

    expect(sorted.map(i => i.title)).toEqual(expectedOrder);
  });

  it('filters library items by selected language', () => {
    const filterByLang = (items: ContentItem[], lang: string | null) => {
      return items.filter(i => !lang || i.language === lang);
    };

    const tamilOnly = filterByLang(sampleItems, 'Tamil');
    expect(tamilOnly.map(i => i.title)).toEqual(['Peddi']);

    const englishOnly = filterByLang(sampleItems, 'English');
    expect(englishOnly.map(i => i.title)).toEqual(['Inception', 'Avatar']);
  });
});
