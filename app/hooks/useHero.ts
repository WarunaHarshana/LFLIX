import { useState, useEffect } from 'react';
import { apiUrl } from '@/lib/mobileConfig';
import type { ContentItem } from '@/app/types';

export function useHero(filteredLibrary: ContentItem[]) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroLogoPaths, setHeroLogoPaths] = useState<Record<string, string | null>>({});

  // Hero candidates: top 5 items with backdrops
  const heroCandidates = filteredLibrary.filter(item => item.backdropPath).slice(0, 5);
  if (heroCandidates.length === 0 && filteredLibrary.length > 0) heroCandidates.push(filteredLibrary[0]);
  const featured = heroCandidates[heroIndex % Math.max(heroCandidates.length, 1)] || filteredLibrary[0];
  const featuredLogoKey = featured?.tmdbId ? `${featured.type}-${featured.tmdbId}` : null;
  const featuredLogoPath = featuredLogoKey ? heroLogoPaths[featuredLogoKey] : null;
  const featuredLogoUrl = featuredLogoPath ? `https://image.tmdb.org/t/p/w500${featuredLogoPath}` : null;

  // Auto-rotate hero every 8 seconds
  useEffect(() => {
    if (heroCandidates.length <= 1) return;
    const timer = setInterval(() => setHeroIndex(i => i + 1), 8000);
    return () => clearInterval(timer);
  }, [heroCandidates.length]);

  // Fetch logo for featured item
  useEffect(() => {
    if (!featured?.tmdbId) return;

    const cacheKey = `${featured.type}-${featured.tmdbId}`;
    if (cacheKey in heroLogoPaths) return;

    let cancelled = false;

    const fetchLogo = async () => {
      try {
        const mediaType = featured.type === 'show' ? 'tv' : 'movie';
        const res = await fetch(apiUrl(`/api/tmdb-details?id=${featured.tmdbId}&type=${mediaType}`), { credentials: 'same-origin' });
        if (!res.ok || cancelled) return;

        const data = await res.json();
        const logoPath = data.logoPath || null;

        if (!cancelled) {
          setHeroLogoPaths((prev) => ({ ...prev, [cacheKey]: logoPath }));
        }
      } catch {
        if (!cancelled) {
          setHeroLogoPaths((prev) => ({ ...prev, [cacheKey]: null }));
        }
      }
    };

    void fetchLogo();

    return () => {
      cancelled = true;
    };
  }, [featured?.tmdbId, featured?.type, heroLogoPaths]);

  return {
    heroIndex, setHeroIndex,
    heroCandidates,
    featured,
    featuredLogoUrl,
  };
}
