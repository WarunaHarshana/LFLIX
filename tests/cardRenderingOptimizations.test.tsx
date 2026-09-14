/* eslint-disable @next/next/no-img-element */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import ContentCard from '@/app/components/ContentCard';
import LibraryGrid from '@/app/components/LibraryGrid';
import type { ContentItem } from '@/app/types';
import * as queryCacheModule from '@/lib/clientQueryCache';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Mock Next.js Image component cleanly without passing non-DOM props to <img>
vi.mock('next/image', () => ({
  default: (props: {
    src?: string;
    alt?: string;
    className?: string;
    fill?: boolean;
    priority?: boolean;
  }) => {
    return (
      <img
        src={props.src}
        alt={props.alt || ''}
        className={props.className}
        data-fill={props.fill ? "true" : undefined}
        data-priority={props.priority ? "true" : undefined}
      />
    );
  },
}));

// Mock haptics
vi.mock('@/lib/haptics', () => ({
  triggerHaptic: vi.fn(),
}));

const mockMovie: ContentItem = {
  id: 101,
  type: 'movie',
  title: 'Interstellar',
  posterPath: '/interstellar-poster.jpg',
  backdropPath: '/interstellar-backdrop.jpg',
  overview: 'A team of explorers travel through a wormhole in space.',
  rating: 8.7,
  year: 2014,
  filePath: 'Interstellar.2014.2160p.HDR.Remux.mkv',
  resolution: '2160p',
  isHDR: true,
  watchProgress: {
    progress: 50,
    duration: 100,
    completed: 0,
  },
};

const mockMovie2: ContentItem = {
  id: 102,
  type: 'movie',
  title: 'Inception',
  posterPath: '/inception-poster.jpg',
  backdropPath: '/inception-backdrop.jpg',
  overview: 'A thief steals corporate secrets through the use of dream-sharing technology.',
  rating: 8.8,
  year: 2010,
  filePath: 'Inception.2010.1080p.mkv',
  resolution: '1080p',
  isHDR: false,
};

