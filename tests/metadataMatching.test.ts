import { describe, expect, it } from 'vitest';
import { cleanFilename, extractYear, stripReleaseSitePrefix } from '@/lib/metadata';

describe('stripReleaseSitePrefix', () => {
  it('strips new gTLD release prefixes with dots', () => {
    expect(stripReleaseSitePrefix('www.1TamilMV.report - Peddi')).toBe('Peddi');
    expect(stripReleaseSitePrefix('www.1TamilMV.durban - Blast')).toBe('Blast');
    expect(stripReleaseSitePrefix('1TamilMV.pm - Movie Name')).toBe('Movie Name');
  });

  it('strips space-separated tracker names without dot TLD', () => {
    expect(stripReleaseSitePrefix('Www 1Tamilmv Report - Peddi')).toBe('Peddi');
    expect(stripReleaseSitePrefix('Www 1Tamilmv Durban - Blast')).toBe('Blast');
    expect(stripReleaseSitePrefix('1Tamilmv - Peddi')).toBe('Peddi');
    expect(stripReleaseSitePrefix('Tamilblasters - Coolie')).toBe('Coolie');
  });

  it('strips bracketed release group tags', () => {
    expect(stripReleaseSitePrefix('[1TamilMV.org] Peddi (2024)')).toBe('Peddi (2024)');
    expect(stripReleaseSitePrefix('(TamilRockers) Leo (2023)')).toBe('Leo (2023)');
  });
});

describe('cleanFilename', () => {
  it('cleans A K A spaced and dotted alias patterns', () => {
    expect(cleanFilename('Godzilla Minus One A K A Gojira -1 0 2023 JAPANESE.mkv')).toBe('Godzilla Minus One');
    expect(cleanFilename('Thunderbolts A K A The New Avengers.mkv')).toBe('Thunderbolts');
    expect(cleanFilename('The Furious A K A Huo zhe yan.mkv')).toBe('The Furious');
    expect(cleanFilename('Movie Title A.K.A. Other Name 2022.mkv')).toBe('Movie Title');
    expect(cleanFilename('Movie Title AKA Other Name 1080p.mkv')).toBe('Movie Title');
  });

  it('cleans tracker site prefixes and scene tags cleanly', () => {
    expect(cleanFilename('Www 1Tamilmv Report - Peddi.2024.1080p.mkv')).toBe('Peddi');
    expect(cleanFilename('Www 1Tamilmv Durban - Blast.1080p.HD.mkv')).toBe('Blast');
  });

  it('preserves numeric title like 1992 and extracts year properly', () => {
    expect(cleanFilename('1992.2024.1080p.WEB-DL.mkv')).toBe('1992');
    expect(cleanFilename('1992 (2024).mkv')).toBe('1992');
    expect(cleanFilename('1992.1080p.mkv')).toBe('1992');
    expect(cleanFilename('Blade Runner 2049 (2017).mkv')).toBe('Blade Runner 2049');
    expect(cleanFilename('2001 A Space Odyssey (1968).mkv')).toBe('2001 A Space Odyssey');
  });
});

describe('extractYear', () => {
  it('prioritizes bracketed release years', () => {
    expect(extractYear('1992 (2024).mkv')).toBe(2024);
    expect(extractYear('Blade Runner 2049 (2017).mkv')).toBe(2017);
    expect(extractYear('2001 A Space Odyssey [1968].mkv')).toBe(1968);
  });

  it('extracts release year correctly when title contains a number/year', () => {
    expect(extractYear('1992.2024.1080p.mkv')).toBe(2024);
    expect(extractYear('Blade.Runner.2049.2017.1080p.mkv')).toBe(2017);
    expect(extractYear('Inception.2010.1080p.mkv')).toBe(2010);
    expect(extractYear('1992.1080p.mkv')).toBe(1992);
  });
});
