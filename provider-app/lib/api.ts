import { supabase } from './supabase';
import { useResilienceStore } from './resilienceStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// ── Cached auth session to avoid getSession() on every request ──
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;
let _tokenPromise: Promise<string | null> | null = null;

async function getCachedToken(): Promise<string | null> {
    const now = Date.now();
    if (_cachedToken && now < _tokenExpiresAt) return _cachedToken;

    if (_tokenPromise) return _tokenPromise;

    _tokenPromise = (async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            _cachedToken = session?.access_token ?? null;
            _tokenExpiresAt = Date.now() + 4 * 60 * 1000; // cache for 4 minutes
            return _cachedToken;
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
 * Base API Client for Workla REST Backend (Provider App)
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

        // 15-second timeout to prevent infinite hanging while allowing cold starts
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 204) return { data: null, error: null };

        let result;
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            try {
                result = await response.json();
            } catch (jsonErr) {
                const text = await response.text();
                return { data: null, error: `Invalid JSON: ${text.substring(0, 100)}` };
            }
        } else {
            const text = await response.text();
            return { data: null, error: `Server Error (${response.status}): ${text.substring(0, 100)}` };
        }

        if (!response.ok) {
            console.log(`[API ERROR] ${path}:`, result?.error || response.status);
            const is503 = response.status === 503;
            const isCircuitOpen = result?.error === 'SERVICE_TEMPORARILY_UNAVAILABLE' || is503;

            if (isCircuitOpen) {
                useResilienceStore.getState().setRecovering(true, result?.error || `Error ${response.status}`);
            }

            return {
                data: null,
                error: result?.error || `HTTP Error ${response.status}`,
                isRecovering: isCircuitOpen,
                ...(result || {})
            };
        }

        // 🛡️ Reset resilience store on successful request
        if (useResilienceStore.getState().isRecovering) {
            useResilienceStore.getState().setRecovering(false);
        }

        const returnedData = result.data !== undefined ? result.data : result;
        return { data: returnedData, error: null, ...(result || {}) };
    } catch (err: any) {
        console.error(`[API ❌] ${path}:`, err);
        return { data: null, error: err.message || 'Network request failed' };
    }
}

export const api = {
    get: <T = any>(path: string, options?: RequestInit) =>
        apiRequest<T>(path, { ...options, method: 'GET' }),

    post: <T = any>(path: string, body: any, options?: RequestInit) =>
        apiRequest<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),

    patch: <T = any>(path: string, body: any, options?: RequestInit) =>
        apiRequest<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),

    delete: <T = any>(path: string, options?: RequestInit) =>
        apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
