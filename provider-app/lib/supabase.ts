import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase Configuration Missing: Check your .env file');
}

// Memory-only storage fallback for when AsyncStorage fails
const MemoryStorage: Record<string, string> = {};

const LargeSecureStore = {
    getItem: async (key: string) => {
        try {
            if (Platform.OS === 'web') {
                return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
            }
            // Check if AsyncStorage is available and not null (legacy storage check)
            const storage = require('@react-native-async-storage/async-storage').default;
            if (storage) {
                return await storage.getItem(key);
            }
            return MemoryStorage[key] || null;
        } catch (e) {
            return MemoryStorage[key] || null;
        }
    },
    setItem: async (key: string, value: string) => {
        try {
            MemoryStorage[key] = value;
            if (Platform.OS === 'web') {
                if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
                return;
            }
            const storage = require('@react-native-async-storage/async-storage').default;
            if (storage) {
                await storage.setItem(key, value);
            }
        } catch (e) {
            // Silently fail as we have memory backup
        }
    },
    removeItem: async (key: string) => {
        try {
            delete MemoryStorage[key];
            if (Platform.OS === 'web') {
                if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
                return;
            }
            const storage = require('@react-native-async-storage/async-storage').default;
            if (storage) {
                await storage.removeItem(key);
            }
        } catch (e) {
            // Silently fail
        }
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: LargeSecureStore,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

AppState.addEventListener('change', (state) => {
    if (state === 'active') {
        supabase.auth.startAutoRefresh();
    } else {
        supabase.auth.stopAutoRefresh();
    }
});

// 🛡️ Global Auth Error Listener to prevent "Refresh Token Not Found" loops
supabase.auth.onAuthStateChange(async (event, session) => {
    console.log(`[AUTH EVENT] ${event}`, session ? 'Session Active' : 'No Session');
    
    if (event === 'TOKEN_REFRESHED') {
        console.log('✅ Token successfully refreshed');
    }

    if (event === 'SIGNED_OUT') {
        // Clear anything that might be stuck in storage
        try {
            await LargeSecureStore.removeItem('supabase.auth.token');
        } catch (e) {
            console.error('Failed to clear stale auth token:', e);
        }
    }
});
