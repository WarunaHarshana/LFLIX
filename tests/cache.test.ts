import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '@/lib/cache';

describe('MemoryCache', () => {
  it('stores and returns a value', () => {
    const cache = new MemoryCache<string>();
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
  });

  it('returns null for an unknown key', () => {
    expect(new MemoryCache<string>().get('missing')).toBeNull();
  });

  it('expires entries once the TTL passes', () => {
    vi.useFakeTimers();
    try {
      const cache = new MemoryCache<string>();
      cache.set('k', 'v', 1000);

      vi.advanceTimersByTime(999);
      expect(cache.get('k')).toBe('v');

      vi.advanceTimersByTime(2);
      expect(cache.get('k')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the least recently used entry when full', () => {
    const cache = new MemoryCache<string>(30, 2);
    cache.set('a', '1');
    cache.set('b', '2');

    // Touch "a" so "b" becomes the eviction candidate.
    expect(cache.get('a')).toBe('1');

    cache.set('c', '3');
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).toBe('1');
    expect(cache.get('c')).toBe('3');
  });

  it('honours the max entry cap', () => {
    const cache = new MemoryCache<number>(30, 3);
    for (let i = 0; i < 10; i++) cache.set(`k${i}`, i);
    expect(cache.size()).toBeLessThanOrEqual(3);
  });

  it('clear() drops everything', () => {
    const cache = new MemoryCache<string>();
    cache.set('k', 'v');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('k')).toBeNull();
  });

  describe('getOrSet', () => {
    it('invokes the factory once and caches the result', async () => {
      const cache = new MemoryCache<string>();
      const factory = vi.fn().mockResolvedValue('computed');

      expect(await cache.getOrSet('k', factory)).toBe('computed');
      expect(await cache.getOrSet('k', factory)).toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('dedupes concurrent callers into a single in-flight request', async () => {
      const cache = new MemoryCache<string>();
      let resolveFactory: (v: string) => void = () => {};
      const factory = vi.fn(() => new Promise<string>((resolve) => { resolveFactory = resolve; }));

      const all = Promise.all([
        cache.getOrSet('k', factory),
        cache.getOrSet('k', factory),
        cache.getOrSet('k', factory),
      ]);
      resolveFactory('once');

      expect(await all).toEqual(['once', 'once', 'once']);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('does not cache values rejected by shouldCache', async () => {
      const cache = new MemoryCache<string | null>();
      const factory = vi.fn().mockResolvedValue(null);

      await cache.getOrSet('k', factory, undefined, (data) => data !== null);
      await cache.getOrSet('k', factory, undefined, (data) => data !== null);

      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('clears the in-flight entry when the factory rejects, so a retry can run', async () => {
      const cache = new MemoryCache<string>();
      const factory = vi.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('recovered');

      await expect(cache.getOrSet('k', factory)).rejects.toThrow('boom');
      expect(await cache.getOrSet('k', factory)).toBe('recovered');
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });
});
