import { useState, useCallback } from 'react';
import { apiUrl } from '@/lib/mobileConfig';
import type { ContinueItem } from '@/app/types';

export function useContinueWatching() {
  const [continueWatching, setContinueWatching] = useState<ContinueItem[]>([]);

  const fetchContinueWatching = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/history'), { credentials: 'include' });
      const data = await res.json();
      setContinueWatching(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.warn('Failed to load continue watching:', e.message || e);
    }
  }, []);

  return { continueWatching, fetchContinueWatching };
}
