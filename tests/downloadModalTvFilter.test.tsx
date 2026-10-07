/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import DownloadModal from '@/app/components/DownloadModal';
import { parseTvTitleInfo, matchesTvSeasonEpisode } from '@/lib/titleMatching';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('TV Title Parsing and Filtering Logic', () => {
    it('correctly parses single episode, multi-episode, season pack, and complete series titles', () => {
        const ep1 = parseTvTitleInfo('Vikings.S05E01.1080p.AMZN.WEB-DL.DDP5.1.Atmos');
        expect(ep1.season).toBe(5);
        expect(ep1.episode).toBe(1);
        expect(ep1.isSeasonPack).toBe(false);

        const ep2 = parseTvTitleInfo('Vikings 5x02 720p HDTV x264');
        expect(ep2.season).toBe(5);
        expect(ep2.episode).toBe(2);

        const pack = parseTvTitleInfo('Vikings.S05.1080p.BluRay.x264-ROVERS');
        expect(pack.season).toBe(5);
        expect(pack.isSeasonPack).toBe(true);
        expect(pack.episode).toBeUndefined();

        const seriesPack = parseTvTitleInfo('Vikings Complete Series S01-S06 1080p BluRay');
        expect(seriesPack.isSeriesPack).toBe(true);
        expect(seriesPack.seasonRange).toEqual([1, 6]);
    });

    it('matches releases against season and episode filters accurately', () => {
        const epTitle = 'Vikings.S05E01.1080p.WEB-DL';
        const otherEpTitle = 'Vikings.S05E02.1080p.WEB-DL';
        const seasonPackTitle = 'Vikings.S05.Complete.1080p';
        const otherSeasonTitle = 'Vikings.S04E01.1080p';

        // Filter: Season 5, Episode 1
        expect(matchesTvSeasonEpisode(epTitle, { season: 5, episode: 1 })).toBe(true);
        expect(matchesTvSeasonEpisode(otherEpTitle, { season: 5, episode: 1 })).toBe(false);
        expect(matchesTvSeasonEpisode(seasonPackTitle, { season: 5, episode: 1 })).toBe(true); // Pack includes Ep 1
        expect(matchesTvSeasonEpisode(otherSeasonTitle, { season: 5, episode: 1 })).toBe(false);

        // Filter: Season 5, All Episodes
        expect(matchesTvSeasonEpisode(epTitle, { season: 5, episode: 'all' })).toBe(true);
        expect(matchesTvSeasonEpisode(otherEpTitle, { season: 5, episode: 'all' })).toBe(true);
        expect(matchesTvSeasonEpisode(seasonPackTitle, { season: 5, episode: 'all' })).toBe(true);
        expect(matchesTvSeasonEpisode(otherSeasonTitle, { season: 5, episode: 'all' })).toBe(false);

        // Filter: All Seasons, All Episodes
        expect(matchesTvSeasonEpisode(otherSeasonTitle, { season: 'all', episode: 'all' })).toBe(true);
    });
});

