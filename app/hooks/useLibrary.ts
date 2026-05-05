import { useState, useCallback, useEffect } from 'react';
import { apiUrl } from '@/lib/mobileConfig';
import type { ContentItem } from '@/app/types';

export function useLibrary(showToast: (message: string, type: 'success' | 'error') => void) {
  const [library, setLibrary] = useState<ContentItem[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'added' | 'title-asc' | 'title-desc' | 'year-new' | 'year-old' | 'rating'>('added');

  // Display preferences from localStorage
  const [displayPrefs, setDisplayPrefs] = useState({ showTitles: true, showRatings: true, cinematicMode: false });
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lflix-display-prefs');
      if (saved) setDisplayPrefs(JSON.parse(saved));
    } catch {}
  }, []);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/content'), { credentials: 'include' });
      const data = await res.json();
      if (data.content) {
        setLibrary(data.content);
        setGenres(data.genres || []);
      } else if (Array.isArray(data)) {
        setLibrary(data);
      }
    } catch (error: any) {
      console.warn('Failed to load library:', error.message || error);
      showToast('Failed to load library', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleScan = async (folderPath: string) => {
    const res = await fetch(apiUrl('/api/scan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ folderPath })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Scan failed');
    }

    showToast(`Added ${data.added} items to library`, 'success');
    await fetchLibrary();
  };

  // Filter + sort library based on active tab
  const getFilteredLibrary = useCallback((activeTab: string) => {
    return library.filter(item => {
      const matchesTab = activeTab === 'all' || item.type === activeTab;
      const matchesGenre = !selectedGenre || (item.genres && item.genres.includes(selectedGenre));
      return matchesTab && matchesGenre;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'title-asc':
          return a.title.localeCompare(b.title);
        case 'title-desc':
          return b.title.localeCompare(a.title);
        case 'year-new':
          return (b.year || 0) - (a.year || 0);
        case 'year-old':
          return (a.year || 0) - (b.year || 0);
        case 'rating':
          return ((b.imdbRating ?? b.rating) || 0) - ((a.imdbRating ?? a.rating) || 0);
        case 'added':
        default:
          return new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime();
      }
    });
  }, [library, selectedGenre, sortBy]);

  return {
    library, genres, loading, setLoading,
    selectedGenre, setSelectedGenre,
    sortBy, setSortBy,
    displayPrefs,
    fetchLibrary, handleScan, getFilteredLibrary,
  };
}
