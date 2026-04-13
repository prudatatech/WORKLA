import IORedis from 'ioredis';
import { config } from './config';

const REDIS_URL = config.REDIS_URL;

/**
 * ⚡ Redis Client — Real ioredis with Graceful Fallback
 * 
 * Connects to the actual Redis instance. If Redis is down,
 * silently falls back to an in-memory Map so the server never crashes.
 */

let isRedisConnected = false;
const memoryCache = new Map<string, { value: string; expiry: number }>();

// Create real ioredis client
const isTls = REDIS_URL.startsWith('rediss://');

const ioRedisClient = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // Allow unlimited retries for pending commands while reconnecting
    retryStrategy(times: number) {
        // Retry indefinitely with exponential backoff capped at 2 seconds
        return Math.min(times * 200, 2000);
    },
    tls: isTls ? { rejectUnauthorized: false } : undefined,
    lazyConnect: false,
    enableReadyCheck: true,
    connectTimeout: config.REDIS_TIMEOUT_MS,
    // NOTE: commandTimeout intentionally removed — ioredis emits commandTimeout
    // errors through an internal path that bypasses .on('error') listeners,
    // causing [ioredis] Unhandled error event crashes. enableOfflineQueue: false
    // already provides instant command failure when Redis is disconnected.
    enableOfflineQueue: false,               // Fail immediately if disconnected so we use memory fallback
});

ioRedisClient.on('ready', () => {
    isRedisConnected = true;
    console.warn('✅ Redis ready to handle commands at', REDIS_URL);
});

ioRedisClient.on('error', (err) => {
    if (isRedisConnected) {
        console.warn('⚠️ Redis connection lost, falling back to memory cache:', err.message);
    }
    isRedisConnected = false;
});

ioRedisClient.on('close', () => {
    if (isRedisConnected) {
        console.warn('⚠️ Redis connection closed.');
    }
    isRedisConnected = false;
});

ioRedisClient.on('reconnecting', () => {
    console.warn('🔄 Reconnecting to Redis...');
});

// ── In-Memory Fallback Helpers ──────────────────────────

function memGet(key: string): string | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        memoryCache.delete(key);
        return null;
    }
    return entry.value;
}

function memSet(key: string, value: string, ttl: number) {
    memoryCache.set(key, { value, expiry: Date.now() + ttl * 1000 });
}

// ── Unified Redis Interface ────────────────────────────

export const redis = {
    async get(key: string): Promise<string | null> {
        if (isRedisConnected) {
            try { return await ioRedisClient.get(key); } catch { /* fallback */ }
        }
        return memGet(key);
    },

    async set(key: string, value: string, ...args: any[]): Promise<string> {
        if (isRedisConnected) {
            try { return await (ioRedisClient.set as any)(key, value, ...args); } catch { /* fallback */ }
        }
        memSet(key, value, 300);
        return "OK";
    },

    async setex(key: string, ttl: number, value: string): Promise<string> {
        if (isRedisConnected) {
            try { return await ioRedisClient.setex(key, ttl, value); } catch { /* fallback */ }
        }
        memSet(key, value, ttl);
        return "OK";
    },

    async del(...keys: string[]): Promise<number> {
        if (isRedisConnected) {
            try { return await ioRedisClient.del(...keys); } catch { /* fallback */ }
        }
        keys.forEach(k => memoryCache.delete(k));
        return keys.length;
    },

    async keys(pattern: string): Promise<string[]> {
        if (isRedisConnected) {
            try { return await ioRedisClient.keys(pattern); } catch { /* fallback */ }
        }
        // Simple pattern matching for memory fallback
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return Array.from(memoryCache.keys()).filter(k => regex.test(k));
    },

    async publish(channel: string, message: string): Promise<number> {
        if (isRedisConnected) {
            try { return await ioRedisClient.publish(channel, message); } catch { /* fallback */ }
        }
        return 0;
    },

    async ping(): Promise<string> {
        if (isRedisConnected) {
            try { return await ioRedisClient.ping(); } catch { return 'ERROR'; }
        }
        return 'MEMORY_FALLBACK';
    },

    // Passthrough for libraries that need the raw client
    get status() { return isRedisConnected ? 'ready' : 'memory_fallback'; },
    get connected() { return isRedisConnected; },
    get raw() { return ioRedisClient; },
    options: {},
    on: function () { return this; },
    once: function () { return this; },
    removeListener: function () { return this; },
    duplicate: function () { return ioRedisClient.duplicate(); },
    // Lazy singleton subscriber client shared across all topics.
    // IMPORTANT: commandTimeout must NOT be set (or set to undefined) — in ioredis,
    // commandTimeout: 0 means "timeout immediately" (0ms), NOT "no timeout".
    // enableOfflineQueue: true allows XREADGROUP BLOCK commands to wait in queue
    // while the connection is temporarily down instead of failing instantly.
    _subscriberClient: null as IORedis | null,
    getSubscriber: function () {
        if (!config.REDIS_URL || config.REDIS_URL.includes('localhost')) {
            return { on: () => {}, once: () => {}, subscribe: () => {}, unsubscribe: () => {} } as any;
        }
        if (this._subscriberClient) return this._subscriberClient;
        const sub = new IORedis(REDIS_URL, {
            maxRetriesPerRequest: null,
            retryStrategy(times: number) {
                return Math.min(times * 500, 5000);
            },
            tls: isTls ? { rejectUnauthorized: false } : undefined,
            lazyConnect: false,
            enableReadyCheck: true,
            connectTimeout: config.REDIS_TIMEOUT_MS,
            // commandTimeout intentionally omitted — 0 would mean "timeout instantly"
            enableOfflineQueue: true, // Queue commands during reconnect so BLOCK calls survive
        });
        sub.on('error', (err) => {
            console.warn('[RedisBus Subscriber ⚠️] Connection warning (auto-reconnecting):', err.message);
        });
        sub.on('ready', () => {
            console.warn('[RedisBus Subscriber ✅] Subscriber connection ready.');
        });
        this._subscriberClient = sub;
        return sub;
    },
    createSubscriber: function () {
        return this.getSubscriber();
    },
    subscribe: async () => "OK",
    unsubscribe: async () => "OK",
    quit: async () => { await ioRedisClient.quit(); return "OK"; },
} as any;

export default class Redis {
    constructor() { return redis; }
}
