import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

    if (!supabaseUrl || !supabaseAnonKey) {
        return {} as any; // Return dummy client to prevent crash
    }

    return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
