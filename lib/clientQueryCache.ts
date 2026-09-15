import { MemoryCache } from './cache';
import { apiUrl } from './mobileConfig';

/**
 * Client-side query cache with Promise deduplication and LRU eviction.
 * Default 30-minute TTL, capped at 1000 entries to prevent memory bloat.
 */
export const clientQueryCache = new MemoryCache<unknown>(30, 1000);

/**
 * Fetches JSON from a URL with automatic caching and in-flight Promise deduplication.
 * If multiple callers request the same URL simultaneously, only a single network
 * request is dispatched and all callers receive the resolved value.
 */
export async function cachedFetch<T = unknown>(
  url: string,
  options?: RequestInit,
  ttlMs?: number,
  forceFresh?: boolean
): Promise<T> {
  const resolvedUrl = url.startsWith('/') ? apiUrl(url) : url;
  const method = (options?.method || 'GET').toUpperCase();

  // Only cache GET requests
  if (method !== 'GET') {
    const res = await fetch(resolvedUrl, options);
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  const cacheKey = `GET:${resolvedUrl}`;
  if (forceFresh) {
    clientQueryCache.delete(cacheKey);
  }

  return clientQueryCache.getOrSet(
    cacheKey,
    async () => {
      const res = await fetch(resolvedUrl, options);
      if (!res.ok) {
        throw new Error(`Fetch failed with status ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    ttlMs,
    (data) => data !== null && data !== undefined
  ) as Promise<T>;
}

/**
 * Invalidates cache entries matching a URL string, substring, or regular expression.
 * If no argument is provided, the entire cache is cleared.
 */
export function invalidateQuery(urlOrPattern?: string | RegExp): void {
  if (!urlOrPattern) {
    clientQueryCache.clear();
    return;
  }
  if (typeof urlOrPattern === 'string') {
    clientQueryCache.deleteMatching((key) => key.includes(urlOrPattern));
  } else {
    clientQueryCache.deleteMatching((key) => urlOrPattern.test(key));
  }
}

/**
 * Fire-and-forget prefetch helper for pointer enter / hover anticipation.
 * Rejections are caught silently so prefetching never interrupts the UI.
 */
export function prefetchQuery(url: string, options?: RequestInit): void {
  void cachedFetch(url, options).catch(() => {
    // Ignore prefetch failures silently
  });
}
