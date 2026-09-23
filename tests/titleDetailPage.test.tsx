/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

vi.mock('capacitor-video-player', () => ({
  CapacitorVideoPlayer: {},
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TitleDetailPage, { type ContentItem } from '@/app/components/TitleDetailPage';
import { invalidateQuery } from '@/lib/clientQueryCache';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  invalidateQuery();
});

beforeEach(() => {
  invalidateQuery();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  // Global fetch mock returning empty json by default
  global.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/tmdb-details')) {
      return new Response(JSON.stringify({
        overview: 'A thrilling space voyage.',
        tagline: 'Mankind was born on Earth.',
        genres: 'Sci-Fi, Adventure',
        runtime: 169,
        releaseDate: '2014-11-07',
        collection: {
          id: 101,
          name: 'Interstellar Universe',
          parts: [
            { tmdbId: 157336, title: 'Interstellar', year: '2014', posterPath: '/interstellar.jpg' },
            { tmdbId: 157337, title: 'Interstellar 2', year: '2026', posterPath: '/interstellar2.jpg' },
          ]
        }
      }));
    }
    if (url.includes('/api/tmdb-collection')) {
      return new Response(JSON.stringify({
        id: 101,
        name: 'Interstellar Universe',
        parts: [
          { tmdbId: 157336, title: 'Interstellar', year: '2014', posterPath: '/interstellar.jpg' },
          { tmdbId: 157337, title: 'Interstellar 2', year: '2026', posterPath: '/interstellar2.jpg' },
        ]
      }));
    }
    if (url.includes('/api/tmdb-credits')) {
      return new Response(JSON.stringify({ cast: [] }));
    }
    if (url.includes('/api/tmdb-similar')) {
      return new Response(JSON.stringify({ results: [] }));
    }
    if (url.includes('/api/auto-track')) {
      return new Response(JSON.stringify({ tracked: [] }));
    }
    if (url.includes('/api/settings')) {
      return new Response(JSON.stringify({ gdriveEnabled: 'true', cloudEnabled: 'true' }));
    }
    return new Response(JSON.stringify({}));
  });
});

