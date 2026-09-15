import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cachedFetch, prefetchQuery, clientQueryCache, invalidateQuery } from '@/lib/clientQueryCache';

describe('clientQueryCache', () => {
  beforeEach(() => {
    clientQueryCache.clear();
    vi.restoreAllMocks();
  });

  it('deduplicates simultaneous in-flight requests for the same URL', async () => {
    let callCount = 0;
    const fakeFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        ok: true,
        json: async () => ({ title: 'Inception', callCount }),
      };
    });
    vi.stubGlobal('fetch', fakeFetch);

    // Call cachedFetch 3 times concurrently
    const [res1, res2, res3] = await Promise.all([
      cachedFetch<{ title: string; callCount: number }>('/api/tmdb-details?id=100&type=movie'),
      cachedFetch<{ title: string; callCount: number }>('/api/tmdb-details?id=100&type=movie'),
      cachedFetch<{ title: string; callCount: number }>('/api/tmdb-details?id=100&type=movie'),
    ]);

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(res1.title).toBe('Inception');
    expect(res2.title).toBe('Inception');
    expect(res3.title).toBe('Inception');
  });

  it('returns cached data for subsequent requests within TTL', async () => {
    const fakeFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ title: 'Interstellar' }),
    }));
    vi.stubGlobal('fetch', fakeFetch);

    const first = await cachedFetch<{ title: string }>('/api/tmdb-details?id=200&type=movie');
    const second = await cachedFetch<{ title: string }>('/api/tmdb-details?id=200&type=movie');

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('prefetches in the background and populates cache', async () => {
    const fakeFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ title: 'The Dark Knight' }),
    }));
    vi.stubGlobal('fetch', fakeFetch);

    prefetchQuery('/api/tmdb-details?id=300&type=movie');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fakeFetch).toHaveBeenCalledTimes(1);

    const res = await cachedFetch<{ title: string }>('/api/tmdb-details?id=300&type=movie');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(res.title).toBe('The Dark Knight');
  });

  it('does not cache failed HTTP requests', async () => {
    const fakeFetch = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    }));
    vi.stubGlobal('fetch', fakeFetch);

    await expect(
      cachedFetch('/api/tmdb-details?id=999&type=movie')
    ).rejects.toThrow('Fetch failed with status 500');

    expect(clientQueryCache.has('GET:/api/tmdb-details?id=999&type=movie')).toBe(false);
  });

  it('normalizes relative URLs so leading slash and apiUrl produce matching cache hits', async () => {
    const fakeFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ name: 'Christopher Nolan' }),
    }));
    vi.stubGlobal('fetch', fakeFetch);

    const res1 = await cachedFetch<{ name: string }>('/api/tmdb-person?id=525');
    const res2 = await cachedFetch<{ name: string }>('/api/tmdb-person?id=525');

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(res1.name).toBe('Christopher Nolan');
    expect(res2.name).toBe('Christopher Nolan');
  });

  it('caches trailer requests and prevents duplicate network dispatches', async () => {
    const fakeFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ key: 'dQw4w9WgXcQ', name: 'Official Trailer' }),
    }));
    vi.stubGlobal('fetch', fakeFetch);

    const [t1, t2] = await Promise.all([
      cachedFetch<{ key: string }>('/api/trailer?tmdbId=157336&mediaType=movie'),
      cachedFetch<{ key: string }>('/api/trailer?tmdbId=157336&mediaType=movie'),
    ]);

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(t1.key).toBe('dQw4w9WgXcQ');
    expect(t2.key).toBe('dQw4w9WgXcQ');
  });

  it('bypasses cache and refetches fresh data when forceFresh is true', async () => {
    let count = 0;
    const fakeFetch = vi.fn().mockImplementation(async () => {
      count++;
      return {
        ok: true,
        json: async () => ({ seasons: [{ season: 1, episodes: count === 1 ? [1, 2] : [1] }] }),
      };
    });
    vi.stubGlobal('fetch', fakeFetch);

    const first = await cachedFetch<any>('/api/episodes?showId=590');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(first.seasons[0].episodes).toEqual([1, 2]);

    // Regular cachedFetch should return cached response
    const cached = await cachedFetch<any>('/api/episodes?showId=590');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(cached.seasons[0].episodes).toEqual([1, 2]);

    // With forceFresh = true, should fetch fresh data from network
    const fresh = await cachedFetch<any>('/api/episodes?showId=590', undefined, undefined, true);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(fresh.seasons[0].episodes).toEqual([1]);
  });

  it('invalidates cache matching URL pattern or string', async () => {
    const fakeFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ title: 'Test' }),
    }));
    vi.stubGlobal('fetch', fakeFetch);

    await cachedFetch('/api/episodes?showId=590');
    await cachedFetch('/api/episodes?showId=600');
    await cachedFetch('/api/tmdb-details?id=100');
    expect(fakeFetch).toHaveBeenCalledTimes(3);

    // Invalidate show 590
    invalidateQuery('/api/episodes?showId=590');

    // Show 590 should refetch
    await cachedFetch('/api/episodes?showId=590');
    expect(fakeFetch).toHaveBeenCalledTimes(4);

    // Show 600 and tmdb should still be cached
    await cachedFetch('/api/episodes?showId=600');
    await cachedFetch('/api/tmdb-details?id=100');
    expect(fakeFetch).toHaveBeenCalledTimes(4);

    // Invalidate all episodes by regex
    invalidateQuery(/\/api\/episodes/);
    await cachedFetch('/api/episodes?showId=600');
    expect(fakeFetch).toHaveBeenCalledTimes(5);
  });
});
