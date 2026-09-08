/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import DownloadModal from '@/app/components/DownloadModal';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('DownloadModal DDL filtering', () => {
    it('filters DDL items out of Torrents tab and places them in Direct Downloads tab', async () => {
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
                                source: 'Direct Provider',
                                name: 'Movie.2026.1080p.WEB-DL',
                                quality: 1080,
                                qualityLabel: '1080p',
                                qualityTags: ['1080p'],
                                size: '2.5 GB',
                                sizeBytes: 2684354560,
                                url: 'https://example.com/stream-direct.mp4',
                                provider: 'direct',
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
                                title: 'Movie.2026.1080p.BluRay.x264',
                                magnet: 'magnet:?xt=urn:btih:puretorrent123',
                                size: '4.2 GB',
                                sizeBytes: 4509715660,
                                seeds: 45,
                                leeches: 5,
                                quality: '1080p',
                                source: 'YTS',
                            },
                            {
                                title: 'Movie.2026.1080p.DDL.Direct',
                                magnet: 'http-direct:https://example.com/ddl-source.mp4',
                                size: '3.1 GB',
                                sizeBytes: 3328599654,
                                seeds: 0,
                                leeches: 0,
                                quality: '1080p',
                                source: 'DDL',
                            }
                        ]
                    }),
                });
            }
            return Promise.reject(new Error(`Unhandled URL: ${url}`));
        }) as any;

        render(
            <DownloadModal
                isOpen={true}
                title="Movie"
                year="2026"
                mediaType="movie"
                onClose={() => {}}
            />
        );

        // Direct Downloads tab should have both the direct download and the merged DDL result
        await waitFor(() => {
            expect(screen.getByText('Direct Downloads')).toBeTruthy();
            expect(screen.getByText('Torrents')).toBeTruthy();
        });

        // The Direct Downloads tab should be active by default and contain the DDL items
        await waitFor(() => {
            expect(screen.getByText('Movie.2026.1080p.WEB-DL')).toBeTruthy();
            expect(screen.getByText('Movie.2026.1080p.DDL.Direct')).toBeTruthy();
        });

        // Torrents tab badge should show 1 (only the pure torrent, not the DDL item)
        const torrentsTabBtn = screen.getByRole('button', { name: /Torrents/i });
        expect(torrentsTabBtn.textContent).toContain('1');

        // Click to switch to Torrents tab
        fireEvent.click(torrentsTabBtn);

        // Should display the 1 pure torrent
        await waitFor(() => {
            expect(screen.getByText('1 torrent found')).toBeTruthy();
            expect(screen.getByText('Movie.2026.1080p.BluRay.x264')).toBeTruthy();
        });

        // Ensure the DDL item is NOT shown in the Torrents tab list
        const torrentsList = screen.queryByText('Movie.2026.1080p.DDL.Direct');
        expect(torrentsList).toBeNull();
    });
});
