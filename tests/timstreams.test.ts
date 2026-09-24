import { describe, it, expect } from 'vitest';
import {
  parseTimStreamsTimeToUTC,
  normalizeGenresMap,
  mapTimStreamsCategory,
  extractTeamsFromTitle,
  TIMSTREAMS_BASE
} from '@/lib/timstreams';

describe('timstreams', () => {
  describe('constants', () => {
    it('uses the correct official base URL', () => {
      expect(TIMSTREAMS_BASE).toBe('https://timst.cfd');
    });
  });

  describe('parseTimStreamsTimeToUTC', () => {
    it('parses ISO format date-time string to UTC timestamp', () => {
      const ts = parseTimStreamsTimeToUTC('2026-08-15T13:30');
      expect(ts).toBeGreaterThan(0);
      const date = new Date(ts);
      expect(date.getUTCHours()).toBe(13);
      expect(date.getUTCMinutes()).toBe(30);
    });

    it('parses space-separated date-time string to UTC timestamp', () => {
      const ts = parseTimStreamsTimeToUTC('2026-08-15 13:30');
      expect(ts).toBeGreaterThan(0);
      const date = new Date(ts);
      expect(date.getUTCHours()).toBe(13);
      expect(date.getUTCMinutes()).toBe(30);
    });

    it('returns 0 or valid fallback on empty/invalid string', () => {
      expect(parseTimStreamsTimeToUTC('')).toBe(0);
    });
  });

  describe('normalizeGenresMap', () => {
    it('normalizes array of genre objects into an ID map', () => {
      const rawGenres = [
        { id: 1, name: 'Soccer' },
        { id: 2, name: 'Motorsport' },
        { id: 8, name: 'American Football' }
      ];
      const map = normalizeGenresMap(rawGenres);
      expect(map[1]).toBe('Soccer');
      expect(map[2]).toBe('Motorsport');
      expect(map[8]).toBe('American Football');
    });

    it('normalizes key-value object of genres', () => {
      const rawGenres = {
        '1': 'Soccer',
        '2': 'Motorsport'
      };
      const map = normalizeGenresMap(rawGenres);
      expect(map[1]).toBe('Soccer');
      expect(map[2]).toBe('Motorsport');
    });

    it('handles empty or null inputs gracefully', () => {
      expect(normalizeGenresMap(null)).toEqual({});
      expect(normalizeGenresMap(undefined)).toEqual({});
      expect(normalizeGenresMap([])).toEqual({});
    });
  });

  describe('mapTimStreamsCategory', () => {
    const genresMap: Record<number, string> = {
      1: 'Soccer',
      2: 'Motorsport',
      3: 'Mixed Martial Arts',
      4: 'Bare Knuckles',
      5: 'Boxing',
      6: 'Profesional Wrestling',
      7: 'Basketball',
      8: 'American Football',
      9: 'Baseball',
      10: 'Tennis',
      11: 'Hockey',
      12: 'Darts',
      13: 'Cricket',
      14: 'Cycling',
      15: 'Rugby',
      17: 'Live Shows',
      18: 'Others / Uncategorized'
    };

    it('maps genres correctly by numeric ID with dictionary', () => {
      expect(mapTimStreamsCategory(1, genresMap)).toBe('football');
      expect(mapTimStreamsCategory(2, genresMap)).toBe('formula1');
      expect(mapTimStreamsCategory(3, genresMap)).toBe('mma');
      expect(mapTimStreamsCategory(4, genresMap)).toBe('boxing');
      expect(mapTimStreamsCategory(5, genresMap)).toBe('boxing');
      expect(mapTimStreamsCategory(6, genresMap)).toBe('mma');
      expect(mapTimStreamsCategory(7, genresMap)).toBe('basketball');
      expect(mapTimStreamsCategory(8, genresMap)).toBe('american-football');
      expect(mapTimStreamsCategory(9, genresMap)).toBe('baseball');
      expect(mapTimStreamsCategory(10, genresMap)).toBe('tennis');
      expect(mapTimStreamsCategory(11, genresMap)).toBe('hockey');
      expect(mapTimStreamsCategory(12, genresMap)).toBe('darts');
      expect(mapTimStreamsCategory(13, genresMap)).toBe('cricket');
      expect(mapTimStreamsCategory(14, genresMap)).toBe('cycling');
      expect(mapTimStreamsCategory(15, genresMap)).toBe('rugby');
      expect(mapTimStreamsCategory(17, genresMap)).toBe('tv');
      expect(mapTimStreamsCategory(18, genresMap)).toBe('other');
    });

    it('maps genre directly from string name', () => {
      expect(mapTimStreamsCategory('Soccer')).toBe('football');
      expect(mapTimStreamsCategory('Formula 1')).toBe('formula1');
      expect(mapTimStreamsCategory('UFC')).toBe('mma');
      expect(mapTimStreamsCategory('NBA')).toBe('basketball');
      expect(mapTimStreamsCategory('NFL')).toBe('american-football');
      expect(mapTimStreamsCategory('Unknown Game')).toBe('other');
    });
  });

  describe('extractTeamsFromTitle', () => {
    it('extracts home and away from "vs" format', () => {
      const teams = extractTeamsFromTitle('Deportivo Alaves vs Getafe');
      expect(teams).toEqual({
        home: { name: 'Deportivo Alaves' },
        away: { name: 'Getafe' }
      });
    });

    it('extracts home and away from "@" format (US away @ home convention)', () => {
      const teams = extractTeamsFromTitle('Panthers @ Bills');
      expect(teams).toEqual({
        away: { name: 'Panthers' },
        home: { name: 'Bills' }
      });
    });

    it('extracts home and away from hyphen format', () => {
      const teams = extractTeamsFromTitle('Arsenal - Chelsea');
      expect(teams).toEqual({
        home: { name: 'Arsenal' },
        away: { name: 'Chelsea' }
      });
    });

    it('returns undefined for non-match titles', () => {
      expect(extractTeamsFromTitle('Knoxville Raceway')).toBeUndefined();
      expect(extractTeamsFromTitle('')).toBeUndefined();
    });
  });
});