describe('TitleDetailPage', () => {
  const localMovie: ContentItem = {
    id: 1,
    type: 'movie',
    title: 'Interstellar',
    year: 2014,
    tmdbId: 157336,
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    overview: 'A team of explorers travel through a wormhole in space.',
    rating: 8.7,
    imdbRating: 8.7,
    resolution: '2160p',
    isHDR: true,
    videoCodec: 'hevc',
    audioCodec: 'truehd',
    audioChannels: '7.1',
  };

  it('renders yellow IMDb badge and colorful media tags', async () => {
    render(
      <TitleDetailPage
        item={localMovie}
        isLocal={true}
        onBack={vi.fn()}
        onPlayLocal={vi.fn()}
      />
    );

    // Check authentic IMDb badge
    const imdbText = screen.getByText(/IMDb/);
    expect(imdbText).toBeTruthy();
    expect(imdbText.closest('span')?.parentElement?.className || imdbText.parentElement?.className).toContain('bg-[#F5C518]');

    // Check media tags (4K blue, HDR yellow, TrueHD, 7.1)
    const fourKTag = screen.getByText('4K');
    expect(fourKTag).toBeTruthy();
    expect(fourKTag.className).toContain('bg-blue-500/20');

    const hdrTag = screen.getByText('HDR');
    expect(hdrTag).toBeTruthy();
    expect(hdrTag.className).toContain('bg-yellow-500/20');
  });

  it('hides download button for local movies and calls onPlayLocal on play click', async () => {
    const onPlayLocal = vi.fn();
    render(
      <TitleDetailPage
        item={localMovie}
        isLocal={true}
        onBack={vi.fn()}
        onPlayLocal={onPlayLocal}
      />
    );

    // Download button must NOT be present for downloaded local movie
    const downloadBtn = screen.queryByRole('button', { name: /download/i });
    expect(downloadBtn).toBeNull();

    // Primary play button calls onPlayLocal
    const playBtn = screen.getByRole('button', { name: /play/i });
    expect(playBtn).toBeTruthy();
    fireEvent.click(playBtn);
    expect(onPlayLocal).toHaveBeenCalledWith(localMovie, undefined, undefined);
  });

  it('renders TV show episode toolbar with destination selector pill and download controls', async () => {
    const tvShow: ContentItem = {
      id: 2,
      type: 'show',
      title: 'Severance',
      year: 2022,
      tmdbId: 95557,
      posterPath: '/severance.jpg',
      backdropPath: '/severance_bg.jpg',
      overview: 'Mark leads a team of office workers whose memories have been surgically divided.',
      rating: 8.7,
      imdbRating: 8.7,
    };

    render(
      <TitleDetailPage
        item={tvShow}
        isLocal={true}
        onBack={vi.fn()}
        onPlayLocal={vi.fn()}
      />
    );

    // Destination selector pill buttons (Local, Drive)
    expect(screen.getByText('Local')).toBeTruthy();
    expect(screen.getByText('Drive')).toBeTruthy();

    // TV episode download buttons
    expect(screen.getByText('Next Episode')).toBeTruthy();
    expect(screen.getByText('Fetch Missing')).toBeTruthy();
  });

  it('renders franchise collection with compact carousel items', async () => {
    render(
      <TitleDetailPage
        item={localMovie}
        isLocal={true}
        onBack={vi.fn()}
        onPlayLocal={vi.fn()}
      />
    );

    // Wait for collection data to populate
    const collectionHeader = await screen.findByText('Interstellar Universe');
    expect(collectionHeader).toBeTruthy();

    const filmCountBadge = screen.getByText('2 Films');
    expect(filmCountBadge).toBeTruthy();

    // Collection parts should be rendered
    const part2 = await screen.findByText('Interstellar 2');
    expect(part2).toBeTruthy();
    // Compact card styling check
    const partCard = part2.closest('div[class*="w-28"]');
    expect(partCard?.className).toContain('w-28');
  });

  it('clicking a non-current collection part routes through discover page card', async () => {
    const onOpenOnline = vi.fn();
    render(
      <TitleDetailPage
        item={localMovie}
        isLocal={true}
        onBack={vi.fn()}
        onPlayLocal={vi.fn()}
        onOpenOnline={onOpenOnline}
      />
    );

    const collectionHeader = await screen.findByText('Interstellar Universe');
    expect(collectionHeader).toBeTruthy();

    const part2 = await screen.findByText('Interstellar 2');
    fireEvent.click(part2);

    expect(onOpenOnline).toHaveBeenCalledWith(
      expect.objectContaining({
        tmdbId: 157337,
        mediaType: 'movie',
        title: 'Interstellar 2'
      })
    );
  });

  it('renders recommended cards with 8-column responsive grid matching home page and routes to discover on click', async () => {
    invalidateQuery();
    const onOpenOnline = vi.fn();
    (global.fetch as any).mockImplementation(async (url: string) => {
      if (url.includes('/api/tmdb-details')) {
        return new Response(JSON.stringify({ overview: 'Details', genres: 'Sci-Fi', runtime: 120 }));
      }
      if (url.includes('/api/tmdb-similar')) {
        return new Response(JSON.stringify({
          results: [
            {
              tmdbId: 286217,
              mediaType: 'movie',
              title: 'The Martian',
              posterPath: '/martian.jpg',
              year: '2015',
              rating: 8.0,
              imdbRating: 8.0
            }
          ]
        }));
      }
      return new Response(JSON.stringify({}));
    });

    render(
      <TitleDetailPage
        item={{ ...localMovie, tmdbId: 999999 }}
        isLocal={true}
        onBack={vi.fn()}
        onPlayLocal={vi.fn()}
        onOpenOnline={onOpenOnline}
      />
    );

    const similarHeader = await screen.findByText('You Might Also Like');
    expect(similarHeader).toBeTruthy();

    // Check grid classes match home page cards layout
    const gridContainer = similarHeader.nextElementSibling;
    expect(gridContainer?.className).toContain('xl:grid-cols-8');
    expect(gridContainer?.className).toContain('gap-4');

    // Click recommended card
    const recommendedItem = await screen.findByText('The Martian');
    expect(recommendedItem).toBeTruthy();
    fireEvent.click(recommendedItem);

    expect(onOpenOnline).toHaveBeenCalledWith(
      expect.objectContaining({
        tmdbId: 286217,
        mediaType: 'movie',
        title: 'The Martian'
      })
    );
  });

  it('collection cards and recommended cards have hover expansion disabled', async () => {
    render(
      <TitleDetailPage
        item={localMovie}
        isLocal={true}
        onBack={vi.fn()}
        onPlayLocal={vi.fn()}
      />
    );

    const collectionHeader = await screen.findByText('Interstellar Universe');
    expect(collectionHeader).toBeTruthy();

    const part2 = await screen.findByText('Interstellar 2');
    // Hover on the collection card
    fireEvent.mouseEnter(part2);

    // Expanded actions (Play, More Info) should NOT be mounted
    expect(screen.queryByRole('button', { name: /more info/i })).toBeNull();
  });

  it('scrolls to top when initialSection is top', () => {
    const scrollToMock = vi.fn();
    window.scrollTo = scrollToMock;

    render(
      <TitleDetailPage
        item={localMovie}
        initialSection="top"
        isLocal={true}
        onBack={vi.fn()}
      />
    );

    expect(scrollToMock).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0, left: 0 })
    );
  });

  it('scrolls to episodes section when initialSection is episodes for a TV show', () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const tvShow: ContentItem = {
      id: 2,
      type: 'show',
      title: 'Severance',
      year: 2022,
      tmdbId: 95557,
      posterPath: '/severance.jpg',
      backdropPath: '/severance_bg.jpg',
      overview: 'Mark leads a team of office workers whose memories have been surgically divided.',
      rating: 8.7,
      imdbRating: 8.7,
    };

    render(
      <TitleDetailPage
        item={tvShow}
        initialSection="episodes"
        isLocal={true}
        onBack={vi.fn()}
      />
    );

    expect(scrollIntoViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth', block: 'start' })
    );
  });

  it('hides watchlist button for local items and shows it for non-local items', () => {
    const { unmount } = render(
      <TitleDetailPage
        item={localMovie}
        isLocal={true}
        onBack={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /watchlist/i })).toBeNull();
    unmount();

    render(
      <TitleDetailPage
        item={{ ...localMovie, filePath: undefined, addedAt: undefined }}
        isLocal={false}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /watchlist/i })).toBeTruthy();
  });
});
