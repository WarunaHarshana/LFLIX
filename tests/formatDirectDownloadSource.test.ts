import { describe, expect, it } from 'vitest';
import { formatDirectDownloadSource } from '@/app/components/DownloadModal';

describe('formatDirectDownloadSource', () => {
  it('rebrands "4K CINEJOY [FSLv2]" to "LFLIX [FSLv2]"', () => {
    expect(formatDirectDownloadSource('4K CINEJOY [FSLv2]')).toBe('LFLIX [FSLv2]');
  });

  it('rebrands "4K CINEJOY [FSL Server]" to "LFLIX [FSL Server]"', () => {
    expect(formatDirectDownloadSource('4K CINEJOY [FSL Server]')).toBe('LFLIX [FSL Server]');
  });

  it('rebrands "4K CINEJOY" to "LFLIX"', () => {
    expect(formatDirectDownloadSource('4K CINEJOY')).toBe('LFLIX');
  });

  it('rebrands "Cinejoy" to "LFLIX"', () => {
    expect(formatDirectDownloadSource('Cinejoy')).toBe('LFLIX');
    expect(formatDirectDownloadSource('CINEJOY')).toBe('LFLIX');
  });

  it('preserves other providers like "Onedrive" and "Google Drive"', () => {
    expect(formatDirectDownloadSource('Onedrive')).toBe('Onedrive');
    expect(formatDirectDownloadSource('Google Drive')).toBe('Google Drive');
  });

  it('handles null, undefined, or empty string with fallback to "LFLIX"', () => {
    expect(formatDirectDownloadSource(null)).toBe('LFLIX');
    expect(formatDirectDownloadSource(undefined)).toBe('LFLIX');
    expect(formatDirectDownloadSource('')).toBe('LFLIX');
  });
});
