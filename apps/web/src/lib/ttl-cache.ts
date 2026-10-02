/**
 * Tiny in-process TTL cache with in-flight de-duplication.
 *
 * Why not Next's Data Cache (`fetch(..., { next: { revalidate } })`)? It is
 * stale-while-revalidate: once an entry is older than the TTL the next
 * visitor is served the old copy once while it refreshes in the background.
 * For a menu that is wrong at low traffic - the owner changes a price at
 * noon, the first customer at 12:30 still sees yesterday's. This cache never
 * serves data older than `ttlMs`: an expired entry is reloaded before
 * answering, and concurrent requests for the same key share one load.
 *
 * Failures are never cached, so a transient backend error is retried by the
 * next request. Entries live in the memory of one Node process (fine for
 * `output: "standalone"`; each instance warms its own copy).
 */
export interface TtlCache<T> {
  /** Return the cached value for `key`, loading it with `loader` when absent or expired. */
  get(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T>;
  clear(): void;
  size(): number;
}

export interface TtlCacheOptions {
  /** Oldest entries are evicted beyond this size. Default 500. */
  maxEntries?: number;
  /** Clock override for tests. */
  now?: () => number;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export function createTtlCache<T>(options: TtlCacheOptions = {}): TtlCache<T> {
  const maxEntries = options.maxEntries ?? 500;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async get(key, ttlMs, loader) {
      // ttl <= 0 means "caching off": behave exactly like calling the loader.
      if (!(ttlMs > 0)) return loader();

      const hit = entries.get(key);
      if (hit) {
        if (hit.expiresAt > now()) return hit.value;
        entries.delete(key);
      }

      const pending = inflight.get(key);
      if (pending) return pending;

      const load = (async () => {
        try {
          const value = await loader();
          entries.set(key, { value, expiresAt: now() + ttlMs });
          while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            entries.delete(oldest);
          }
          return value;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, load);
      return load;
    },
    clear() {
      entries.clear();
      inflight.clear();
    },
    size() {
      return entries.size;
    },
  };
}
