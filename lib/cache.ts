type CacheEntry<T> = {
  data: T;
  expiresAt: number;
  lastAccessed: number;
};

export class MemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private inflight = new Map<string, Promise<T>>();
  private defaultTTL: number;
  private maxEntries: number;

  constructor(defaultTTLMinutes: number = 30, maxEntries: number = 500) {
    this.defaultTTL = defaultTTLMinutes * 60 * 1000;
    this.maxEntries = maxEntries;
  }

  set(key: string, data: T, ttlMs?: number) {
    this.pruneExpired();
    this.evictIfNeeded();

    const expiresAt = Date.now() + (ttlMs || this.defaultTTL);
    this.cache.set(key, { data, expiresAt, lastAccessed: Date.now() });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    item.lastAccessed = Date.now();
    this.cache.delete(key);
    this.cache.set(key, item);

    return item.data;
  }

  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number,
    shouldCache: (data: T) => boolean = (data) => data !== null && data !== undefined
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = factory()
      .then((data) => {
        if (shouldCache(data)) {
          this.set(key, data, ttlMs);
        }
        return data;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }

  clear() {
    this.cache.clear();
    this.inflight.clear();
  }

  size() {
    return this.cache.size;
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [key, item] of this.cache) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  private evictIfNeeded() {
    while (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.cache.delete(oldestKey);
    }
  }
}

// Global instance for TMDB/metadata requests, capped so repeated searches do not grow memory forever.
export const tmdbCache = new MemoryCache<unknown>(30, 750);
