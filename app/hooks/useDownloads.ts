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
      const count = downloads.filter((d: any) =>
        d.status === 'metadata' || d.status === 'downloading' || d.status === 'stalled' || d.status === 'paused'
      ).length;
      setActiveDownloads(count);
    } catch {
      // Keep existing badge value on transient API failures.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (cancelled) return;
      await fetchActiveDownloads();
    };

    const start = () => {
      if (interval !== null) return;
      // Poll fast while the panel is open, slowly otherwise — the badge only
      // needs to be roughly current, but an open panel shows live progress.
      interval = setInterval(tick, showDownloads ? 3000 : 30000);
    };

    const stop = () => {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    };

    // A background tab has nobody watching, so polling there is pure waste —
    // and on a TV or phone it kept the radio awake indefinitely.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void tick();
        start();
      } else {
        stop();
      }
    };

    void tick();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchActiveDownloads, showDownloads]);

  return { activeDownloads, showDownloads, setShowDownloads, fetchDownloads: fetchActiveDownloads };
}
