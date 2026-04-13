/**
 * Workla Shared API Client
 * 
 * Unified REST client used by both Customer and Provider apps.
 * Handles JWT injection from Supabase auth and standardized error handling.
 * 
 * Usage:
 *   import { createApiClient } from '@workla/shared';
 *   const api = createApiClient(supabase);
 *   const { data, error } = await api.get('/api/v1/bookings');
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

export type ApiResponse<T = any> = {
    data: T | null;
    error: string | null;
};

async function apiRequest<T = any>(
    supabase: SupabaseClient,
    path: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    try {
        // 1. Get the current JWT session from Supabase
        const { data: { session } } = await supabase.auth.getSession();

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true',
            ...(options.headers || {}),
        };

        // 2. Inject token if available
        if (session?.access_token) {
            (headers as any)['Authorization'] = `Bearer ${session.access_token}`;
        }

        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
        });

        // Handle empty body (204 No Content)
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
            return {
                data: null,
                error: result?.error || `HTTP Error ${response.status}`
            };
        }

        return { data: result.data || result, error: null };
    } catch (err: any) {
        console.error(`[API ❌] ${path}:`, err);
        return { data: null, error: err.message || 'Network request failed' };
    }
}

/**
 * Creates an API client bound to a specific Supabase instance.
 * This allows each app to pass its own supabase client while sharing the logic.
 */
export function createApiClient(supabase: SupabaseClient) {
    return {
        get: <T = any>(path: string, options?: RequestInit) =>
            apiRequest<T>(supabase, path, { ...options, method: 'GET' }),

        post: <T = any>(path: string, body: any, options?: RequestInit) =>
            apiRequest<T>(supabase, path, { ...options, method: 'POST', body: JSON.stringify(body) }),

        patch: <T = any>(path: string, body: any, options?: RequestInit) =>
            apiRequest<T>(supabase, path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),

        delete: <T = any>(path: string, options?: RequestInit) =>
            apiRequest<T>(supabase, path, { ...options, method: 'DELETE' }),
    };
}
