/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import EmptyState from '@/app/components/EmptyState';
import GenreFilter from '@/app/components/GenreFilter';
import { normalizeShowNameForMatch } from '@/lib/metadata';
import { validateExistingDirectory } from '@/lib/security';
import fs from 'fs';
import os from 'os';
import path from 'path';

afterEach(() => {
  cleanup();
});

describe('EmptyState Component', () => {
  it('renders no-results message and clear filter button', () => {
    const onClearFilter = vi.fn();
    render(
      <EmptyState
        type="no-results"
        searchQuery="Thriller"
        onClearFilter={onClearFilter}
      />
    );

    expect(screen.getByText('No results found')).toBeTruthy();
    expect(screen.getByText(/No content matches "Thriller"/)).toBeTruthy();

    const clearBtn = screen.getByRole('button', { name: /Clear Filter/i });
    expect(clearBtn).toBeTruthy();

    fireEvent.click(clearBtn);
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it('renders no-results without crashing when onClearFilter is omitted', () => {
    render(<EmptyState type="no-results" searchQuery="Sci-Fi" />);
    expect(screen.getByText('No results found')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Clear Filter/i })).toBeNull();
  });
});

describe('GenreFilter Component', () => {
  it('renders all genres and highlights selected genre', () => {
    const onSelect = vi.fn();
    const genres = ['Action', 'Comedy', 'Drama'];

    render(
      <GenreFilter
        genres={genres}
        selectedGenre="Action"
        onSelect={onSelect}
      />
    );

    const actionBtn = screen.getByRole('button', { name: 'Action' });
    const comedyBtn = screen.getByRole('button', { name: 'Comedy' });

    expect(actionBtn.className).toContain('bg-white');
    expect(comedyBtn.className).not.toContain('bg-white');
  });

  it('toggles genre off when active genre is clicked again', () => {
    const onSelect = vi.fn();
    render(
      <GenreFilter
        genres={['Action', 'Drama']}
        selectedGenre="Action"
        onSelect={onSelect}
      />
    );

    const actionBtn = screen.getByRole('button', { name: 'Action' });
    fireEvent.click(actionBtn);

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('normalizeShowNameForMatch diacritics handling', () => {
  it('normalizes macrons and diacritics in show titles', () => {
    expect(normalizeShowNameForMatch('Shōgun')).toBe('shogun');
    expect(normalizeShowNameForMatch('Pokémon')).toBe('pokemon');
    expect(normalizeShowNameForMatch('Amélie')).toBe('amelie');
    expect(normalizeShowNameForMatch('WALL·E')).toBe('walle');
  });
});

describe('validateExistingDirectory fuzzy space/case matching', () => {
  it('resolves directory when input is missing space matching an existing folder', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'lflix-fuzzy-test-'));
    const realDir = path.join(tmpBase, 'TV Shows');
    fs.mkdirSync(realDir);

    try {
      const typoPath = path.join(tmpBase, 'TVShows');
      const res = validateExistingDirectory(typoPath);
      expect(res.error).toBeNull();
      expect(res.path).toBe(realDir);
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});