describe('DownloadModal TV Season and Episode UI Filter', () => {
    it('renders season and episode filter dropdowns for TV shows and filters results', async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/folders')) {
                return Promise.resolve({
                    json: () => Promise.resolve({ folders: [] }),
                });
            }
            if (url.includes('/api/direct-downloads')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        success: true,
                        downloads: [
                            {
                                source: 'Cinejoy',
                                name: 'Vikings S05E01 [1080p]',
                                quality: 1080,
                                qualityLabel: '1080p',
                                qualityTags: ['1080p'],
                                size: '1.8 GB',
                                sizeBytes: 1932735283,
                                url: 'https://example.com/vikings_s05e01.mp4',
                                provider: 'cinejoy',
                            },
                            {
                                source: 'Cinejoy',
                                name: 'Vikings S05E02 [1080p]',
                                quality: 1080,
                                qualityLabel: '1080p',
                                qualityTags: ['1080p'],
                                size: '1.9 GB',
                                sizeBytes: 2040109465,
                                url: 'https://example.com/vikings_s05e02.mp4',
                                provider: 'cinejoy',
                            }
                        ]
                    }),
                });
            }
            if (url.includes('/api/torrent-search')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        results: [
                            {
                                title: 'Vikings.S05E01.1080p.AMZN.WEB-DL',
                                magnet: 'magnet:?xt=urn:btih:vikings_s05e01',
                                size: '2.1 GB',
                                sizeBytes: 2254857830,
                                seeds: 50,
                                leeches: 5,
                                quality: '1080p',
                                source: '1337x',
                            },
                            {
                                title: 'Vikings.S05E02.1080p.AMZN.WEB-DL',
                                magnet: 'magnet:?xt=urn:btih:vikings_s05e02',
                                size: '2.2 GB',
                                sizeBytes: 2362232012,
                                seeds: 40,
                                leeches: 4,
                                quality: '1080p',
                                source: '1337x',
                            },
                            {
                                title: 'Vikings.S05.Complete.1080p.BluRay',
                                magnet: 'magnet:?xt=urn:btih:vikings_s05_pack',
                                size: '25.0 GB',
                                sizeBytes: 26843545600,
                                seeds: 80,
                                leeches: 10,
                                quality: '1080p',
                                source: '1337x',
                            },
                            {
                                title: 'Vikings.S04E01.1080p.BluRay',
                                magnet: 'magnet:?xt=urn:btih:vikings_s04e01',
                                size: '1.9 GB',
                                sizeBytes: 2040109465,
                                seeds: 30,
                                leeches: 3,
                                quality: '1080p',
                                source: '1337x',
                            }
                        ]
                    }),
                });
            }
            return Promise.resolve({ json: () => Promise.resolve({}) });
        }) as any;

        render(
            <DownloadModal
                isOpen={true}
                title="Vikings"
                year="2013"
                mediaType="tv"
                season={5}
                episode={1}
                availableSeasons={[
                    { seasonNumber: 1, name: 'Season 1', episodeCount: 9 },
                    { seasonNumber: 2, name: 'Season 2', episodeCount: 10 },
                    { seasonNumber: 5, name: 'Season 5', episodeCount: 20 },
                ]}
                onClose={() => {}}
            />
        );

        // Filter UI should be rendered for TV shows
        await waitFor(() => {
            expect(screen.getByText(/Filter:/i)).toBeTruthy();
            expect(screen.getAllByText('Season 5').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('Episode 1').length).toBeGreaterThanOrEqual(1);
        });

        // In Direct Downloads tab, only S05E01 is shown when filtered to S5 E1
        await waitFor(() => {
            expect(screen.getByText('Vikings S05E01 [1080p]')).toBeTruthy();
            expect(screen.queryByText('Vikings S05E02 [1080p]')).toBeNull();
        });

        // Switch to Torrents tab
        const torrentsTabBtn = screen.getByRole('button', { name: /Torrents/i });
        fireEvent.click(torrentsTabBtn);

        // Under Torrents tab with S5 E1 filter, S05E01 and S05 Complete Pack are shown; S05E02 and S04E01 are filtered out
        await waitFor(() => {
            expect(screen.getByText('Vikings.S05E01.1080p.AMZN.WEB-DL')).toBeTruthy();
            expect(screen.getByText('Vikings.S05.Complete.1080p.BluRay')).toBeTruthy();
            expect(screen.queryByText('Vikings.S05E02.1080p.AMZN.WEB-DL')).toBeNull();
            expect(screen.queryByText('Vikings.S04E01.1080p.BluRay')).toBeNull();
        });

        // Clear filter with Reset button
        const resetBtn = screen.getByRole('button', { name: /Reset/i });
        fireEvent.click(resetBtn);

        // Now all torrents should be visible
        await waitFor(() => {
            expect(screen.getByText('Vikings.S05E02.1080p.AMZN.WEB-DL')).toBeTruthy();
            expect(screen.getByText('Vikings.S04E01.1080p.BluRay')).toBeTruthy();
        });
    });

    it('does NOT render TV filter bar when mediaType is movie', async () => {
        global.fetch = vi.fn().mockImplementation(() =>
            Promise.resolve({
                json: () => Promise.resolve({ folders: [], results: [], downloads: [] }),
            })
        ) as any;

        render(
            <DownloadModal
                isOpen={true}
                title="Inception"
                year="2010"
                mediaType="movie"
                onClose={() => {}}
            />
        );

        await waitFor(() => {
            expect(screen.queryByText(/Filter:/i)).toBeNull();
        });
    });
});
