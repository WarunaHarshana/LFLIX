import { useState, useCallback, useEffect } from 'react';
import { apiUrl } from '@/lib/mobileConfig';

export function useDownloads() {
  const [showDownloads, setShowDownloads] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState(0);

  const fetchActiveDownloads = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/downloads'), { credentials: 'include' });
      if (!res.ok) return;

      const data = await res.json();
      const downloads = Array.isArray(data.downloads) ? data.downloads : [];
      const count = downloads.filter((d: any) => d.status === 'downloading' || d.status === 'paused').length;
      setActiveDownloads(count);
    } catch {
      // Keep existing badge value on transient API failures.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await fetchActiveDownloads();
    };

    void tick();
    const interval = setInterval(tick, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchActiveDownloads]);

  return { activeDownloads, showDownloads, setShowDownloads, fetchDownloads: fetchActiveDownloads };
}
