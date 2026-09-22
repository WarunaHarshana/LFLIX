/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WatchlistPage from '@/app/components/WatchlistPage';

const mockWatchlistItems = [
  {
    id: 1,
    tmdbId: 101,
    mediaType: 'movie' as const,
    title: 'Inception',
    posterPath: '/inception.jpg',
    backdropPath: '/inception_bg.jpg',
    overview: 'A dream within a dream.',
    rating: 8.8,
    imdbRating: 8.8,
    year: '2010',
    genres: 'Sci-Fi, Action',
    addedAt: '2026-01-01T12:00:00Z',
    notes: null,
  },
  {
    id: 2,
    tmdbId: 202,
    mediaType: 'tv' as const,
    title: 'Severance',
    posterPath: '/severance.jpg',
    backdropPath: '/severance_bg.jpg',
    overview: 'Work-life balance taken to the extreme.',
    rating: 8.7,
    imdbRating: 8.7,
    year: '2022',
    genres: 'Sci-Fi, Thriller',
    addedAt: '2026-02-01T12:00:00Z',
    notes: null,
  },
  {
    id: 3,
    tmdbId: 303,
    mediaType: 'movie' as const,
    title: 'Dune: Part Two',
    posterPath: '/dune2.jpg',
    backdropPath: '/dune2_bg.jpg',
    overview: 'Paul Atreides unites with Chani and the Fremen.',
    rating: 8.5,
    imdbRating: 8.5,
    year: '2024',
    genres: 'Sci-Fi, Adventure',
    addedAt: '2026-03-01T12:00:00Z',
    notes: null,
  },
];

const mockAvailabilityItems = [
  {
    tmdbId: 303,
    isAvailable: 1,
    bestResult: 'Dune.Part.Two.2024.1080p.WEB-DL',
  },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/watchlist') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: mockWatchlistItems }),
      });
    }
    if (url === '/api/watchlist/track') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: mockAvailabilityItems }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WatchlistPage Component', () => {
  it('renders watchlist title, count badges, and saved items', async () => {
    render(<WatchlistPage libraryTmdbIds={[101]} />);

    await waitFor(() => {
      expect(screen.getByText('Watchlist')).toBeTruthy();
      expect(screen.getByTestId('watchlist-card-1')).toBeTruthy();
      expect(screen.getByTestId('watchlist-card-2')).toBeTruthy();
      expect(screen.getByTestId('watchlist-card-3')).toBeTruthy();
    });

    // Check filter pills
    expect(screen.getByTestId('tab-movie')).toBeTruthy();
    expect(screen.getByTestId('tab-tv')).toBeTruthy();
  });

  it('filters by media type tabs correctly', async () => {
    render(<WatchlistPage libraryTmdbIds={[]} />);

    await waitFor(() => {
      expect(screen.getByTestId('watchlist-card-1')).toBeTruthy();
    });

    // Click TV Shows tab
    const tvTab = screen.getByTestId('tab-tv');
    fireEvent.click(tvTab);

    // Only Severance should be present
    await waitFor(() => {
      expect(screen.getByTestId('watchlist-card-2')).toBeTruthy();
      expect(screen.queryByTestId('watchlist-card-1')).toBeNull();
      expect(screen.queryByTestId('watchlist-card-3')).toBeNull();
    });
  });

  it('filters available downloads correctly', async () => {
    render(<WatchlistPage libraryTmdbIds={[]} />);

    await waitFor(() => {
      expect(screen.getByTestId('watchlist-card-3')).toBeTruthy();
      expect(screen.getByTestId('tab-available')).toBeTruthy();
    });

    // Find and click the Available tab
    const availableTab = screen.getByTestId('tab-available');
    fireEvent.click(availableTab);

    // Only Dune (isAvailable === 1) should be visible
    await waitFor(() => {
      expect(screen.getByTestId('watchlist-card-3')).toBeTruthy();
      expect(screen.queryByTestId('watchlist-card-1')).toBeNull();
      expect(screen.queryByTestId('watchlist-card-2')).toBeNull();
    });
  });

  it('switches between Grid and Compact List views', async () => {
    render(<WatchlistPage libraryTmdbIds={[]} />);

    await waitFor(() => {
      expect(screen.getByTestId('watchlist-card-1')).toBeTruthy();
    });

    const listViewBtn = screen.getByRole('button', { name: /Compact List View/i });
    fireEvent.click(listViewBtn);

    // In list view, compact list items are rendered
    await waitFor(() => {
      expect(screen.getByTestId('watchlist-list-item-1')).toBeTruthy();
      expect(screen.getByTestId('watchlist-list-item-2')).toBeTruthy();
      expect(screen.getByTestId('watchlist-list-item-3')).toBeTruthy();
    });
  });

  it('provides Agency & Forgiveness via undo toast upon removing an item', async () => {
    render(<WatchlistPage libraryTmdbIds={[]} />);

    await waitFor(() => {
      expect(screen.getByTestId('watchlist-card-1')).toBeTruthy();
    });

    // Click remove on Inception
    const removeBtn = screen.getByRole('button', { name: /Remove Inception/i });
    fireEvent.click(removeBtn);

    // Inception card should disappear after exit animation completes
    await waitFor(() => {
      expect(screen.queryByTestId('watchlist-card-1')).toBeNull();
    });

    // Floating Undo toast should appear
    expect(screen.getByText(/Removed/i)).toBeTruthy();
    const undoBtn = screen.getByRole('button', { name: /Undo/i });
    expect(undoBtn).toBeTruthy();

    // Click Undo
    fireEvent.click(undoBtn);

    // Inception should be restored immediately!
    await waitFor(() => {
      expect(screen.getByTestId('watchlist-card-1')).toBeTruthy();
    });
  });
});
