import { describe, it, expect } from 'vitest';
import { normalizeSportCategory, matchesSportFilter } from '@/app/api/sports/matches/route';

describe('normalizeSportCategory', () => {
  it('correctly maps tennis matches tagged as "other" or with emojis', () => {
    expect(normalizeSportCategory('other', 'US Open 🎾')).toBe('tennis');
    expect(normalizeSportCategory('other', 'Wimbledon Men\'s Final')).toBe('tennis');
    expect(normalizeSportCategory('other', 'ATP Masters 1000 - Sinner vs Alcaraz')).toBe('tennis');
    expect(normalizeSportCategory('tenis', 'Swiatek vs Sabalenka')).toBe('tennis');
  });

  it('correctly maps snooker/billiards tagged as "other" or with emojis', () => {
    expect(normalizeSportCategory('other', 'Snooker English Open 🎱')).toBe('billiards');
    expect(normalizeSportCategory('snooker', 'Ronnie O\'Sullivan vs Trump')).toBe('billiards');
    expect(normalizeSportCategory('pool', 'World 9-Ball Championship')).toBe('billiards');
  });

  it('correctly maps fight sports across MMA, Boxing, UFC', () => {
    expect(normalizeSportCategory('fight', 'UFC 305')).toBe('fight');
    expect(normalizeSportCategory('mma', 'Bellator Championship')).toBe('fight');
    expect(normalizeSportCategory('boxing', 'Fury vs Usyk 2')).toBe('fight');
    expect(normalizeSportCategory('boks', 'Canelo vs Berlanga')).toBe('fight');
    expect(normalizeSportCategory('combat', 'ONE Fight Night 25')).toBe('fight');
  });

  it('correctly maps motorsport & formula 1', () => {
    expect(normalizeSportCategory('formula1', 'Italian Grand Prix')).toBe('motor-sports');
    expect(normalizeSportCategory('motorsport', 'MotoGP Misano')).toBe('motor-sports');
    expect(normalizeSportCategory('motor-sports', 'NASCAR Cup Series')).toBe('motor-sports');
  });

  it('correctly maps football / soccer and Polish equivalents', () => {
    expect(normalizeSportCategory('football', 'Arsenal vs Chelsea')).toBe('football');
    expect(normalizeSportCategory('soccer', 'Real Madrid vs Barcelona')).toBe('football');
    expect(normalizeSportCategory('pilkanozna', 'Legia Warszawa vs Lech Poznan')).toBe('football');
    expect(normalizeSportCategory('futsal', 'Portugal vs Brazil')).toBe('football');
  });

  it('correctly maps other major sports', () => {
    expect(normalizeSportCategory('basketball', 'Lakers vs Warriors')).toBe('basketball');
    expect(normalizeSportCategory('koszykowka', 'Euroleague Final')).toBe('basketball');
    expect(normalizeSportCategory('americanfootball', 'Chiefs vs Ravens')).toBe('american-football');
    expect(normalizeSportCategory('baseball', 'Yankees vs Red Sox')).toBe('baseball');
    expect(normalizeSportCategory('hockey', 'Oilers vs Panthers')).toBe('hockey');
    expect(normalizeSportCategory('cricket', 'India vs Australia')).toBe('cricket');
    expect(normalizeSportCategory('golf', 'The Masters Tournament')).toBe('golf');
    expect(normalizeSportCategory('darts', 'PDC World Championship')).toBe('darts');
  });
});

describe('matchesSportFilter', () => {
  it('returns true when requested sport is "all"', () => {
    expect(matchesSportFilter('football', 'all')).toBe(true);
    expect(matchesSportFilter('tennis', 'all')).toBe(true);
  });

  it('matches exact sports', () => {
    expect(matchesSportFilter('football', 'football')).toBe(true);
    expect(matchesSportFilter('tennis', 'tennis')).toBe(true);
    expect(matchesSportFilter('basketball', 'basketball')).toBe(true);
    expect(matchesSportFilter('football', 'tennis')).toBe(false);
  });

  it('handles Fight aliases (mma, boxing, fight)', () => {
    expect(matchesSportFilter('fight', 'mma')).toBe(true);
    expect(matchesSportFilter('mma', 'fight')).toBe(true);
    expect(matchesSportFilter('boxing', 'fight')).toBe(true);
    expect(matchesSportFilter('combat', 'fight')).toBe(true);
  });

  it('handles Motorsport aliases (formula1, motorsport, motor-sports)', () => {
    expect(matchesSportFilter('motor-sports', 'formula1')).toBe(true);
    expect(matchesSportFilter('formula1', 'motor-sports')).toBe(true);
    expect(matchesSportFilter('motorsport', 'motor-sports')).toBe(true);
  });

  it('handles Billiards aliases (snooker, pool, billiards)', () => {
    expect(matchesSportFilter('billiards', 'snooker')).toBe(true);
    expect(matchesSportFilter('snooker', 'billiards')).toBe(true);
  });

  it('handles Rugby and AFL aliases', () => {
    expect(matchesSportFilter('rugby', 'afl')).toBe(true);
    expect(matchesSportFilter('afl', 'rugby')).toBe(true);
  });
});
