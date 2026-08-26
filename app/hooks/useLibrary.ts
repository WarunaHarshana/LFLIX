import { useState, useCallback, useEffect } from 'react';
import { apiUrl } from '@/lib/mobileConfig';
import type { ContentItem } from '@/app/types';

export function useLibrary(showToast: (message: string, type: 'success' | 'error') => void) {
  const [library, setLibrary] = useState<ContentItem[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'added' | 'title-asc' | 'title-desc' | 'year-new' | 'year-old' | 'rating' | 'language-asc' | 'language-desc'>('added');

  // Display preferences from localStorage
  const [displayPrefs, setDisplayPrefs] = useState<{
    showTitles: boolean;
    showRatings: boolean;
    cinematicMode: boolean;
    gridColumns?: number;
  }>({ showTitles: true, showRatings: true, cinematicMode: false, gridColumns: 8 });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lflix-display-prefs');
      if (saved) {
        const parsed = JSON.parse(saved);
        setDisplayPrefs(prev => ({ ...prev, ...parsed, gridColumns: parsed.gridColumns || 8 }));
      }
    } catch {}
  }, []);

  const updateDisplayPref = useCallback((key: string, value: any) => {
    setDisplayPrefs(prev => {
      const updated = { ...prev, [key]: value };
      try {
        localStorage.setItem('lflix-display-prefs', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/content'), { credentials: 'include' });
      const data = await res.json();
      if (data.content) {
        setLibrary(data.content);
        setGenres(data.genres || []);
        setLanguages(data.languages || []);
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

  // Helper to get reliable year number for both movies and TV shows
  const getItemYear = (item: ContentItem): number => {
    if (typeof item.year === 'number' && !isNaN(item.year) && item.year > 0) {
      return item.year;
    }
    if (item.firstAirDate) {
      const parsed = parseInt(item.firstAirDate.substring(0, 4), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 0;
  };

  // Filter + sort library based on active tab
  const getFilteredLibrary = useCallback((activeTab: string) => {
    return library.filter(item => {
      const matchesTab = activeTab === 'all' || item.type === activeTab;
      const matchesGenre = !selectedGenre || (item.genres && item.genres.includes(selectedGenre));
      const matchesLanguage = !selectedLanguage || item.language === selectedLanguage;
      return matchesTab && matchesGenre && matchesLanguage;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'title-asc':
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
        case 'title-desc':
          return b.title.localeCompare(a.title, undefined, { sensitivity: 'base', numeric: true });
        case 'year-new': {
          const yearDiff = getItemYear(b) - getItemYear(a);
          if (yearDiff !== 0) return yearDiff;
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
        }
        case 'year-old': {
          const yearDiff = getItemYear(a) - getItemYear(b);
          if (yearDiff !== 0) return yearDiff;
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
        }
        case 'rating': {
          const ratingA = (a.imdbRating ?? a.rating) || 0;
          const ratingB = (b.imdbRating ?? b.rating) || 0;
          const ratingDiff = ratingB - ratingA;
          if (ratingDiff !== 0) return ratingDiff;
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
        }
        case 'language-asc': {
          const langA = a.language || 'Unknown';
          const langB = b.language || 'Unknown';
          const langDiff = langA.localeCompare(langB, undefined, { sensitivity: 'base' });
          if (langDiff !== 0) return langDiff;
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
        }
        case 'language-desc': {
          const langA = a.language || 'Unknown';
          const langB = b.language || 'Unknown';
          const langDiff = langB.localeCompare(langA, undefined, { sensitivity: 'base' });
          if (langDiff !== 0) return langDiff;
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
        }
        case 'added':
        default: {
          const timeA = new Date(a.addedAt || 0).getTime();
          const timeB = new Date(b.addedAt || 0).getTime();
          const timeDiff = timeB - timeA;
          if (timeDiff !== 0) return timeDiff;
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
        }
      }
    });
  }, [library, selectedGenre, selectedLanguage, sortBy]);

  return {
    library, genres, languages, loading, setLoading,
    selectedGenre, setSelectedGenre,
    selectedLanguage, setSelectedLanguage,
    sortBy, setSortBy,
    displayPrefs, updateDisplayPref,
    fetchLibrary, handleScan, getFilteredLibrary,
  };
}
