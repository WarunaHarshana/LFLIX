import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDirectDownloadMatch } from '@/lib/titleMatching';
import { GET as directDownloadsRoute } from '@/app/api/direct-downloads/route';
import * as cinejoyModule from '@/lib/cinejoy';

describe('Direct Download Title and Year Filtering', () => {
    describe('isDirectDownloadMatch with Movie ("The Runner", 2026)', () => {
        const queryTitle = 'The Runner';
        const queryOpts = { year: '2026', mediaType: 'movie' };

        it('rejects completely different movies containing query words', () => {
            expect(isDirectDownloadMatch({ name: 'Maze Runner The Scorch Trials 2015 1080p' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'The Bugs Bunny/Road Runner Movie (1979)' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'Maze.Runner.The.Death.Cure.2018.2160p' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'Blade Runner 2049 (2017)' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'Runner Runner (2013) 1080p' }, queryTitle, queryOpts)).toBe(false);
        });

        it('rejects the same title with a conflicting year', () => {
            // "The Runner" was also released in 1984, 1999, 2015
            expect(isDirectDownloadMatch({ name: 'The Runner (1984) 720p' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'The.Runner.1999.DVDRip' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'The Runner 2015 1080p BluRay' }, queryTitle, queryOpts)).toBe(false);
        });

        it('accepts genuine matches for "The Runner (2026)"', () => {
            expect(isDirectDownloadMatch({ name: 'The Runner 2026 1080p WEB-DL DDP5.1 Atmos H.264' }, queryTitle, queryOpts)).toBe(true);
            expect(isDirectDownloadMatch({ name: 'The.Runner.2026.2160p.UHD.BluRay.x265' }, queryTitle, queryOpts)).toBe(true);
            expect(isDirectDownloadMatch({ name: 'The Runner (2026) [1080p]' }, queryTitle, queryOpts)).toBe(true);
            expect(isDirectDownloadMatch({ name: 'The Runner 2026' }, queryTitle, queryOpts)).toBe(true);
            expect(isDirectDownloadMatch({ name: 'The Runner' }, queryTitle, queryOpts)).toBe(true);
        });
    });

    describe('isDirectDownloadMatch with TV Show ("Fallout", S01E02)', () => {
        const queryTitle = 'Fallout';
        const queryOpts = { year: '2024', mediaType: 'tv', season: 1, episode: 2 };

        it('accepts correct episode file', () => {
            expect(isDirectDownloadMatch({ name: 'Fallout.S01E02.1080p.AMZN.WEB-DL.DDP5.1.Atmos' }, queryTitle, queryOpts)).toBe(true);
            expect(isDirectDownloadMatch({ name: 'Fallout - 1x02 - The Target' }, queryTitle, queryOpts)).toBe(true);
            expect(isDirectDownloadMatch({ name: 'Fallout S01 E02' }, queryTitle, queryOpts)).toBe(true);
        });

        it('rejects wrong episode or season', () => {
            expect(isDirectDownloadMatch({ name: 'Fallout.S01E01.1080p' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'Fallout.S01E03.1080p' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'Fallout.S02E02.1080p' }, queryTitle, queryOpts)).toBe(false);
        });

        it('rejects pack files or season batches when single episode requested', () => {
            expect(isDirectDownloadMatch({ name: 'Fallout S01 Complete 1080p' }, queryTitle, queryOpts)).toBe(false);
            expect(isDirectDownloadMatch({ name: 'Fallout Season 1' }, queryTitle, queryOpts)).toBe(false);
        });

        it('rejects different show titles', () => {
            expect(isDirectDownloadMatch({ name: 'Mission Impossible Fallout 2018 1080p' }, queryTitle, queryOpts)).toBe(false);
        });
    });

    describe('/api/direct-downloads route filtering', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        it('filters out mismatched items returned by upstream cinejoy provider', async () => {
            vi.spyOn(cinejoyModule, 'fetchCinejoyDirectDownloads').mockResolvedValue([
                {
                    source: 'Cinejoy',
                    name: 'The Runner 2026 1080p WEB-DL',
                    quality: 1080,
                    qualityLabel: '1080p',
                    qualityTags: ['WEB-DL'],
                    size: '2.4 GB',
                    sizeBytes: 2500000000,
                    url: 'https://cdn.example.com/the-runner-2026.mp4',
                    provider: 'cinejoy',
                },
                {
                    source: 'Cinejoy',
                    name: 'Maze Runner The Scorch Trials 2015 1080p',
                    quality: 1080,
                    qualityLabel: '1080p',
                    qualityTags: ['BluRay'],
                    size: '4.8 GB',
                    sizeBytes: 5000000000,
                    url: 'https://cdn.example.com/maze-runner.mp4',
                    provider: 'cinejoy',
                },
                {
                    source: 'Cinejoy',
                    name: 'The Bugs Bunny Road Runner Movie 1979',
                    quality: 720,
                    qualityLabel: '720p',
                    qualityTags: ['HD'],
                    size: '1.2 GB',
                    sizeBytes: 1200000000,
                    url: 'https://cdn.example.com/bugs-bunny.mp4',
                    provider: 'cinejoy',
                },
                {
                    source: 'Cinejoy',
                    name: 'The Runner (1984)',
                    quality: 720,
                    qualityLabel: '720p',
                    qualityTags: ['HD'],
                    size: '900 MB',
                    sizeBytes: 900000000,
                    url: 'https://cdn.example.com/runner-1984.mp4',
                    provider: 'cinejoy',
                },
            ]);

            const req = new Request('http://localhost:3000/api/direct-downloads?tmdbId=999999&mediaType=movie&title=The%20Runner&year=2026');
            const res = await directDownloadsRoute(req);
            const data = await res.json();

            expect(data.success).toBe(true);
            expect(data.downloads).toHaveLength(1);
            expect(data.downloads[0].name).toBe('The Runner 2026 1080p WEB-DL');
            expect(data.downloads[0].url).toBe('https://cdn.example.com/the-runner-2026.mp4');
        });
    });
});
