import { redis } from '../lib/redis';

const DEFAULT_TTL = 300; // 5 minutes

// In-memory map to track active cache miss fetches to prevent Thundering Herd
const inFlightPromises = new Map<string, Promise<any>>();

/**
 * Redis Cache Layer
 * 
 * High-performance caching for frequently accessed data.
 * Uses redis.ts which already has isRedisConnected checks and memory fallback.
 * No extra timeout wrapper needed — redis.ts handles disconnects gracefully.
 */
export const cache = {
    /**
     * Get an item from cache. Returns null on miss.
     */
    async get<T = any>(key: string): Promise<T | null> {
        try {
            const cached = await (redis as any).get(key);
            return cached ? JSON.parse(cached) as T : null;
        } catch (_err) {
            return null;
        }
    },

    /**
     * Set an item in cache with TTL (seconds).
     */
    async set(key: string, value: any, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
        try {
            const strVal = typeof value === 'string' ? value : JSON.stringify(value);
            await (redis as any).setex(key, ttlSeconds, strVal as string);
        } catch (_err) {
            // Silently fail — redis.ts already falls back to memory cache
        }
    },

    /**
     * Delete a specific key from cache.
     */
    async invalidate(key: string): Promise<void> {
        try {
            await (redis as any).del(key);
        } catch (_err) {
            // Silently fail
        }
    },

    /**
     * Delete all keys matching a pattern (e.g., 'services:*').
     */
    async invalidatePattern(pattern: string): Promise<void> {
        try {
            const keys: string[] = (await (redis as any).keys(pattern)) || [];
            if (keys && keys.length > 0) {
                await (redis as any).del(...keys);
            }
        } catch (_err) {
            // Silently fail
        }
    },

    /**
     * Get-or-Set: Returns cached value if exists, otherwise calls fetcher,
     * caches the result, and returns it.
     * Includes Promise deduplication to prevent "Thundering Herd" DDOS.
     */
    async getOrSet<T = any>(key: string, fetcher: () => Promise<T>, ttlSeconds: number = DEFAULT_TTL, forceRefresh: boolean = false): Promise<T> {
        if (!forceRefresh) {
            const cached = await cache.get<T>(key);
            if (cached !== null) {
                return cached;
            }
        }

        // Deduplicate concurrent identical requests
        if (inFlightPromises.has(key)) {
            return inFlightPromises.get(key) as Promise<T>;
        }

        const promise = (async () => {
            try {
                const fresh = await fetcher();
                cache.set(key, fresh, ttlSeconds).catch(() => {});
                return fresh;
            } finally {
                inFlightPromises.delete(key);
            }
        })();

        inFlightPromises.set(key, promise);
        return promise;
    },
};
