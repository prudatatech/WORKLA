/**
 * Admin API Client
 *
 * Thin wrapper that routes admin mutations through the backend API
 * instead of directly to Supabase. This ensures:
 * - Audit logging of admin actions
 * - Business logic consistency
 * - Rate limiting and authorization
 *
 * Usage:
 *   import { adminApi } from '@/utils/api';
 *   const res = await adminApi.post('/api/v1/admin/services', payload);
 */
import { createClient } from './supabase/client';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_URL = rawApiUrl.trim().replace(/\/$/, '');

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated — please log in again');
  }
  return {
    'Authorization': `Bearer ${session.access_token}`,
  };
}

async function request<T = any>(method: string, path: string, body?: any): Promise<{ data: T | null; error: string | null }> {
  try {
    const authHeaders = await getAuthHeaders();
    const headers: Record<string, string> = { ...authHeaders };
    
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { data: null, error: json.error || json.message || `HTTP ${res.status}` };
    }

    return { data: json.data ?? json, error: null };
  } catch (err: any) {
    console.error(`[adminApi ❌] ${method} ${API_URL}${path} failed:`, err);
    return { data: null, error: err.message || 'Network error' };
  }
}

export const adminApi = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body: any) => request<T>('POST', path, body),
  patch: <T = any>(path: string, body: any) => request<T>('PATCH', path, body),
  put: <T = any>(path: string, body: any) => request<T>('PUT', path, body),
  delete: <T = any>(path: string) => request<T>('DELETE', path),
};
