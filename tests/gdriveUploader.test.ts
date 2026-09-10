import { describe, it, expect } from 'vitest';
import { getOrganizedRemotePath, getGdriveConfig } from '../lib/gdriveUploader';

describe('Google Drive Uploader', () => {
    describe('getGdriveConfig', () => {
        it('returns default config when no DB settings are present', () => {
            const config = getGdriveConfig();
            expect(config.remote).toBe('gdrive');
            expect(config.basePath).toBe('Media');
            expect(config.mountDrive).toBe('Z:');
            expect(typeof config.enabled).toBe('boolean');
        });
    });

    describe('getOrganizedRemotePath', () => {
        it('organizes standard TV show episodes into Show/Season XX/Filename', () => {
            const result = getOrganizedRemotePath('Breaking.Bad.S01E02.1080p.mkv');
            expect(result).toBe('TV Shows/Breaking Bad/Season 01/Breaking.Bad.S01E02.1080p.mkv');
        });

        it('handles TV shows with alternate casing and dots', () => {
            const result = getOrganizedRemotePath('Severance.S02E05.2160p.HDR.mkv');
            expect(result).toBe('TV Shows/Severance/Season 02/Severance.S02E05.2160p.HDR.mkv');
        });

        it('handles single-digit seasons and episodes with padding', () => {
            const result = getOrganizedRemotePath('Stranger.Things.S1E1.mkv');
            expect(result).toBe('TV Shows/Stranger Things/Season 01/Stranger.Things.S1E1.mkv');
        });

        it('organizes movies with years into Movies/Title (Year)/Title (Year).ext', () => {
            const result = getOrganizedRemotePath('Inception.2010.1080p.BluRay.mkv');
            expect(result).toBe('Movies/Inception (2010)/Inception (2010).mkv');
        });

        it('organizes movies with bracketed years', () => {
            const result = getOrganizedRemotePath('The Dark Knight (2008).mp4');
            expect(result).toBe('Movies/The Dark Knight (2008)/The Dark Knight (2008).mp4');
        });

        it('falls back to Movies/<clean title>/<filename> when no year or show pattern is detected', () => {
            const result = getOrganizedRemotePath('HomeVideo.mp4');
            expect(result).toBe('Movies/HomeVideo/HomeVideo.mp4');
        });

        it('respects mediaType tv hint even without strict pattern', () => {
            const result = getOrganizedRemotePath('SpecialShowEpisode.mkv', 'tv');
            expect(result).toBe('TV Shows/SpecialShowEpisode.mkv');
        });
    });
});
