export class MemoryCache<T> {
  private cache = new Map<string, { data: T; expiresAt: number }>();
  private defaultTTL: number;

  constructor(defaultTTLMinutes: number = 30) {
    this.defaultTTL = defaultTTLMinutes * 60 * 1000;
  }

  set(key: string, data: T, ttlMs?: number) {
    const expiresAt = Date.now() + (ttlMs || this.defaultTTL);
    this.cache.set(key, { data, expiresAt });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  clear() {
    this.cache.clear();
  }
}

// Global instance for TMDB requests, 30 minute cache
export const tmdbCache = new MemoryCache<any>(30);
