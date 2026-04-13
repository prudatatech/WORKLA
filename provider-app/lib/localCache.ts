import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@wl_cache:';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number; // seconds
}

/**
 * Local AsyncStorage Cache — Stale-While-Revalidate Pattern
 * 
 * Shows cached data instantly on app open, then refreshes in the background.
 * This makes the app feel instant even when Supabase/backend is slow or down.
 */
export const localCache = {
    async get<T = any>(key: string): Promise<T | null> {
        try {
            const raw = await AsyncStorage.getItem(PREFIX + key);
            if (!raw) return null;
            const entry: CacheEntry<T> = JSON.parse(raw);
            return entry.data;
        } catch {
            return null;
        }
    },

    async getIfFresh<T = any>(key: string): Promise<T | null> {
        try {
            const raw = await AsyncStorage.getItem(PREFIX + key);
            if (!raw) return null;
            const entry: CacheEntry<T> = JSON.parse(raw);
            const age = (Date.now() - entry.timestamp) / 1000;
            if (age > entry.ttl) return null; // Expired
            return entry.data;
        } catch {
            return null;
        }
    },

    async set(key: string, data: any, ttlSeconds: number = 300): Promise<void> {
        try {
            const entry: CacheEntry<any> = {
                data,
                timestamp: Date.now(),
                ttl: ttlSeconds,
            };
            await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
        } catch {
            // Storage full or unavailable — silently fail
        }
    },

    async remove(key: string): Promise<void> {
        try {
            await AsyncStorage.removeItem(PREFIX + key);
        } catch {}
    },

    /**
     * Stale-While-Revalidate: Returns cached data immediately,
     * then fetches fresh data in the background.
     * 
     * @param key Cache key
     * @param fetcher Async function to get fresh data
     * @param ttl Cache TTL in seconds (default 5 minutes)
     * @param onUpdate Callback when fresh data arrives (to update state)
     */
    async swr<T>(
        key: string,
        fetcher: () => Promise<T | null>,
        ttl: number = 300,
        onUpdate?: (data: T) => void,
    ): Promise<T | null> {
        // 1. Return stale data instantly
        const cached = await localCache.get<T>(key);

        // 2. Fetch fresh data in the background
        (async () => {
            try {
                const fresh = await fetcher();
                if (fresh !== null && fresh !== undefined) {
                    await localCache.set(key, fresh, ttl);
                    if (onUpdate) onUpdate(fresh);
                }
            } catch {
                // Network failed — stale data is better than nothing
            }
        })();

        return cached;
    },
};
