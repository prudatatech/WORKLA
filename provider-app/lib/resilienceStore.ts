import { create } from 'zustand';

interface ResilienceState {
    isRecovering: boolean;
    lastError: string | null;
    setRecovering: (recovering: boolean, error?: string | null) => void;
}

/**
 * 🛡️ Global Resilience Store (Provider App)
 * Tracks backend "Circuit Breaker" status to show user-friendly
 * recovery banners.
 */
export const useResilienceStore = create<ResilienceState>((set) => ({
    isRecovering: false,
    lastError: null,

    setRecovering: (recovering, error = null) => {
        set({ isRecovering: recovering, lastError: error });
        
        if (recovering) {
            setTimeout(() => {
                set((state) => ({ isRecovering: false }));
            }, 30000);
        }
    },
}));