describe('ContentCard Optimizations', () => {
  it('does NOT mount the expanded card or w780 backdrop image when resting (lazy-mounted)', () => {
    const onClick = vi.fn();
    render(
      <ContentCard
        item={mockMovie}
        onClick={onClick}
        isExpanded={false}
      />
    );

    // The resting poster image should exist
    const images = screen.getAllByRole('img');
    // Only 1 image rendered in resting card (the poster)
    expect(images.length).toBe(1);
    expect(images[0].getAttribute('src')).toContain('interstellar-poster.jpg');

    // The expanded action buttons (Play, More Info) should NOT be in the DOM
    expect(screen.queryByRole('button', { name: /more info/i })).toBeNull();
  });

  it('mounts the expanded card and backdrop image when isExpanded is true', () => {
    const onClick = vi.fn();
    render(
      <ContentCard
        item={mockMovie}
        onClick={onClick}
        isExpanded={true}
      />
    );

    // The expanded action buttons should now be mounted
    expect(screen.getByRole('button', { name: /more info/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();

    // Backdrop image is mounted
    const images = screen.getAllByRole('img');
    const backdrop = images.find(img => img.getAttribute('src')?.includes('interstellar-backdrop.jpg'));
    expect(backdrop).toBeTruthy();
  });

  it('micro format tags, watched badge, and progress bar do NOT have backdrop-blur', () => {
    const { container } = render(
      <ContentCard
        item={{
          ...mockMovie,
          watchProgress: { progress: 100, duration: 100, completed: 1 },
        }}
        onClick={vi.fn()}
        isExpanded={false}
      />
    );

    // Format tags
    const badges = container.querySelectorAll('.text-\\[10px\\]');
    badges.forEach(badge => {
      expect(badge.className).not.toContain('backdrop-blur');
    });

    // Watched badge
    const watchedBadge = screen.getByText('✓ Watched');
    expect(watchedBadge.className).not.toContain('backdrop-blur');
    expect(watchedBadge.className).toContain('bg-emerald-950/90');

    // Progress bar container (when rendered with progress)
    const progressBar = container.querySelector('.h-1\\.5');
    if (progressBar) {
      expect(progressBar.className).not.toContain('backdrop-blur');
      expect(progressBar.className).toContain('bg-black/75');
    }
  });

  it('prefetches TMDB details on pointer enter', () => {
    const prefetchSpy = vi.spyOn(queryCacheModule, 'prefetchQuery').mockImplementation(() => {});

    const { container } = render(
      <ContentCard
        item={mockMovie}
        onClick={vi.fn()}
        isExpanded={false}
      />
    );

    const card = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(card);

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/tmdb-details?id=101&type=movie')
    );
  });

  it('cancels pending hover timer when mouse leaves before 300ms threshold', async () => {
    vi.useFakeTimers();
    const onHoverChange = vi.fn();

    const { container } = render(
      <ContentCard
        item={mockMovie}
        onClick={vi.fn()}
        onHoverChange={onHoverChange}
      />
    );

    const card = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(card);

    // Leave after 100ms (before 300ms threshold)
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(card);

    // Advance past the 300ms threshold
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Hover state should never have been set to true
    expect(onHoverChange).not.toHaveBeenCalledWith(true);
    vi.useRealTimers();
  });
});

describe('LibraryGrid Decoupled Hover & content-visibility', () => {
  it('renders grid cards with content-visibility: auto containment when not hovered', () => {
    const items = [mockMovie, mockMovie2];
    const { container } = render(
      <LibraryGrid
        filteredLibrary={items}
        activeTab="movie"
        selectedGenre={null}
        sortBy="added"
        onSortChange={vi.fn()}
        onGenreClear={vi.fn()}
        focusedIndex={-1}
        displayPrefs={{ showTitles: true, showRatings: true, cinematicMode: false, gridColumns: 8 }}
        onCardClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    const gridItems = container.querySelectorAll('.col-span-1');
    expect(gridItems.length).toBe(2);

    // Both resting cards have content-visibility: auto applied
    gridItems.forEach((gridItem) => {
      expect(gridItem.className).toContain('[content-visibility:auto]');
      expect(gridItem.className).toContain('[contain-intrinsic-size:auto_200px_auto_300px]');
    });
  });

  it('correctly assigns horizontalOrigin to the last column in multi-column rows', () => {
    // 4 items in a 4-column layout
    const items: ContentItem[] = [
      { ...mockMovie, id: 1, title: 'Item 1' },
      { ...mockMovie, id: 2, title: 'Item 2' },
      { ...mockMovie, id: 3, title: 'Item 3' },
      { ...mockMovie, id: 4, title: 'Item 4' },
    ];

    const { container } = render(
      <LibraryGrid
        filteredLibrary={items}
        activeTab="movie"
        selectedGenre={null}
        sortBy="added"
        onSortChange={vi.fn()}
        onGenreClear={vi.fn()}
        focusedIndex={-1}
        displayPrefs={{ showTitles: true, showRatings: true, cinematicMode: false, gridColumns: 4 }}
        onCardClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    const gridItems = container.querySelectorAll('.col-span-1');
    expect(gridItems.length).toBe(4);
  });

  it('does not misidentify items as the last column when filtered items are fewer than row width', () => {
    // 2 items in an 8-column layout
    const items: ContentItem[] = [
      { ...mockMovie, id: 1, title: 'Item 1' },
      { ...mockMovie, id: 2, title: 'Item 2' },
    ];

    const { container } = render(
      <LibraryGrid
        filteredLibrary={items}
        activeTab="movie"
        selectedGenre={null}
        sortBy="added"
        onSortChange={vi.fn()}
        onGenreClear={vi.fn()}
        focusedIndex={-1}
        displayPrefs={{ showTitles: true, showRatings: true, cinematicMode: false, gridColumns: 8 }}
        onCardClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    const gridItems = container.querySelectorAll('.col-span-1');
    expect(gridItems.length).toBe(2);
  });
});
