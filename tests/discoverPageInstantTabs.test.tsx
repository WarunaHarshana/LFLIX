/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock clientQueryCache
vi.mock('@/lib/clientQueryCache', () => {
  const cache = new Map<string, unknown>();
  return {
    cachedFetch: vi.fn().mockImplementation(async (url: string) => {
      if (cache.has(url)) return cache.get(url);
      if (url === '/api/trending') {
        const data = {
          movies: [
            { tmdbId: 101, title: 'Trending Movie 1', mediaType: 'movie', posterPath: '/p1.jpg' },
          ],
          tv: [
            { tmdbId: 201, title: 'Trending TV 1', mediaType: 'tv', posterPath: '/t1.jpg' },
          ],
        };
        cache.set(url, data);
        return data;
      }
      if (url.includes('/api/discover')) {
        const isTv = url.includes('type=tv');
        const data = {
          results: isTv
            ? [{ tmdbId: 202, title: 'Discovered TV Show', mediaType: 'tv', posterPath: '/dtv.jpg' }]
            : [{ tmdbId: 102, title: 'Discovered Action Movie', mediaType: 'movie', posterPath: '/dmov.jpg' }],
          page: 1,
          totalPages: 5,
        };
        cache.set(url, data);
        return data;
      }
      return { results: [], page: 1, totalPages: 1 };
    }),
    prefetchQuery: vi.fn(),
  };
});

import DiscoverPage from '@/app/components/DiscoverPage';
import { cachedFetch } from '@/lib/clientQueryCache';

describe('DiscoverPage Instant Tabs & Grid Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders discover page and loads initial trending items via cachedFetch', async () => {
    render(<DiscoverPage />);

    await waitFor(() => {
      expect(cachedFetch).toHaveBeenCalledWith('/api/trending');
      expect(screen.getByText('Trending Movie 1')).toBeTruthy();
    });
  });

  it('switches between Movies and TV Shows instantly', async () => {
    render(<DiscoverPage />);

    await waitFor(() => {
      expect(screen.getByText('Trending Movie 1')).toBeTruthy();
    });

    const tvButton = screen.getByRole('button', { name: /TV Shows/i });
    fireEvent.click(tvButton);

    await waitFor(() => {
      expect(screen.getByText('Trending TV 1')).toBeTruthy();
    });
  });

  it('dispatches filter requests instantly without 500ms delay', async () => {
    render(<DiscoverPage />);

    await waitFor(() => {
      expect(screen.getByText('Trending Movie 1')).toBeTruthy();
    });

    // Select a genre via dropdown trigger
    const genreDropdowns = screen.getAllByText('All Genres');
    fireEvent.click(genreDropdowns[0]);

    const actionOption = await screen.findByText('Action');
    fireEvent.click(actionOption);

    // Instant dispatch should call cachedFetch with with_genres=28 immediately
    await waitFor(() => {
      expect(cachedFetch).toHaveBeenCalledWith(
        expect.stringContaining('with_genres=28')
      );
      expect(screen.getByText('Discovered Action Movie')).toBeTruthy();
    });
  });

  it('preserves existing discovered items during filter transitions without blanking to an empty grid', async () => {
    render(<DiscoverPage />);

    await waitFor(() => {
      expect(screen.getByText('Trending Movie 1')).toBeTruthy();
    });

    // Select Action genre
    const genreDropdowns = screen.getAllByText('All Genres');
    fireEvent.click(genreDropdowns[0]);

    const actionOption = await screen.findByText('Action');
    fireEvent.click(actionOption);

    await waitFor(() => {
      expect(screen.getByText('Discovered Action Movie')).toBeTruthy();
    });

    // Switch sort order: items must NOT blank out before new results arrive
    const sortDropdowns = screen.getAllByText('Most Popular');
    fireEvent.click(sortDropdowns[0]);

    const topRatedOption = await screen.findByText('Top Rated');
    fireEvent.click(topRatedOption);

    // Existing item is still rendered during the transition (no empty state flash)
    expect(screen.queryByText('Discovered Action Movie')).toBeTruthy();
  });
});
