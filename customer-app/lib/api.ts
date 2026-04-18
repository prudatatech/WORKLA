import { supabase } from './supabase';
import { useResilienceStore } from './resilienceStore';

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const API_URL = rawApiUrl.trim().replace(/\/$/, '');

// ── Cached auth session to avoid getSession() on every request ──
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;
let _tokenPromise: Promise<string | null> | null = null;

// ── Simple Request Deduplication ──
const _pendingRequests = new Map<string, Promise<any>>();

async function getCachedToken(): Promise<string | null> {
    const now = Date.now();
    if (_cachedToken && now < _tokenExpiresAt) return _cachedToken;

    if (_tokenPromise) return _tokenPromise;

    _tokenPromise = (async () => {
        try {
            // 🕒 5-second timeout for session retrieval through proxy
            const sessionPromise = supabase.auth.getSession();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth Token Timeout')), 5000));
            
            const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;

            _cachedToken = session?.access_token ?? null;
            _tokenExpiresAt = Date.now() + 4 * 60 * 1000; // cache for 4 minutes
            return _cachedToken;
        } catch (e: any) {
            console.error('[CUSTOMER-API AUTH ERROR]:', e.message || e);
            return null;
        } finally {
            _tokenPromise = null;
        }
    })();

    return _tokenPromise;
}

// Listen for auth state changes to invalidate cache
supabase.auth.onAuthStateChange((_event, session) => {
    _cachedToken = session?.access_token ?? null;
    _tokenExpiresAt = session ? Date.now() + 4 * 60 * 1000 : 0;
});

/**
 * Base API Client for Workla REST Backend
 * Handles auth token injection and common error handling
 */
export async function apiRequest<T = any>(
    path: string,
    options: RequestInit = {}
): Promise<{ data: T | null; error: string | null; isRecovering?: boolean }> {
    try {
        const token = await getCachedToken();

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            ...(options.headers || {}),
        };

        if (token) {
            (headers as any)['Authorization'] = `Bearer ${token}`;
        }

        // 15-second timeout — Railway backends can cold-start in 10+ seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // 🔍 DEBUG: Inspect Proxy Response
        console.log(`[CUSTOMER-PROXY DEBUG] ${path} -> Status: ${response.status}`);
        if (response.status >= 400) {
            const errText = await response.clone().text();
            console.error(`[CUSTOMER-PROXY ERROR] Body: ${errText.substring(0, 200)}`);
        }

        if (response.status === 204) return { data: null, error: null };

        let result;
        const contentType = response.headers.get('content-type');
        const text = await response.text();

        if (contentType && contentType.includes('application/json')) {
            try {
                result = JSON.parse(text);
            } catch (jsonErr) {
                console.error(`[API ❌] JSON Parse Failed for ${path}. Raw: ${text.substring(0, 100)}`);
                return { data: null, error: `Invalid JSON: ${text.substring(0, 50)}` };
            }
        } else {
            console.warn(`[API ⚠️] Non-JSON response for ${path} (${contentType}): ${text.substring(0, 100)}`);
            return { data: null, error: `Server Error (${response.status}): ${text.substring(0, 50)}` };
        }

        if (!response.ok) {
            const is503 = response.status === 503;
            const errorMsg = result?.error || `HTTP Error ${response.status}`;
            const isCircuitOpen = result?.error === 'SERVICE_TEMPORARILY_UNAVAILABLE' || is503;

            if (isCircuitOpen) {
                useResilienceStore.getState().setRecovering(true, errorMsg);
            }

            return {
                data: null,
                error: errorMsg,
                isRecovering: isCircuitOpen,
                ...(result || {}) 
            } as any;
        }

        // 🛡️ Reset resilience store on successful request
        if (useResilienceStore.getState().isRecovering) {
            useResilienceStore.getState().setRecovering(false);
        }

        const data = result.data !== undefined ? result.data : result;
        return { data, error: null };
    } catch (err: any) {
        console.error(`[API ❌] ${API_URL}${path}:`, err);
        return { data: null, error: err.message || 'Network request failed' };
    }
}

export const api = {
    get: <T = any>(path: string, options?: RequestInit) => {
        const key = `GET:${path}`;
        if (_pendingRequests.has(key)) return _pendingRequests.get(key);

        const promise = apiRequest<T>(path, { ...options, method: 'GET' })
            .finally(() => _pendingRequests.delete(key));
        
        _pendingRequests.set(key, promise);
        return promise;
    },

    post: <T = any>(path: string, body: any, options?: RequestInit) =>
        apiRequest<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),

    patch: <T = any>(path: string, body: any, options?: RequestInit) =>
        apiRequest<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),

    delete: <T = any>(path: string, options?: RequestInit) =>
        apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
