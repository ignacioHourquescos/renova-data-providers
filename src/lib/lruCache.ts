type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

/** LRU simple con TTL. Map mantiene el orden de inserción. */
export class LruCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly max: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest == null) break;
      this.map.delete(oldest);
    }
  }
}
